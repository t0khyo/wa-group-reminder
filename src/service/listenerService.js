import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
// import { aiParseAndAct } from "../modules/ai.js";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
dotenv.config();

export class ListenerService {
  constructor() {
    this.webSocket = null;
    this.botName = null;
    this.botJid = null;
    this.botLid = null;
  }

  async start(authPath = "./auth_info") {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    this.webSocket = makeWASocket({ auth: state });

    this.webSocket.ev.on("creds.update", saveCreds);
    this.webSocket.ev.on("connection.update", this.handleConnection.bind(this));
    this.webSocket.ev.on("messages.upsert", this.handleMessages.bind(this));

    // this.webSocket.ev.process(async (events) => {
    //   logger.info("RAW EVENT:");
    //   logger.info(JSON.stringify(events, null, 2));
    // });

    this.webSocket.ev.on("creds.update", (creds) => {
      if (creds.me) {
        const rawId = creds.me.id;
        const rawLid = creds.me.lid;
        const botName = creds.me.name || "Gigi";

        // Normalize (remove :<deviceId>)
        this.botJid = rawId.replace(/:\d+@/, "@");
        this.botLid = rawLid.replace(/:\d+@/, "@");

        this.botName = botName;
        logger.info(`Bot JID set: ${this.botJid}`);
        logger.info(`Bot LID set: ${this.botLid}`);
        logger.info(`Bot name set: ${this.botName}`);
      }
    });
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
      this.botId = this.webSocket.user.id;
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
    logger.info(`Extracted message text: "${text}"`);

    const mentioned = this.isBotMentioned(msg);
    if (mentioned) {
      logger.info(`Bot was mentioned in chat ${chatId} by ${senderId}`);
    } else {
      logger.info(`Bot was NOT mentioned in chat ${chatId} by ${senderId}`);
    }

    const mentionedJids =
      msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentionedJids.length > 0) {
      logger.info(
        `Mentioned JIDs in this message: ${mentionedJids.join(", ")}`
      );
    }

    // Pass message to AI service if needed
    // const aiResponse = await aiParseAndAct(chatId, senderId, text);
    // if (aiResponse) await this.sock.sendMessage(chatId, { text: aiResponse });
  }

  extractText(message) {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage) return message.extendedTextMessage.text;
    return "";
  }

  isBotMentioned(message) {
    const mentionedJids =
      message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const mentioned =
      mentionedJids.includes(this.botJid) ||
      mentionedJids.includes(this.botLid);
    return mentioned;
  }
}
