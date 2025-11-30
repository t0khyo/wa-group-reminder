import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import db from "../db/database.js";
import MessageParser from "../utils/parser.js";
import OpenAI from "openai";
import dotenv from "dotenv";

class ReminderService {
  constructor() {
    this.sock = null;
    this.botId = null;
    this.config = {
      checkIntervalSeconds: 30,
      authPath: "./auth_info",
    };

    dotenv.config();

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.warn("Warning: OPENAI_API_KEY not set — AI replies disabled.");
      this.openai = null;
    } else {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
  }

  // NEW: Very small helper that asks OpenAI for a one-line reply
  async aiOneLineReply(userMessage) {
    // defensive: ensure client exists
    if (!this.openai) throw new Error("OpenAI client not configured");

    const system = `You are a concise WhatsApp assistant. Reply in exactly one short line, no line breaks. Be helpful and friendly.`;
    const user = `User: ${userMessage}`;

    const resp = await this.openai.chat.completions.create({
      model: "gpt-4o-mini", // change model if desired
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 64,
      temperature: 0.0,
    });

    const content = resp?.choices?.[0]?.message?.content ?? "";
    // flatten to one line and trim
    return content.replace(/\s*\n+\s*/g, " ").trim();
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(
      this.config.authPath
    );

    this.sock = makeWASocket({ auth: state });
    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", this.handleConnection.bind(this));
    this.sock.ev.on("messages.upsert", this.handleMessages.bind(this));
  }

  handleConnection(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Scan QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n  Settings → Linked Devices → Link a Device\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;

      if (shouldReconnect) {
        console.log("Connection lost, reconnecting...\n");
        this.start();
      } else {
        console.log("Logged out. Restart to reconnect.\n");
      }
    } else if (connection === "open") {
      this.botId = this.sock.user.id;
      console.log("Connected successfully 🚀!\n");
      console.log("Bot ID:", this.botId);
      console.log("Reminder checker started (every 30s)\n");
      console.log("Bot is ready! Waiting for mentions...\n");
      this.startReminderChecker();
    }
  }

  async handleMessages({ messages }) {
    const msg = messages[0];
    if (!msg.message) return;

    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith("@g.us");

    if (!isGroup) return;

    const senderId = msg.key.participant || chatId;
    const text = MessageParser.getMessageText(msg.message);

    if (!MessageParser.isBotMentioned(msg.message, this.botId)) return;

    console.log("New mention, Group:", chatId.split("@")[0]);
    console.log(
      "  │ Message:",
      text.substring(0, 50) + (text.length > 50 ? "..." : "")
    );

    const lowerText = text.toLowerCase();

    // NEW: If user starts message body with "ai " -> use OpenAI one-line reply
    // Example: "@bot ai what's the plan for tomorrow?"
    if (lowerText.includes("ai ")) {
      if (!this.openai) {
        await this.sock.sendMessage(chatId, {
          text: "AI reply is disabled (OPENAI_API_KEY not set).",
        });
        return;
      }
      try {
        const userMessage = text
          .slice(text.toLowerCase().indexOf("ai ") + 3)
          .trim();
        const aiReply = await this.aiOneLineReply(userMessage);
        await this.sock.sendMessage(chatId, { text: aiReply });
      } catch (err) {
        console.error("AI reply error:", err);
        await this.sock.sendMessage(chatId, {
          text: "Sorry, I couldn't process that with AI right now.",
        });
      }
      console.log("");
      return; // do not run regular reminder logic for this message
    }

    // if (lowerText.includes("cancel")) {
    //   await this.handleCancel(chatId, senderId);
    // } else if (lowerText.includes("list")) {
    //   await this.handleList(chatId, senderId);
    // } else if (lowerText.includes("help")) {
    //   await this.handleHelp(chatId);
    // } else {
    //   await this.handleCreateReminder(chatId, senderId, text);
    // }

    console.log("");
  }

  async handleCreateReminder(chatId, senderId, text) {
    const parsed = MessageParser.parse(text);

    if (!parsed.success) {
      console.log("Parse error:", parsed.error.split("\n")[0]);
      await this.sock.sendMessage(chatId, { text: parsed.error });
      return;
    }

    const reminderId = db.createReminder(
      chatId,
      senderId,
      parsed.title,
      parsed.meetingTime
    );

    const formattedDateTime = MessageParser.formatDateTime(parsed.meetingTime);

    const message = `Reminder created ✅

📌 ${parsed.title}
🕒 ${formattedDateTime}

🔔 You'll receive reminders:
- 24 hours before
- 1 hour before`;

    await this.sock.sendMessage(chatId, { text: message });

    console.log("Reminder created: ID:", reminderId);
    console.log("Title:", parsed.title);
    console.log("Time:", formattedDateTime);
  }

  async handleCancel(chatId, senderId) {
    const cancelled = db.cancelLastReminder(chatId, senderId);

    if (cancelled) {
      console.log("Reminder cancelled");
    } else {
      console.log("No reminders to cancel");
    }

    const message = cancelled
      ? "Your last reminder has been cancelled ✅"
      : "No active reminders found to cancel ❌";

    await this.sock.sendMessage(chatId, { text: message });
  }

  async handleList(chatId, senderId) {
    const reminders = db.getUserReminders(chatId, senderId);

    console.log("List requested:", reminders.length, "reminders");

    if (reminders.length === 0) {
      await this.sock.sendMessage(chatId, {
        text: "You have no active reminders 📋",
      });
      return;
    }

    let message = "Your active reminders:\n\n";

    reminders.forEach((r, index) => {
      const time = new Date(r.meeting_time);
      const formatted = time.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      message += `${index + 1}. ${r.title}\n   ⏳ ${formatted}\n\n`;
    });

    await this.sock.sendMessage(chatId, { text: message });
  }

  async handleHelp(chatId) {
    console.log("Help requested");

    const helpMessage = `📝 *How to use WhatsApp Reminder Bot:*

*Create Reminder:*
@bot
Reminder title
date and time (e.g., "next Monday 9am" or "22 Dec 2025 7:30pm")

*Other Commands:*
- @bot list - Show your reminders
- @bot cancel - Cancel last reminder
- @bot help - Show this message

*Examples:*
@bot
Team standup
Monday 9am

@bot
Project kickoff
22 Dec 2025 7:30pm

> made with ♡ by Abdelrahman Eltokhy
`;

    await this.sock.sendMessage(chatId, { text: helpMessage });
  }

  startReminderChecker() {
    const intervalMs = this.config.checkIntervalSeconds * 1000;

    setInterval(async () => {
      await this.checkAndSendReminders();
    }, intervalMs);
  }

  async checkAndSendReminders() {
    const reminders24h = db.getRemindersFor24h();
    for (const reminder of reminders24h) {
      await this.send24hReminder(reminder);
    }

    const reminders1h = db.getRemindersFor1h();
    for (const reminder of reminders1h) {
      await this.send1hReminder(reminder);
    }
  }

  async send24hReminder(reminder) {
    try {
      const time = new Date(reminder.meeting_time);
      const formatted = MessageParser.formatDateTime(time);

      const message = `Reminder: Tomorrow! ⏰

📌 *Title:* ${reminder.title}  
🕒 *Time:* ${formatted}
> @${reminder.sender_id.split("@")[0]}`;

      await this.sock.sendMessage(reminder.group_id, {
        text: message,
        mentions: [reminder.sender_id],
      });
      db.mark24hSent(reminder.id);

      console.log("Sent 24h reminder:", reminder.title);
    } catch (err) {
      console.error("Failed to send 24h reminder:", err.message);
    }
  }

  async send1hReminder(reminder) {
    try {
      const time = new Date(reminder.meeting_time);
      const formatted = time.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const message = `*Reminder: In 1 hour!*  

📌 *Title:* ${reminder.title}  
🕒 *Time:* ${formatted}
> @${reminder.sender_id.split("@")[0]}`;

      await this.sock.sendMessage(reminder.group_id, {
        text: message,
        mentions: [reminder.sender_id],
      });
      db.mark1hSent(reminder.id);

      console.log("Sent 1h reminder:", reminder.title);
    } catch (err) {
      console.error("Failed to send 1h reminder:", err.message);
    }
  }
}

export default ReminderService;
