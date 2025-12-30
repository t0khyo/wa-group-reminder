import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  WAMessage,
  proto,
  ConnectionState,
  Browsers,
  cleanMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import logger from "../utils/logger.js";
import { AiService } from "./AiService.js";
import { RateLimiter } from "../utils/RateLimiter.js";
import fs from "fs";
import { CommandRegistry } from "../commands/CommandRegistry.js";
import { HelpCommand } from "../commands/HelpCommand.js";
import { MyTasksCommand } from "../commands/MyTasksCommand.js";
import { MyRemindersCommand } from "../commands/MyRemindersCommand.js";
import { AllTasksCommand } from "../commands/AllTasksCommand.js";
import { AllRemindersCommand } from "../commands/AllRemindersCommand.js";
import { RecentTasksCommand } from "../commands/RecentTasksCommand.js";
import { RecentRemindersCommand } from "../commands/RecentRemindersCommand.js";
import { ClearHistoryCommand } from "../commands/ClearHistoryCommand.js";
import { TaskDigestCommand } from "../commands/TaskDigestCommand.js";
import {
  MessageContent,
  BotIdentity,
  MessageContext,
} from "../types/index.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";



export class WhatsappService {
  private socket: WASocket | null = null;
  private botIdentity: BotIdentity = {
    jid: null,
    lid: null,
    name: "Gigi",
  };
  private authPath: string;
  private aiService: AiService;
  private rateLimiter: RateLimiter;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY_MS = 5000;
  private commandRegistry: CommandRegistry;

  constructor(aiService?: AiService, authPath: string = "./auth_info") {
    this.aiService = aiService || new AiService();
    this.authPath = authPath;
    this.rateLimiter = new RateLimiter(10, 60000); // 10 messages per minute per user
    this.commandRegistry = new CommandRegistry();
    this.commandRegistry.register(new HelpCommand());
    this.commandRegistry.register(new MyTasksCommand());
    this.commandRegistry.register(new MyRemindersCommand());
    this.commandRegistry.register(new AllTasksCommand());
    this.commandRegistry.register(new AllRemindersCommand());
    this.commandRegistry.register(new RecentTasksCommand());
    this.commandRegistry.register(new RecentRemindersCommand());
    this.commandRegistry.register(new TaskDigestCommand());
    this.commandRegistry.register(new ClearHistoryCommand());
  }

  /**
   * Start the WhatsApp service and establish connection
   */
  async start(authPath?: string): Promise<WASocket> {
    if (authPath) {
      this.authPath = authPath;
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We handle QR display manually
        defaultQueryTimeoutMs: 60000,
        browser: Browsers.macOS("Safari"),
        connectTimeoutMs: 60000,
        syncFullHistory: false,
        shouldIgnoreJid: (jid) => false,
        getMessage: async (key) => {
          return { conversation: "" };
        },
      });

      this.setupEventHandlers(saveCreds);

      return this.socket;
    } catch (error) {
      logger.error("Failed to start WhatsApp service", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        authPath: this.authPath,
      });
      throw error;
    }
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // Save credentials on update
    this.socket.ev.on("creds.update", async () => {
      await saveCreds();
      this.handleCredsUpdate();
    });

    // Handle connection state changes
    this.socket.ev.on(
      "connection.update",
      this.handleConnectionUpdate.bind(this)
    );

    // Handle incoming messages
    this.socket.ev.on("messages.upsert", this.handleMessagesUpsert.bind(this));

    // Message updates - use debug level as these are verbose
    this.socket.ev.on("messages.update", (updates) => {
      logger.debug("Messages updated", { updateCount: updates.length });
    });

    // Group updates - use debug level as these are verbose
    this.socket.ev.on("groups.update", (groups) => {
      logger.debug("Groups updated", { groupCount: groups.length });
    });
  }

  /**
   * Handle credentials update to extract bot identity
   */
  private handleCredsUpdate(): void {
    if (!this.socket?.authState?.creds?.me) return;

    const me = this.socket.authState.creds.me;

    // Normalize JID/LID by removing device index
    const normalizeJid = (jid: string) => jid.replace(/:\d+@/, "@");

    this.botIdentity = {
      jid: me.id ? normalizeJid(me.id) : null,
      lid: me.lid ? normalizeJid(me.lid) : null,
      name: me.name || this.botIdentity.name,
      phoneNumber: me.phoneNumber,
    };

    logger.debug("Bot identity updated", {
      jid: this.botIdentity.jid,
      lid: this.botIdentity.lid,
      name: this.botIdentity.name,
    });
  }

  /**
   * Handle connection state updates
   */
  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    // Display QR code for pairing
    if (qr) {
      logger.info("QR code generated for WhatsApp pairing");
      qrcode.generate(qr, { small: true });
      console.log(
        "\nGo to: WhatsApp → Settings → Linked Devices → Link a Device\n"
      );
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

        // Extract phone number from JID if available
        const match = this.socket.user.id.match(/^(\d+)@/);
        if (match && !this.botIdentity.phoneNumber) {
          this.botIdentity.phoneNumber = match[1];
        }
      }

      logger.info("Connected to WhatsApp", {
        jid: this.botIdentity.jid,
        lid: this.botIdentity.lid,
        name: this.botIdentity.name,
        phoneNumber: this.botIdentity.phoneNumber,
      });
    }
  }

  /**
   * Handle disconnection and implement reconnect logic
   */
  private handleDisconnect(lastDisconnect: any): void {
    const shouldReconnect =
      lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;

    if (!shouldReconnect) {
      logger.error("WhatsApp session logged out, authentication required");
      fs.rmSync(this.authPath, { recursive: true, force: true });
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error("Maximum reconnection attempts reached", {
        maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY_MS * this.reconnectAttempts;

    logger.warn("Connection closed, attempting reconnect", {
      attemptNumber: this.reconnectAttempts,
      maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
      delaySeconds: delay / 1000,
    });

    setTimeout(() => {
      this.start().catch((err) => {
        logger.error("Reconnection failed", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          attemptNumber: this.reconnectAttempts,
        });
      });
    }, delay);
  }

  /**
   * Handle incoming messages
   */
  private async handleMessagesUpsert({
    messages,
    type,
  }: {
    messages: WAMessage[];
    type: string;
  }): Promise<void> {
    for (const msg of messages) {
      try {
        await this.processMessage(msg);
      } catch (error) {
        logger.error("Failed to process message", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          messageId: msg.key.id,
          chatId: msg.key.remoteJid,
        });
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(msg: WAMessage): Promise<void> {
    // Ignore messages without content
    if (!msg.message) {
      return;
    }

    if (msg.key.fromMe) {
      return;
    }

    // Skip old messages (only process messages from the last 2 minutes)
    const messageTimestamp = msg.messageTimestamp as number;
    const currentTime = Math.floor(Date.now() / 1000);
    const messageAge = currentTime - messageTimestamp;

    if (messageAge > 120) {
      logger.debug("Skipping old message", { messageAgeSeconds: messageAge });
      return;
    }

    // Extract message context
    const context = this.extractMessageContext(msg);

    logger.info("Processing message", {
      chatId: context.chatId,
      senderId: context.senderId,
      isGroup: context.isGroup,
      hasQuote: !!context.quotedMessage,
      text: context.text // Log the input text
    });

    // Check if this is a reply to bot's message
    const isReplyToBot = this.isBotRepliedTo(msg);

    // Check if bot is mentioned or replied to
    const isMentioned = this.isBotMentioned(msg);

    // Handle ping command (works without mention)
    if (context.text.includes("/ping")) {
      await this.sendMessage(context.chatId, { text: "Pong 🏓" });
      return;
    }

    // Handle slash commands (works without mention) - don't send to AI if command is handled
    if (context.text.startsWith("/")) {
      const handled = await this.handleCommand(context);
      if (handled) {
        return; // Command was processed, don't send to AI
      }
    }

    // For non-command messages, require mention or reply to bot
    if (!isMentioned && !isReplyToBot) {
      return;
    }

    // Rate limiting check
    if (!this.rateLimiter.tryConsume(context.senderId)) {
      logger.warn("Rate limit exceeded", {
        senderId: context.senderId,
        chatId: context.chatId,
      });
      await this.sendMessage(context.chatId, {
        text: "Please slow down! You're sending too many messages.",
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }

    // Send typing indicator
    await this.sendTypingIndicator(context.chatId, true);

    try {
      // Generate AI response with conversation context
      const reply = await this.aiService.generateReply(
        context.text,
        context.chatId,
        context.senderId,
        context.mentionedJids,
        context.rawText
      );

      // Send reply with mentions if provided
      await this.sendMessage(context.chatId, {
        text: reply.text,
        mentions: reply.mentions,
      });

      logger.info("AI reply sent", {
        chatId: context.chatId,
        senderId: context.senderId,
        hasMentions: !!reply.mentions && reply.mentions.length > 0,
        reply: reply.text
      });
    } catch (error) {
      logger.error("Failed to generate AI reply", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chatId: context.chatId,
        senderId: context.senderId,
      });

      // Send error message to user
      await this.sendMessage(context.chatId, {
        text: "Sorry, I encountered an error processing your request. Please try again.",
      });
    } finally {
      // Stop typing indicator
      await this.sendTypingIndicator(context.chatId, false);
    }
  }

  /**
   * Handle slash commands for testing and development
   */
  private async handleCommand(context: MessageContext): Promise<boolean> {
    const commandName = context.text.split(" ")[0].toLowerCase();

    try {
      // 1. Try Registry (Active)
      const regCmd = this.commandRegistry.get(commandName);
      if (regCmd) {
        await regCmd.execute(context, {
          whatsapp: this,
          registry: this.commandRegistry,
        });
        return true;
      }

      // 2. Fuzzy matching via Registry
      const matchedCommand = this.commandRegistry.findSimilar(commandName);
      if (matchedCommand) {
        const regCmd = this.commandRegistry.get(matchedCommand);
        if (regCmd) {
          await regCmd.execute(context, {
            whatsapp: this,
            registry: this.commandRegistry,
          });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error("Command execution failed", {
        command: commandName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chatId: context.chatId,
        senderId: context.senderId,
      });
      await this.sendMessage(context.chatId, {
        text: "Sorry, an error occurred while processing the command.",
      });
      return true;
    }
  }


  /**
   * Extract message context and metadata
   */
  private extractMessageContext(msg: WAMessage): MessageContext {
    const chatId = msg.key.remoteJid!;
    const senderId = msg.key.participant || chatId;
    const isGroup = chatId.endsWith("@g.us");

    // Extract text from various message types
    const rawText = this.extractText(msg.message!);

    // Remove bot mentions so commands like "/tasks" work even when someone writes "@bot /tasks"
    const botMentions = [this.botIdentity.jid, this.botIdentity.lid]
      .filter(Boolean)
      .map((jid) => cleanJidForDisplay(jid!))
      .flatMap((jid) => [jid, jid.split(":")[0]]); // handle both full and short IDs

    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const mentionPattern =
      botMentions.length > 0
        ? new RegExp(`@(${botMentions.map(escapeRegex).join("|")})`, "gi")
        : null;

    const textWithoutMention = mentionPattern
      ? rawText.replace(mentionPattern, "")
      : rawText;

    const text = textWithoutMention.toLowerCase().trim();

    // Extract quoted message if exists
    const quotedMessage =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || undefined;

    // Extract mentioned JIDs and filter out the bot's own JID/LID
    const allMentionedJids =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const mentionedJids = allMentionedJids.filter(
      (jid) => jid !== this.botIdentity.jid && jid !== this.botIdentity.lid
    );

    logger.info(
      `Extracted message context: chatId=${chatId}, senderId=${senderId}, isGroup=${isGroup}, quotedMessage=${
        quotedMessage ? JSON.stringify(quotedMessage) : "undefined"
      } text="${text}", mentionedJids=[${mentionedJids.join(
        ", "
      )}] (bot mentions filtered out)`
    );

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
  private extractText(message: proto.IMessage): string {
    // Try different message types in order of priority
    return (
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      message.documentMessage?.caption ||
      message.buttonsResponseMessage?.selectedButtonId ||
      message.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ""
    );
  }

  /**
   * Check if bot is mentioned in the message
   */
  private isBotMentioned(msg: WAMessage): boolean {
    const mentionedJids =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.length === 0) {
      return false;
    }

    const isMentioned =
      mentionedJids.includes(this.botIdentity.jid!) ||
      mentionedJids.includes(this.botIdentity.lid!);

    if (isMentioned) {
      logger.debug(`Bot mentioned via JID: ${mentionedJids.join(", ")}`);
    }

    return isMentioned;
  }

  /**
   * Check if the message is a reply to bot's message
   */
  private isBotRepliedTo(msg: WAMessage): boolean {
    const quotedMsg =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) {
      return false;
    }

    const quotedParticipant =
      msg.message?.extendedTextMessage?.contextInfo?.participant;

    // Check if quoted message is from bot
    const isFromBot =
      quotedParticipant === this.botIdentity.jid ||
      quotedParticipant === this.botIdentity.lid;

    if (isFromBot) {
      logger.debug("Message is a reply to bot's previous message");
    }

    return isFromBot;
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(chatId: string, content: any) {
    if (!this.socket) {
      throw new Error("WhatsApp socket not initialized");
    }

    if (!this.isConnected) {
      throw new Error("WhatsApp not connected");
    }

    const message: string = this.cleanMessage(content.text);
    content.text = message;

    try {
      return await this.socket.sendMessage(chatId, content);
    } catch (error) {
      logger.error(`Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Clear AI conversation history for a user
   */
  async clearAiHistory(userId: string): Promise<void> {
    if (this.aiService) {
      this.aiService.clearHistory(userId);
      logger.info(`Cleared AI history for user ${userId}`);
    }
  }

  private cleanMessage(message: string): string {
    if (!message) return "";
    let cleanedMessage = message.replace(/\*\*/g, "*").trim();
    cleanedMessage = cleanedMessage.replace(/@lid/g, "");
    return cleanedMessage;
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(chatId: string, isTyping: boolean): Promise<void> {
    if (!this.socket || !this.isConnected) return;

    try {
      await this.socket.sendPresenceUpdate(
        isTyping ? "composing" : "paused",
        chatId
      );
    } catch (error) {
      logger.debug("Failed to send typing indicator:", error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Send read receipt
   */
  async markAsRead(chatId: string, messageKeys: any[]): Promise<void> {
    if (!this.socket || !this.isConnected) return;

    try {
      await this.socket.readMessages(messageKeys);
    } catch (error) {
      logger.debug("Failed to mark messages as read:", error);
    }
  }

  /**
   * Get bot identity information
   */
  getBotIdentity(): BotIdentity {
    return { ...this.botIdentity };
  }

  /**
   * Check if the service is connected
   */
  isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
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
  getSocket(): WASocket | null {
    return this.socket;
  }
}

export default WhatsappService;
