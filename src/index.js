import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";

async function startBot() {
  // Set up authentication
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  // Create the WhatsApp connection
  const sock = makeWASocket({
    auth: state,
  });

  // Save login info when it updates
  sock.ev.on("creds.update", saveCreds);

  // Handle connection status changes AND QR code
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // NEW: Handle QR code manually
    if (qr) {
      console.log("\n📱 Scan this QR code with WhatsApp:\n");

      // Generate QR code in terminal using qrcode-terminal
      const qrcode = require("qrcode-terminal");
      qrcode.generate(qr, { small: true });

      console.log(
        "\nGo to WhatsApp → Settings → Linked Devices → Link a Device\n"
      );
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;

      if (shouldReconnect) {
        console.log("Connection lost. Reconnecting...");
        startBot();
      } else {
        console.log("Logged out. Delete auth_info folder and restart.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot is connected and ready!");
    }
  });

  // Listen for incoming messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg.message) return;

    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith("@g.us");

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    console.log("---");
    console.log("From:", chatId);
    console.log("Is Group:", isGroup);
    console.log("Message:", text);

    // Respond to "hello bot"
    if (isGroup && text.toLowerCase().includes("hello bot")) {
      console.log("Sent hello response!");
    }

    // Respond to "!ping"
    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(chatId, {
        text: "Pong 🏓",
      });
    }

    if (text === "ارحب") {
      await sock.sendMessage(chatId, {
        text: "ارحب تراحيب المطر",
      });
    }

    // Echo command
    if (text.toLowerCase().startsWith("!echo ")) {
      const echoMessage = text.substring(6);
      await sock.sendMessage(chatId, {
        text: `${echoMessage}`,
      });
    }
  });
}

// Start the bot
console.log("Starting WhatsApp Bot...");
startBot().catch((err) => console.error("Error:", err));
