import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import logger from "../utils/logger.js";
import { AiService } from "../service/AiService.js";

type MessageContent = {
  text?: string;
  [key: string]: any;
};

type IncomingMessage = {
  key: {
    remoteJid?: string;
    participant?: string;
  };
  message?: any;
};

class WhatsappService {
  private webSocket: WASocket | null = null;
  private botName: string | null = null;
  private botJid: string | null | undefined = null;
  private botLid: string | null = null;
  private aiService: AiService;
  private authPath: string = "./auth_info";

  constructor() {
    this.aiService = new AiService();
  }

  async start(authPath = "./auth_info") {
    this.authPath = authPath;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

      this.webSocket = makeWASocket({ auth: state });

      // persist creds
      this.webSocket.ev.on("creds.update", saveCreds);

      // internal handlers
      this.webSocket.ev.on(
        "connection.update",
        this.handleConnection.bind(this)
      );

      this.webSocket.ev.on("messages.upsert", this.handleMessages.bind(this));
      this.webSocket.ev.on("messages.update", (m) =>
        logger.info(`Messages updated: ${JSON.stringify(m)}`)
      );

      this.webSocket.ev.on("messages.upsert", (m) =>
        logger.info(`Messages upserted: ${JSON.stringify(m)}`)
      );

      // auto-detect bot IDs from creds
      this.webSocket.ev.on("creds.update", (creds) => {
        if (!creds?.me) return;

        const rawJid = creds.me.id || "";
        const rawLid = creds.me.id || "";
        const name = creds.me.name || this.botName || "Gigi";

        logger.info(
          `creds.me detected: ID=${creds.me.id}, LID=${creds.me.lid}, Name=${creds.me.name}, phone=${creds.me.phoneNumber}`
        );

        // normalize by removing :<deviceIndex>
        this.botJid = rawJid.replace(/:\d+@/, "@");
        this.botLid = rawLid.replace(/:\d+@/, "@");
        this.botName = name;

        logger.info(`Bot JID set: ${this.botJid}`);
        logger.info(`Bot LID set: ${this.botLid}`);
        logger.info(`Bot name set: ${this.botName}`);
      });

      return this.webSocket;
    } catch (err: any) {
      logger.error("WaService failed to start:", err?.message || err);
      throw err;
    }
  }

  handleConnection(update: any) {
    const { connection, lastDisconnect, qr } = update;

    // QR Code
    if (qr) {
      logger.info("QR code generated. Scan it from WhatsApp mobile app.");
      qrcode.generate(qr, { small: true });
      logger.info("Go to WhatsApp → Settings → Linked Devices → Link a Device");
    }

    // Connection closed
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;

      if (shouldReconnect) {
        logger.error("Connection closed. Attempting to reconnect...");
        this.start();
      } else {
        logger.error("Session logged out. Please restart to reconnect.");
      }
      return;
    }

    // Connection opened
    if (connection === "open") {
      this.botJid = this.webSocket?.user?.id;
      logger.info("Connected to WhatsApp successfully 🚀");
      logger.info(
        `Bot LID: ${this.botLid}, JID: ${this.botJid}, Name: ${this.botName}`
      );
      logger.info("Bot is ready! Waiting for mentions...");
      return;
    }
  }

  async handleMessages({ messages }: any) {
    const msg = messages[0];
    if (!msg.message) {
      logger.info("Received message has no content, skipping.");
      return;
    }

    const chatId = msg.key.remoteJid!;
    const senderId = msg.key.participant || chatId;
    const isGroup = chatId.endsWith("@g.us");

    const text = this.extractText(msg.message);
    logger.info(
      `Incoming message from: ${senderId}, chat: ${chatId}, Extracted message text:'${text}'`
    );

    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      logger.info("Message reply detected.");
    }

    const userMessage = (
      msg.message?.conversation?.trim() ||
      msg.message?.extendedTextMessage?.text?.trim() ||
      msg.message?.imageMessage?.caption?.trim() ||
      msg.message?.videoMessage?.caption?.trim() ||
      msg.message?.buttonsResponseMessage?.selectedButtonId?.trim() ||
      ""
    )
      .toLowerCase()
      .replace(/\.\s+/g, ".")
      .trim();

    // Preserve raw message for commands like .tag that need original casing
    const rawText =
      msg.message?.conversation?.trim() ||
      msg.message?.extendedTextMessage?.text?.trim() ||
      msg.message?.imageMessage?.caption?.trim() ||
      msg.message?.videoMessage?.caption?.trim() ||
      "";

    // Only log command usage
    if (userMessage.startsWith(".")) {
      console.log(
        `📝 Command used in ${isGroup ? "group" : "private"}: ${userMessage}`
      );
    }

    if (text.includes("/ping")) {
      await this.sendMessage(chatId, { text: "pong 🏓" });
      logger.info(`Replied with pong 🏓 to chat ${chatId}`);
      return;
    }

    const mentioned = this.isBotMentioned(msg);
    if (!mentioned) {
      logger.info(`Bot wasn't mentioned skipping message.`);
      return;
    }

    const mentionedJids =
      msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentionedJids.length > 0) {
      logger.info(`Mentioned JIDs in this message: ${mentionedJids}`);
    }

    // Use chatId as the unique identifier for conversation history
    const reply = await this.aiService.generateReply(text, chatId);
    await this.sendMessage(chatId, { text: reply });
    logger.info(`Sent AI-generated reply to chat ${chatId}`);
  }

  extractText(message: any) {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage) return message.extendedTextMessage.text;
    return "";
  }

  isBotMentioned(message: any) {
    const mentionedJids =
      message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    logger.info(`Mentioned JIDs in this message: ${mentionedJids}`);
    const mentioned =
      mentionedJids.includes(this.botJid) ||
      mentionedJids.includes(this.botLid);
    return mentioned;
  }

  sendMessage(chatId: string, content: any) {
    if (!this.webSocket) throw new Error("WebSocket not initialized");
    return this.webSocket.sendMessage(chatId, content);
  }
}

export const whatsappService = new WhatsappService();
