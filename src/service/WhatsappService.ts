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
import { taskService } from "./TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import fs from "fs";

// Type definitions
interface MessageContent {
  text?: string;
  [key: string]: any;
}

interface BotIdentity {
  jid: string | null;
  lid: string | null;
  name: string;
  phoneNumber?: string;
}

interface MessageContext {
  chatId: string;
  senderId: string;
  isGroup: boolean;
  text: string;
  rawText: string;
  quotedMessage?: proto.IMessage;
  mentionedJids: string[];
}

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

  constructor(aiService?: AiService, authPath: string = "./auth_info") {
    this.aiService = aiService || new AiService();
    this.authPath = authPath;
    this.rateLimiter = new RateLimiter(10, 60000); // 10 messages per minute per user
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
      logger.error("Failed to start WhatsApp service:", error);
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

    logger.info("Bot identity updated:", {
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
      logger.info("QR Code generated. Please scan with WhatsApp:");
      qrcode.generate(qr, { small: true });
      logger.info(
        "Go to: WhatsApp → Settings → Linked Devices → Link a Device"
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

      logger.info("✅ Connected to WhatsApp successfully!");
      logger.info("🤖 Bot Identity:", this.botIdentity);
      logger.info("👂 Bot is ready and listening for mentions...");
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
      logger.error("Session logged out. Please restart and re-authenticate.");
      fs.rmSync(this.authPath, { recursive: true, force: true });
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY_MS * this.reconnectAttempts;

    logger.warn(
      `Connection closed. Reconnecting in ${delay / 1000}s... (Attempt ${
        this.reconnectAttempts
      }/${this.MAX_RECONNECT_ATTEMPTS})`
    );

    setTimeout(() => {
      this.start().catch((err) => {
        logger.error("Failed to reconnect:", err);
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
        logger.error("Error processing message:", error);
        // Continue processing other messages even if one fails
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(msg: WAMessage): Promise<void> {
    logger.info("Received message:", msg);

    // Ignore messages without content
    if (!msg.message) {
      logger.debug("Received message without content, skipping.");
      return;
    }

    if (msg.key.fromMe) {
      logger.debug("Received own message, skipping.");
      return;
    }

    // Skip old messages (messages sent before bot started)
    // Only process messages from the last 2 minutes
    const messageTimestamp = msg.messageTimestamp as number;
    const currentTime = Math.floor(Date.now() / 1000);
    const messageAge = currentTime - messageTimestamp;

    if (messageAge > 120) {
      logger.debug(`Skipping old message (${messageAge}s old) during sync.`);
      return;
    }

    // Extract message context
    const context = this.extractMessageContext(msg);

    logger.info(
      `Message from ${context.senderId} in ${context.chatId}${
        context.isGroup ? " (group)" : ""
      }`
    );
    logger.debug(`Message text: "${context.text}"`);

    // Check if this is a reply to bot's message
    const isReplyToBot = this.isBotRepliedTo(msg);
    if (isReplyToBot) {
      logger.info(`User ${msg.key.remoteJid} replied to bot's message`);
    }

    // Handle ping command
    if (context.text.includes("/ping")) {
      await this.sendMessage(context.chatId, { text: "Pong 🏓" });
      return;
    }

    // Handle test commands (dev mode)
    if (context.text.startsWith("/")) {
      const handled = await this.handleCommand(context);
      if (handled) {
        return;
      }
    }

    // Check if bot is mentioned or replied to
    const isMentioned = this.isBotMentioned(msg);

    if (!isMentioned && !isReplyToBot) {
      logger.debug("Bot not mentioned or replied to, skipping message.");
      return;
    }

    // Rate limiting check
    if (!this.rateLimiter.tryConsume(context.senderId)) {
      logger.warn(`Rate limit exceeded for user ${context.senderId}`);
      await this.sendMessage(context.chatId, {
        text: "Please slow down! You're sending too many messages.",
      });
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
        context.mentionedJids
      );

      // Send reply
      await this.sendMessage(context.chatId, { text: reply });

      logger.info(`✅ Sent AI reply to ${context.chatId}`);
    } catch (error) {
      logger.error("Error generating AI reply:", error);

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
    const command = context.text.split(" ")[0].toLowerCase();

    try {
      switch (command) {
        case "/help":
          await this.handleHelpCommand(context);
          return true;

        case "/tasks":
          await this.handleMyTasksCommand(context);
          return true;

        case "/all-tasks":
          await this.handleAllTasksCommand(context);
          return true;

        case "/recent-tasks":
          await this.handleRecentTasksCommand(context);
          return true;

        case "/task-digest":
          await this.handleTaskDigestCommand(context);
          return true;

        default:
          return false;
      }
    } catch (error) {
      logger.error(`Error handling command ${command}:`, error);
      await this.sendMessage(context.chatId, {
        text: "Sorry, an error occurred while processing the command.",
      });
      return true;
    }
  }

  /**
   * Handle /help command - show available commands
   */
  private async handleHelpCommand(context: MessageContext): Promise<void> {
    const message = `*GiGi Commands*

📝 *Commands:*
• \`/tasks\` - Your active tasks
• \`/all-tasks\` - All group tasks
• \`/recent-tasks\` - Recently closed
• \`/task-digest\` - Manual digest
• \`/ping\` - Test bot

💬 *Chat naturally by mentioning me to:*
• Create tasks & reminders
• Update task status
• List & manage tasks

📌 Mention users to assign tasks or say "assign me"`;

    await this.sendMessage(context.chatId, {
      text: message,
    });
  }

  /**
   * Handle /all-tasks command - show all active tasks in the chat
   */
  private async handleAllTasksCommand(context: MessageContext): Promise<void> {
    const stats = await taskService.getTaskStats(context.chatId);
    const pendingTasks = await taskService.listTasks(
      context.chatId,
      TaskStatus.Pending
    );
    const inProgressTasks = await taskService.listTasks(
      context.chatId,
      TaskStatus.InProgress
    );

    const activeTasks = [...pendingTasks, ...inProgressTasks];

    let message = `📋 *All Active Tasks*\n\n`;
    message += `📊 *Statistics:*\n`;
    message += `• Total: ${stats.total}\n`;
    message += `🟡 Pending: ${stats.pending}\n`;
    message += `🟠 In Progress: ${stats.inProgress}\n`;
    message += `🟢 Done: ${stats.done}\n`;
    message += `🔴 Cancelled: ${stats.cancelled}\n\n`;

    if (activeTasks.length === 0) {
      message += `No active tasks! 🎉`;
    } else {
      message += `*Active Tasks (${activeTasks.length}):*\n\n`;

      // Group by assignee
      const tasksByAssignee = new Map<string, typeof activeTasks>();
      const unassignedTasks: typeof activeTasks = [];

      for (const task of activeTasks) {
        if (task.assignedTo && task.assignedTo.length > 0) {
          for (const assignee of task.assignedTo) {
            const assigneeTasks = tasksByAssignee.get(assignee) || [];
            assigneeTasks.push(task);
            tasksByAssignee.set(assignee, assigneeTasks);
          }
        } else {
          unassignedTasks.push(task);
        }
      }

      // Display tasks by assignee
      for (const [assignee, tasks] of tasksByAssignee.entries()) {
        const cleanAssignee = this.cleanJidForDisplay(assignee);
        message += `> @${cleanAssignee}\n`;
        for (const task of tasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
        message += `\n`;
      }

      // Unassigned tasks
      if (unassignedTasks.length > 0) {
        message += `*Unassigned:*\n`;
        for (const task of unassignedTasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
      }
    }

    // Collect mentions
    const mentions: string[] = [];
    for (const task of activeTasks) {
      if (task.assignedTo) {
        for (const assignee of task.assignedTo) {
          if (!mentions.includes(assignee)) {
            mentions.push(assignee);
          }
        }
      }
    }

    await this.sendMessage(context.chatId, { text: message, mentions });
  }

  /**
   * Handle /tasks command - show tasks assigned to the sender
   */
  private async handleMyTasksCommand(context: MessageContext): Promise<void> {
    logger.info(
      `Fetching tasks for sender: ${context.senderId} in chat: ${context.chatId}`
    );

    const myTasks = await taskService.getTasksAssignedTo(
      context.chatId,
      context.senderId
    );

    logger.info(
      `Found ${myTasks.length} total tasks assigned to ${context.senderId}`
    );
    logger.info(
      `Tasks: ${JSON.stringify(
        myTasks.map((t) => ({
          id: t.taskId,
          title: t.title,
          status: t.status,
          assignedTo: t.assignedTo,
        }))
      )}`
    );

    const activeTasks = myTasks.filter(
      (t) =>
        t.status === TaskStatus.Pending || t.status === TaskStatus.InProgress
    );

    logger.info(
      `Filtered to ${activeTasks.length} active tasks (Pending or InProgress)`
    );

    const cleanSender = this.cleanJidForDisplay(context.senderId);
    let message = `> @${cleanSender}\n\n`;

    if (activeTasks.length === 0) {
      message += `You have no active tasks! 🎉`;
    } else {
      message += `You have *${activeTasks.length}* active task(s):\n\n`;

      for (const task of activeTasks) {
        const emoji = taskService.getStatusEmoji(task.status);
        const taskNumber = taskService.formatTaskId(task.taskId);
        message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
      }
    }

    await this.sendMessage(context.chatId, {
      text: message,
      mentions: [context.senderId],
    });
  }

  /**
   * Handle /recent-tasks command - show recently completed or cancelled tasks
   */
  private async handleRecentTasksCommand(
    context: MessageContext
  ): Promise<void> {
    const recentTasks = await taskService.getRecentClosedTasks(context.chatId);

    if (recentTasks.length === 0) {
      await this.sendMessage(context.chatId, {
        text: "📋 No tasks completed or cancelled in the last 7 days.",
      });
      return;
    }

    let message = `📋 *Recently Closed Tasks* (Last 7 days)\n\n`;

    const completed = recentTasks.filter((t) => t.status === TaskStatus.Done);
    const cancelled = recentTasks.filter(
      (t) => t.status === TaskStatus.Cancelled
    );

    if (completed.length > 0) {
      message += `✅ *Completed (${completed.length}):*\n`;
      for (const task of completed) {
        const taskNumber = taskService.formatTaskId(task.taskId);
        const assignee =
          task.assignedTo.length > 0
            ? `@${this.cleanJidForDisplay(task.assignedTo[0])}`
            : "unassigned";
        message += `* *${taskNumber}* - ${task.title} (${assignee})\n`;
      }
      message += "\n";
    }

    if (cancelled.length > 0) {
      message += `❌ *Cancelled (${cancelled.length}):*\n`;
      for (const task of cancelled) {
        const taskNumber = taskService.formatTaskId(task.taskId);
        const assignee =
          task.assignedTo.length > 0
            ? `@${this.cleanJidForDisplay(task.assignedTo[0])}`
            : "unassigned";
        message += `* *${taskNumber}* - ${task.title} (${assignee})\n`;
      }
    }

    // Extract mentions from tasks
    const mentions = recentTasks
      .filter((t) => t.assignedTo.length > 0)
      .map((t) => t.assignedTo[0])
      .filter((jid, index, self) => self.indexOf(jid) === index); // unique

    await this.sendMessage(context.chatId, {
      text: message,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
  }

  /**
   * Handle /task-digest command - trigger task digest manually
   */
  private async handleTaskDigestCommand(
    context: MessageContext
  ): Promise<void> {
    // Import TaskScheduler dynamically to avoid circular dependency
    const { taskScheduler } = await import("../sheduler/TaskScheduler.js");

    await this.sendMessage(context.chatId, {
      text: "📊 Generating task digest...",
    });

    await taskScheduler.sendManualDigest(context.chatId, "morning");

    logger.info(
      `Manual task digest sent to ${context.chatId} by ${context.senderId}`
    );
  }

  /**
   * Clean JID for display by removing @lid or @s.whatsapp.net suffix
   */
  private cleanJidForDisplay(jid: string): string {
    return jid.replace(/@lid$/, "").replace(/@s\.whatsapp\.net$/, "");
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
    const text = rawText.toLowerCase().trim();

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

  private cleanMessage(message: string): string {
    const cleanedMessage = message.replace(/\*\*/g, "*").trim();
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
