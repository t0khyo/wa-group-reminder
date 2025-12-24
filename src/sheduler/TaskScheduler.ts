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
      // Using cron: minute hour * * * (0 21 * * * = 9:30 PM every day)
      this.eveningDigestJob = schedule.scheduleJob("30 21 * * *", async () => {
        logger.info("Running evening task digest at 9:30 PM...");
        await this.sendTaskDigest("evening");
      });

      logger.info("📅 Evening task digest scheduled for 9:30 PM daily");
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
   * Get all unique chat IDs that have pending or in-progress tasks
   */
  private async getAllChatsWithTasks(): Promise<string[]> {
    try {
      // Get distinct chat IDs that have at least one pending or in-progress task
      const result = await prisma.tasks.findMany({
        where: {
          OR: [
            { status: TaskStatus.Pending },
            { status: TaskStatus.InProgress },
          ],
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
      const inProgressTasks = await taskService.listTasks(
        chatId,
        TaskStatus.InProgress
      );
      
      // Get completed tasks from the last 3 days
      const recentClosedTasks = await taskService.getRecentClosedTasks(chatId, 3);
      const completedTasks = recentClosedTasks.filter(
        (t) => t.status === TaskStatus.Done
      );

      const activeTasks = [...pendingTasks, ...inProgressTasks];

      // Only send if there are active tasks or recently completed tasks
      if (activeTasks.length === 0 && completedTasks.length === 0) {
        logger.info(`No active or recent tasks for chat ${chatId}, skipping digest`);
        return;
      }

      // Get current time in default timezone
      const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
      const timeStr = now.toFormat("h:mm a");
      const dateStr = now.toFormat("EEEE, MMMM d, yyyy");

      // Build statistics message
      let greeting = "";
      let emoji = "";

      if (period === "morning") {
        greeting = "Good morning! ☀️";
        emoji = "📋";
      } else {
        greeting = "Good evening! 🌙";
        emoji = "📊";
      }

      let statsMessage = `${greeting}\n\n`;
      statsMessage += `${emoji} *Task Summary* - ${timeStr}\n`;
      statsMessage += `_${dateStr}_\n\n`;

      // Task statistics
      statsMessage += `📊 *Statistics:*\n`;
      statsMessage += `• Total: ${stats.total}\n`;
      statsMessage += `🟡 Pending: ${stats.pending}\n`;
      statsMessage += `🟠 In Progress: ${stats.inProgress}\n`;
      statsMessage += `🟢 Done: ${stats.done}\n`;
      statsMessage += `🔴 Cancelled: ${stats.cancelled}\n\n`;

      // Identify unassigned tasks (Active only)
      const unassignedTasks = activeTasks.filter(
        (t) => !t.assignedTo || t.assignedTo.length === 0
      );

      if (unassignedTasks.length > 0) {
        statsMessage += `*Unassigned Tasks:*\n`;
        for (const task of unassignedTasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          statsMessage += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
        statsMessage += `\n`;
      }
      
      if (period === "morning") {
         statsMessage += `💪 Let's tackle these tasks today!`;
      } else {
         statsMessage += `✨ Great work today!`;
      }

      // Send Statistics Message
      await whatsappService.sendMessage(chatId, {
        text: statsMessage,
      });

      // Group tasks by assignee (Active + Recently Completed)
      const usersWithTasks = new Set<string>();
      
      activeTasks.forEach(t => t.assignedTo.forEach(u => usersWithTasks.add(u)));
      completedTasks.forEach(t => t.assignedTo.forEach(u => usersWithTasks.add(u)));

      // Send a separate message for each user
      for (const userId of usersWithTasks) {
        const cleanUser = this.cleanJidForDisplay(userId);
        
        // Combine active and completed tasks for this user
        const userTasks = [
          ...activeTasks.filter(t => t.assignedTo.includes(userId)),
          ...completedTasks.filter(t => t.assignedTo.includes(userId))
        ];

        // Sort by task ID to keep them in order
        userTasks.sort((a, b) => a.taskId - b.taskId);

        if (userTasks.length === 0) continue;

        let userMessage = `> @${cleanUser}\n\n`;
        userMessage += `*Your Tasks:*\n`;

        for (const task of userTasks) {
           const emoji = taskService.getStatusEmoji(task.status);
           const taskNumber = taskService.formatTaskId(task.taskId);
           userMessage += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }

        await whatsappService.sendMessage(chatId, {
          text: userMessage,
          mentions: [userId]
        });
        
        // Small delay to prevent rate limit issues
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info(`Sent ${period} task digest to chat ${chatId}`);
    } catch (error) {
      logger.error(
        `Error sending ${period} task digest to chat ${chatId}:`,
        error
      );
    }
  }

  /**
   * Clean JID for display by removing @lid or @s.whatsapp.net suffix
   */
  private cleanJidForDisplay(jid: string): string {
    return jid.replace(/@lid$/, "").replace(/@s\.whatsapp\.net$/, "");
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
