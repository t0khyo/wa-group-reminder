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

      // Only send if there are pending or in-progress tasks
      if (pendingTasks.length === 0 && inProgressTasks.length === 0) {
        logger.info(`No active tasks for chat ${chatId}, skipping digest`);
        return;
      }

      // Get current time in default timezone
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
      message += `🟡 Pending: ${stats.pending}\n`;
      message += `🟠 In Progress: ${stats.inProgress}\n`;
      message += `🟢 Done: ${stats.done}\n`;
      message += `🔴 Cancelled: ${stats.cancelled}\n\n`;

      // Group active tasks by assignee
      const activeTasks = [...pendingTasks, ...inProgressTasks];
      const allMentions: string[] = [];

      if (activeTasks.length > 0) {
        message += `*Active Tasks (${activeTasks.length}):*\n\n`;

        // Group tasks by assignee
        const tasksByAssignee = new Map<string, typeof activeTasks>();
        const unassignedTasks: typeof activeTasks = [];

        for (const task of activeTasks) {
          if (task.assignedTo && task.assignedTo.length > 0) {
            // Task has assignees - add to each assignee's list
            for (const assignee of task.assignedTo) {
              const assigneeTasks = tasksByAssignee.get(assignee) || [];
              assigneeTasks.push(task);
              tasksByAssignee.set(assignee, assigneeTasks);

              // Track for mentions array
              if (!allMentions.includes(assignee)) {
                allMentions.push(assignee);
              }
            }
          } else {
            // Unassigned task
            unassignedTasks.push(task);
          }
        }

        // Display tasks grouped by assignee
        for (const [assignee, assigneeTasks] of tasksByAssignee.entries()) {
          // Clean JID for display
          const cleanAssignee = this.cleanJidForDisplay(assignee);
          message += `> @${cleanAssignee}\n`;

          for (const task of assigneeTasks) {
            const emoji = taskService.getStatusEmoji(task.status);
            const taskNumber = taskService.formatTaskId(task.taskId);
            message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
          }

          message += `\n`;
        }

        // Display unassigned tasks if any
        if (unassignedTasks.length > 0) {
          message += `*Unassigned Tasks:*\n`;
          for (const task of unassignedTasks) {
            const emoji = taskService.getStatusEmoji(task.status);
            const taskNumber = taskService.formatTaskId(task.taskId);
            message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
          }
          message += `\n`;
        }
      }

      // Add motivational message based on period
      if (period === "morning") {
        message += `💪 Let's tackle these tasks today!`;
      } else {
        message += `✨ Great work today! Don't forget to wrap up pending tasks.`;
      }

      // Send message with mentions
      await whatsappService.sendMessage(chatId, {
        text: message,
        mentions: allMentions,
      });
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
