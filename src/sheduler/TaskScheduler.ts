import * as schedule from "node-schedule";
import logger from "../utils/logger.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { DateTime } from "luxon";
import { DEFAULT_TIMEZONE } from "../config/TimeZone.js";
import { prisma } from "../lib/prisma.js";

// WhatsApp service instance (will be set after initialization)
let whatsappService: any = null;

/**
 * Set the WhatsApp service instance for sending messages
 */
export function setWhatsappService(service: any): void {
  whatsappService = service;
  logger.info("WhatsApp service connected to TaskScheduler");
}

/**
 * TaskScheduler - Manages scheduled task digest notifications
 * Sends task summaries at:
 * 1. 8:05 AM - Morning digest
 * 2. 10:00 PM - Evening digest
 */
export class TaskScheduler {
  private morningDigestJob: schedule.Job | null = null;
  private eveningDigestJob: schedule.Job | null = null;

  constructor() {
    logger.info("TaskScheduler initialized");
  }

  /**
   * Start the task scheduler
   */
  async start(): Promise<void> {
    logger.info("🚀 Starting TaskScheduler...");

    // Schedule morning digest at 8:05 AM (in Kuwait timezone)
    this.scheduleMorningDigest();

    // Schedule evening digest at 10:00 PM (in Kuwait timezone)
    this.scheduleEveningDigest();

    logger.info("✅ TaskScheduler started successfully");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    logger.info("Stopping TaskScheduler...");

    if (this.morningDigestJob) {
      this.morningDigestJob.cancel();
      this.morningDigestJob = null;
    }

    if (this.eveningDigestJob) {
      this.eveningDigestJob.cancel();
      this.eveningDigestJob = null;
    }

    logger.info("TaskScheduler stopped");
  }

  /**
   * Schedule morning digest at 8:05 AM Kuwait time
   */
  private scheduleMorningDigest(): void {
    try {
      // Schedule for 8:05 AM every day in Kuwait timezone
      // Using cron: minute hour * * * (5 8 * * * = 8:05 AM every day)
      this.morningDigestJob = schedule.scheduleJob("5 8 * * *", async () => {
        logger.info("Running morning task digest at 8:05 AM...");
        await this.sendTaskDigest("morning");
      });

      logger.info("📅 Morning task digest scheduled for 8:05 AM daily");
    } catch (error) {
      logger.error("Error scheduling morning digest:", error);
    }
  }

  /**
   * Schedule evening digest at 10:00 PM Kuwait time
   */
  private scheduleEveningDigest(): void {
    try {
      // Schedule for 10:00 PM every day in Kuwait timezone
      // Using cron: minute hour * * * (0 22 * * * = 10:00 PM every day)
      this.eveningDigestJob = schedule.scheduleJob("0 22 * * *", async () => {
        logger.info("Running evening task digest at 10:00 PM...");
        await this.sendTaskDigest("evening");
      });

      logger.info("📅 Evening task digest scheduled for 10:00 PM daily");
    } catch (error) {
      logger.error("Error scheduling evening digest:", error);
    }
  }

  /**
   * Send task digest to all chats with active tasks
   */
  private async sendTaskDigest(period: "morning" | "evening"): Promise<void> {
    try {
      if (!whatsappService) {
        logger.warn("WhatsApp service not available, skipping task digest");
        return;
      }

      // Get all unique chat IDs that have tasks
      const allChats = await this.getAllChatsWithTasks();

      if (allChats.length === 0) {
        logger.info("No chats with tasks found, skipping digest");
        return;
      }

      logger.info(
        `Sending ${period} task digest to ${allChats.length} chat(s)`
      );

      for (const chatId of allChats) {
        await this.sendChatTaskDigest(chatId, period);
      }

      logger.info(`${period} task digest sent successfully`);
    } catch (error) {
      logger.error(`Error sending ${period} task digest:`, error);
    }
  }

  /**
   * Get all unique chat IDs that have pending tasks
   */
  private async getAllChatsWithTasks(): Promise<string[]> {
    try {
      // Get distinct chat IDs that have at least one pending task
      const result = await prisma.tasks.findMany({
        where: {
          status: TaskStatus.Pending,
        },
        select: {
          chatId: true,
        },
        distinct: ["chatId"],
      });

      const uniqueChatIds = result.map((r) => r.chatId);
      return uniqueChatIds;
    } catch (error) {
      logger.error("Error getting chats with tasks:", error);
      return [];
    }
  }

  /**
   * Send task digest for a specific chat
   */
  private async sendChatTaskDigest(
    chatId: string,
    period: "morning" | "evening"
  ): Promise<void> {
    try {
      // Get task statistics
      const stats = await taskService.getTaskStats(chatId);
      const pendingTasks = await taskService.listTasks(
        chatId,
        TaskStatus.Pending
      );

      // Only send if there are pending tasks
      if (pendingTasks.length === 0) {
        logger.info(`No pending tasks for chat ${chatId}, skipping digest`);
        return;
      }

      // Get current time in Kuwait timezone
      const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
      const timeStr = now.toFormat("h:mm a");
      const dateStr = now.toFormat("EEEE, MMMM d, yyyy");

      // Build message based on period
      let greeting = "";
      let emoji = "";

      if (period === "morning") {
        greeting = "Good morning! ☀️";
        emoji = "📋";
      } else {
        greeting = "Good evening! 🌙";
        emoji = "📊";
      }

      let message = `${greeting}\n\n`;
      message += `${emoji} *Task Summary* - ${timeStr}\n`;
      message += `_${dateStr}_\n\n`;

      // Task statistics
      message += `📊 *Statistics:*\n`;
      message += `• Total: ${stats.total}\n`;
      message += `• 🟡 Pending: ${stats.pending}\n`;
      message += `• 🟢 Done: ${stats.done}\n`;
      message += `• 🔴 Cancelled: ${stats.cancelled}\n\n`;

      // List pending tasks
      if (pendingTasks.length > 0) {
        message += `🟡 *Pending Tasks (${pendingTasks.length}):*\n\n`;

        for (const task of pendingTasks) {
          message += taskService.formatTask(task, true) + "\n";
        }

        message += `\n`;
      }

      // Add motivational message based on period
      if (period === "morning") {
        message += `💪 Let's tackle these tasks today!`;
      } else {
        message += `✨ Great work today! Don't forget to wrap up pending tasks.`;
      }

      // Send message (WhatsappService expects { text: string } format)
      await whatsappService.sendMessage(chatId, { text: message });
      logger.info(`Sent ${period} task digest to chat ${chatId}`);
    } catch (error) {
      logger.error(
        `Error sending ${period} task digest to chat ${chatId}:`,
        error
      );
    }
  }

  /**
   * Manually trigger a task digest for a specific chat (for testing)
   */
  async sendManualDigest(
    chatId: string,
    period: "morning" | "evening" = "morning"
  ): Promise<void> {
    logger.info(`Manually sending ${period} digest to chat ${chatId}`);
    await this.sendChatTaskDigest(chatId, period);
  }
}

// Singleton instance
export const taskScheduler = new TaskScheduler();
