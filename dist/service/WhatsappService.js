import makeWASocket, { DisconnectReason, useMultiFileAuthState, } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import logger from "../utils/logger.js";
import { AiService } from "./AiService.js";
import { RateLimiter } from "../utils/RateLimiter.js";
export class WhatsappService {
    constructor(aiService, authPath = "./auth_info") {
        this.socket = null;
        this.botIdentity = {
            jid: null,
            lid: null,
            name: "Gigi",
        };
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 5;
        this.RECONNECT_DELAY_MS = 5000;
        this.aiService = aiService || new AiService();
        this.authPath = authPath;
        this.rateLimiter = new RateLimiter(10, 60000); // 10 messages per minute per user
    }
    /**
     * Start the WhatsApp service and establish connection
     */
    async start(authPath) {
        if (authPath) {
            this.authPath = authPath;
        }
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            this.socket = makeWASocket({
                auth: state,
                printQRInTerminal: false, // We handle QR display manually
                defaultQueryTimeoutMs: 60000,
            });
            this.setupEventHandlers(saveCreds);
            return this.socket;
        }
        catch (error) {
            logger.error("Failed to start WhatsApp service:", error);
            throw error;
        }
    }
    /**
     * Setup all event handlers
     */
    setupEventHandlers(saveCreds) {
        if (!this.socket)
            return;
        // Save credentials on update
        this.socket.ev.on("creds.update", async () => {
            await saveCreds();
            this.handleCredsUpdate();
        });
        // Handle connection state changes
        this.socket.ev.on("connection.update", this.handleConnectionUpdate.bind(this));
        // Handle incoming messages
        this.socket.ev.on("messages.upsert", this.handleMessagesUpsert.bind(this));
        // Handle message updates (read receipts, edits, etc.)
        this.socket.ev.on("messages.update", (updates) => {
            logger.debug("Messages updated:", updates);
        });
        // Handle group updates
        this.socket.ev.on("groups.update", (groups) => {
            logger.debug("Groups updated:", groups);
        });
    }
    /**
     * Handle credentials update to extract bot identity
     */
    handleCredsUpdate() {
        if (!this.socket?.authState?.creds?.me)
            return;
        const me = this.socket.authState.creds.me;
        // Normalize JID/LID by removing device index
        const normalizeJid = (jid) => jid.replace(/:\d+@/, "@");
        this.botIdentity = {
            jid: me.id ? normalizeJid(me.id) : null,
            lid: me.lid ? normalizeJid(me.lid) : null,
            name: me.name || this.botIdentity.name,
            phoneNumber: me.phoneNumber,
        };
        logger.info("Bot identity updated:", {
            jid: this.botIdentity.jid,
            lid: this.botIdentity.lid,
            name: this.botIdentity.name,
        });
    }
    /**
     * Handle connection state updates
     */
    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        // Display QR code for pairing
        if (qr) {
            logger.info("📱 QR Code generated. Please scan with WhatsApp:");
            qrcode.generate(qr, { small: true });
            logger.info("💡 Go to: WhatsApp → Settings → Linked Devices → Link a Device");
        }
        // Handle connection close
        if (connection === "close") {
            this.isConnected = false;
            this.handleDisconnect(lastDisconnect);
            return;
        }
        // Handle successful connection
        if (connection === "open") {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            // Update bot identity from user info
            if (this.socket?.user?.id) {
                this.botIdentity.jid = this.socket.user.id;
            }
            logger.info("✅ Connected to WhatsApp successfully!");
            logger.info("🤖 Bot Identity:", this.botIdentity);
            logger.info("👂 Bot is ready and listening for mentions...");
        }
    }
    /**
     * Handle disconnection and implement reconnect logic
     */
    handleDisconnect(lastDisconnect) {
        const shouldReconnect = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            : true;
        if (!shouldReconnect) {
            logger.error("❌ Session logged out. Please restart and re-authenticate.");
            return;
        }
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            logger.error(`❌ Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
            return;
        }
        this.reconnectAttempts++;
        const delay = this.RECONNECT_DELAY_MS * this.reconnectAttempts;
        logger.warn(`⚠️ Connection closed. Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
            this.start().catch((err) => {
                logger.error("Failed to reconnect:", err);
            });
        }, delay);
    }
    /**
     * Handle incoming messages
     */
    async handleMessagesUpsert({ messages, type, }) {
        for (const msg of messages) {
            try {
                await this.processMessage(msg);
            }
            catch (error) {
                logger.error("Error processing message:", error);
                // Continue processing other messages even if one fails
            }
        }
    }
    /**
     * Process a single message
     */
    async processMessage(msg) {
        // Ignore messages without content
        if (!msg.message) {
            logger.debug("Received message without content, skipping.");
            return;
        }
        // Extract message context
        const context = this.extractMessageContext(msg);
        logger.info(`📨 Message from ${context.senderId} in ${context.chatId}${context.isGroup ? " (group)" : ""}`);
        logger.debug(`Message text: "${context.text}"`);
        // Check if this is a reply to bot's message
        const isReplyToBot = this.isBotRepliedTo(msg);
        if (isReplyToBot) {
            logger.info("💬 User replied to bot's message");
        }
        // Handle ping command
        if (context.text.includes("/ping")) {
            await this.sendMessage(context.chatId, { text: "🏓 Pong!" });
            return;
        }
        // Check if bot is mentioned or replied to
        const isMentioned = this.isBotMentioned(msg);
        if (!isMentioned && !isReplyToBot) {
            logger.debug("Bot not mentioned or replied to, skipping message.");
            return;
        }
        // Rate limiting check
        if (!this.rateLimiter.tryConsume(context.senderId)) {
            logger.warn(`⚠️ Rate limit exceeded for user ${context.senderId}`);
            await this.sendMessage(context.chatId, {
                text: "⏳ Please slow down! You're sending too many messages.",
            });
            return;
        }
        // Send typing indicator
        await this.sendTypingIndicator(context.chatId, true);
        try {
            // Generate AI response with conversation context
            const reply = await this.aiService.generateReply(context.text, context.chatId);
            // Send reply
            await this.sendMessage(context.chatId, { text: reply });
            logger.info(`✅ Sent AI reply to ${context.chatId}`);
        }
        catch (error) {
            logger.error("Error generating AI reply:", error);
            // Send error message to user
            await this.sendMessage(context.chatId, {
                text: "❌ Sorry, I encountered an error processing your request. Please try again.",
            });
        }
        finally {
            // Stop typing indicator
            await this.sendTypingIndicator(context.chatId, false);
        }
    }
    /**
     * Extract message context and metadata
     */
    extractMessageContext(msg) {
        const chatId = msg.key.remoteJid;
        const senderId = msg.key.participant || chatId;
        const isGroup = chatId.endsWith("@g.us");
        // Extract text from various message types
        const rawText = this.extractText(msg.message);
        const text = rawText.toLowerCase().trim();
        // Extract quoted message if exists
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || undefined;
        // Extract mentioned JIDs
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        return {
            chatId,
            senderId,
            isGroup,
            text,
            rawText,
            quotedMessage,
            mentionedJids,
        };
    }
    /**
     * Extract text content from various message types
     */
    extractText(message) {
        // Try different message types in order of priority
        return (message.conversation ||
            message.extendedTextMessage?.text ||
            message.imageMessage?.caption ||
            message.videoMessage?.caption ||
            message.documentMessage?.caption ||
            message.buttonsResponseMessage?.selectedButtonId ||
            message.listResponseMessage?.singleSelectReply?.selectedRowId ||
            "");
    }
    /**
     * Check if bot is mentioned in the message
     */
    isBotMentioned(msg) {
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJids.length === 0) {
            return false;
        }
        const isMentioned = mentionedJids.includes(this.botIdentity.jid) ||
            mentionedJids.includes(this.botIdentity.lid);
        if (isMentioned) {
            logger.debug(`Bot mentioned via JID: ${mentionedJids.join(", ")}`);
        }
        return isMentioned;
    }
    /**
     * Check if the message is a reply to bot's message
     */
    isBotRepliedTo(msg) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return false;
        }
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        // Check if quoted message is from bot
        const isFromBot = quotedParticipant === this.botIdentity.jid ||
            quotedParticipant === this.botIdentity.lid;
        if (isFromBot) {
            logger.debug("Message is a reply to bot's previous message");
        }
        return isFromBot;
    }
    /**
     * Send a message to a chat
     */
    async sendMessage(chatId, content) {
        if (!this.socket) {
            throw new Error("WhatsApp socket not initialized");
        }
        if (!this.isConnected) {
            throw new Error("WhatsApp not connected");
        }
        try {
            return await this.socket.sendMessage(chatId, content);
        }
        catch (error) {
            logger.error(`Failed to send message to ${chatId}:`, error);
            throw error;
        }
    }
    /**
     * Send typing indicator
     */
    async sendTypingIndicator(chatId, isTyping) {
        if (!this.socket || !this.isConnected)
            return;
        try {
            await this.socket.sendPresenceUpdate(isTyping ? "composing" : "paused", chatId);
        }
        catch (error) {
            logger.debug("Failed to send typing indicator:", error);
            // Non-critical error, don't throw
        }
    }
    /**
     * Send read receipt
     */
    async markAsRead(chatId, messageKeys) {
        if (!this.socket || !this.isConnected)
            return;
        try {
            await this.socket.readMessages(messageKeys);
        }
        catch (error) {
            logger.debug("Failed to mark messages as read:", error);
        }
    }
    /**
     * Get bot identity information
     */
    getBotIdentity() {
        return { ...this.botIdentity };
    }
    /**
     * Check if the service is connected
     */
    isServiceConnected() {
        return this.isConnected;
    }
    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        if (this.socket) {
            logger.info("Disconnecting WhatsApp service...");
            await this.socket.logout();
            this.socket = null;
            this.isConnected = false;
            logger.info("WhatsApp service disconnected");
        }
    }
    /**
     * Get socket instance (for advanced operations)
     */
    getSocket() {
        return this.socket;
    }
}
// Export as class (not singleton) for better testability
export default WhatsappService;
