import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import logger from "../utils/logger.js";
import { AiService } from "./aiService.js";

class WhatsappService {
  constructor() {
    this.webSocket = null;
    this.botName = null;
    this.botJid = null;
    this.botLid = null;
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

      // auto-detect bot IDs from creds
      this.webSocket.ev.on("creds.update", (creds) => {
        if (!creds?.me) return;

        const rawId = creds.me.jid || "";
        const rawLid = creds.me.id || "";
        const name = creds.me.name || this.botName || "Gigi";

        // normalize by removing :<deviceIndex>
        this.botJid = rawId.replace(/:\d+@/, "@");
        this.botLid = rawLid.replace(/:\d+@/, "@");
        this.botName = name;

        logger.info(`Bot JID set: ${this.botJid}`);
        logger.info(`Bot LID set: ${this.botLid}`);
        logger.info(`Bot name set: ${this.botName}`);
      });

      return this.sock;
    } catch (err) {
      logger.error("WaService failed to start:", err?.message || err);
      throw err;
    }
  }

  handleConnection(update) {
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
      this.botId = this.webSocket.user.jid;
      logger.info("Connected to WhatsApp successfully 🚀");
      logger.info(
        `Bot LID: ${this.botLid}, JID: ${this.botJid}, Name: ${this.botName}`
      );
      logger.info("Bot is ready! Waiting for mentions...");
      return;
    }
  }

  async handleMessages({ messages }) {
    const msg = messages[0];
    if (!msg.message) {
      logger.info("Received message has no content, skipping.");
      return;
    }

    const chatId = msg.key.remoteJid;
    const senderId = msg.key.participant || chatId;

    const text = this.extractText(msg.message);
    logger.info(
      `Incoming message from: ${senderId}, chat: ${chatId}, Extracted message text:'${text}'`
    );

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

    const reply = await this.aiService.generateReply(text);
    await this.sendMessage(chatId, { text: reply });
    logger.info(`Sent AI-generated reply to chat ${chatId}`);
  }

  extractText(message) {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage) return message.extendedTextMessage.text;
    return "";
  }

  isBotMentioned(message) {
    const mentionedJids =
      message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    logger.info(`Mentioned JIDs in this message: ${mentionedJids}`);
    const mentioned =
      mentionedJids.includes(this.botJid) ||
      mentionedJids.includes(this.botLid);
    return mentioned;
  }

  sendMessage(chatId, content) {
    return this.webSocket.sendMessage(chatId, content);
  }
}

export const whatsappService = new WhatsappService();
