import * as schedule from "node-schedule";
import { prisma } from "../lib/prisma.js";
import logger from "../utils/logger.js";
import { DateTime, Zone } from "luxon";

// We'll set the WhatsApp service instance after initialization
let whatsappService: any = null;

/**
 * Set the WhatsApp service instance for sending messages
 */
export function setWhatsappService(service: any): void {
  whatsappService = service;
  logger.info("WhatsApp service connected to ReminderScheduler");
}

/**
 * ReminderScheduler - Manages scheduled reminder notifications
 * Sends reminders at three stages:
 * 1. 24 hours before (reminder24hSent)
 * 2. 1 hour before (reminder1hSent)
 * 3. At the exact time (reminderSent)
 */
export class ReminderScheduler {
  private jobs: Map<string, schedule.Job[]> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private dailyDigestJob: schedule.Job | null = null;

  constructor() {
    logger.info("ReminderScheduler initialized");
  }

  /**
   * Start the scheduler - checks every minute for upcoming reminders
   */
  async start(): Promise<void> {
    logger.info("🚀 Starting ReminderScheduler...");

    // Load existing active reminders from database
    await this.loadActiveReminders();

    // Schedule daily digest at 8 AM
    this.scheduleDailyDigest();

    // Check every minute for reminders that need to be sent
    this.checkInterval = setInterval(async () => {
      await this.checkAndSendDueReminders();
    }, 60000); // Every 60 seconds

    logger.info("✅ ReminderScheduler started successfully");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    logger.info("Stopping ReminderScheduler...");

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel daily digest job
    if (this.dailyDigestJob) {
      this.dailyDigestJob.cancel();
      this.dailyDigestJob = null;
    }

    // Cancel all scheduled jobs
    for (const [reminderId, jobs] of this.jobs.entries()) {
      jobs.forEach((job) => job.cancel());
      logger.info(`Cancelled jobs for reminder ${reminderId}`);
    }

    this.jobs.clear();
    logger.info("ReminderScheduler stopped");
  }

  /**
   * Load all active reminders from database and schedule them
   */
  private async loadActiveReminders(): Promise<void> {
    try {
      const activeReminders = await prisma.reminder.findMany({
        where: {
          reminderSent: false,
          remindAtUtc: {
            gt: new Date(), // Only future reminders
          },
        },
      });

      logger.info(`Loading ${activeReminders.length} active reminders`);

      for (const reminder of activeReminders) {
        this.scheduleReminder(
          reminder.id,
          reminder.remindAtUtc,
          reminder.reminder24hSent,
          reminder.reminder1hSent
        );
      }
    } catch (error) {
      logger.error("Error loading active reminders:", error);
    }
  }

  /**
   * Schedule a reminder with all its notification stages
   */
  scheduleReminder(
    reminderId: string,
    remindAtUtc: Date,
    reminder24hSent: boolean,
    reminder1hSent: boolean
  ): void {
    const jobs: schedule.Job[] = [];
    const now = new Date();

    // Schedule 24-hour advance reminder
    if (!reminder24hSent) {
      const twentyFourHoursBefore = new Date(
        remindAtUtc.getTime() - 24 * 60 * 60 * 1000
      );
      if (twentyFourHoursBefore > now) {
        const job = schedule.scheduleJob(twentyFourHoursBefore, async () => {
          await this.send24HourReminder(reminderId);
        });
        jobs.push(job);
        logger.info(
          `Scheduled 24h reminder for ${reminderId} at ${twentyFourHoursBefore.toISOString()}`
        );
      }
    }

    // Schedule 1-hour advance reminder
    if (!reminder1hSent) {
      const oneHourBefore = new Date(remindAtUtc.getTime() - 60 * 60 * 1000);
      if (oneHourBefore > now) {
        const job = schedule.scheduleJob(oneHourBefore, async () => {
          await this.send1HourReminder(reminderId);
        });
        jobs.push(job);
        logger.info(
          `Scheduled 1h reminder for ${reminderId} at ${oneHourBefore.toISOString()}`
        );
      }
    }

    // Schedule exact time reminder
    if (remindAtUtc > now) {
      const job = schedule.scheduleJob(remindAtUtc, async () => {
        await this.sendFinalReminder(reminderId);
      });
      jobs.push(job);
      logger.info(
        `Scheduled final reminder for ${reminderId} at ${remindAtUtc.toISOString()}`
      );
    }

    if (jobs.length > 0) {
      this.jobs.set(reminderId, jobs);
    }
  }

  /**
   * Cancel all jobs for a specific reminder
   */
  cancelReminder(reminderId: string): void {
    const jobs = this.jobs.get(reminderId);
    if (jobs) {
      jobs.forEach((job) => job.cancel());
      this.jobs.delete(reminderId);
      logger.info(`Cancelled all jobs for reminder ${reminderId}`);
    }
  }

  /**
   * Send 24-hour advance reminder
   */
  private async send24HourReminder(reminderId: string): Promise<void> {
    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });

      if (!reminder || reminder.reminderSent) {
        return;
      }

      logger.info(`Sending 24h advance reminder for ${reminderId}`);

      // Get local time components
      const dt = DateTime.fromJSDate(reminder.remindAtUtc, {
        zone: "utc",
      }).setZone(reminder.timezone);

      const date = dt.toFormat("d MMMM yyyy");
      const day = dt.toFormat("EEEE");
      const time = dt.toFormat("h:mm a");

      // Send WhatsApp message
      if (whatsappService) {
        let message = `⏰ *Reminder in 24 hours!*\n\n`;
        message += `*Meeting Schedule*\n\n`;
        message += `Date: ${date}\n`;
        message += `Day: ${day}\n`;
        message += `Time: ${time}\n`;
        message += `Meeting: ${reminder.title}`;

        // Build mentions array (include existing mentions + sender)
        const mentions = [...reminder.mentions];
        if (reminder.senderId && !mentions.includes(reminder.senderId)) {
          mentions.push(reminder.senderId);
        }

        // Add all mentions at the end
        if (mentions.length > 0) {
          const cleanMentions = mentions
            .map((jid) => `> @${this.cleanJidForDisplay(jid)}`)
            .join("\n");
          message += `\n\n${cleanMentions}`;
        }

        try {
          await whatsappService.sendMessage(reminder.chatId, {
            text: message,
            mentions: mentions,
          });
          logger.info(`✅ 24h WhatsApp message sent for ${reminderId}`);
        } catch (error) {
          logger.error(
            `Failed to send 24h WhatsApp message for ${reminderId}:`,
            error
          );
        }
      } else {
        logger.warn("WhatsApp service not available for sending 24h reminder");
      }

      // Mark as sent
      await prisma.reminder.update({
        where: { id: reminderId },
        data: { reminder24hSent: true },
      });

      logger.info(`✅ 24h reminder sent for ${reminderId}`);
    } catch (error) {
      logger.error(`Error sending 24h reminder for ${reminderId}:`, error);
    }
  }

  /**
   * Send 1-hour advance reminder
   */
  private async send1HourReminder(reminderId: string): Promise<void> {
    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });

      if (!reminder || reminder.reminderSent) {
        return;
      }

      logger.info(`Sending 1h advance reminder for ${reminderId}`);

      // Get local time components
      const dt = DateTime.fromJSDate(reminder.remindAtUtc, {
        zone: "utc",
      }).setZone(reminder.timezone);

      const date = dt.toFormat("d MMMM yyyy");
      const day = dt.toFormat("EEEE");
      const time = dt.toFormat("h:mm a");

      // Send WhatsApp message
      if (whatsappService) {
        let message = `⏰ *Reminder in 1 hour!*\n\n`;
        message += `*Meeting Schedule*\n\n`;
        message += `Date: ${date}\n`;
        message += `Day: ${day}\n`;
        message += `Time: ${time}\n`;
        message += `Meeting: ${reminder.title}`;

        // Build mentions array (include existing mentions + sender)
        const mentions = [...reminder.mentions];
        if (reminder.senderId && !mentions.includes(reminder.senderId)) {
          mentions.push(reminder.senderId);
        }

        // Add all mentions at the end
        if (mentions.length > 0) {
          const cleanMentions = mentions
            .map((jid) => `> @${this.cleanJidForDisplay(jid)}`)
            .join("\n");
          message += `\n\n${cleanMentions}`;
        }

        try {
          await whatsappService.sendMessage(reminder.chatId, {
            text: message,
            mentions: mentions,
          });
          logger.info(`✅ 1h WhatsApp message sent for ${reminderId}`);
        } catch (error) {
          logger.error(
            `Failed to send 1h WhatsApp message for ${reminderId}:`,
            error
          );
        }
      } else {
        logger.warn("WhatsApp service not available for sending 1h reminder");
      }

      // Mark as sent
      await prisma.reminder.update({
        where: { id: reminderId },
        data: { reminder1hSent: true },
      });

      logger.info(`✅ 1h reminder sent for ${reminderId}`);
    } catch (error) {
      logger.error(`Error sending 1h reminder for ${reminderId}:`, error);
    }
  }

  /**
   * Send final reminder at exact time
   */
  private async sendFinalReminder(reminderId: string): Promise<void> {
    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });

      if (!reminder || reminder.reminderSent) {
        return;
      }

      logger.info(`Sending final reminder for ${reminderId}`);

      // Get local time components
      const dt = DateTime.fromJSDate(reminder.remindAtUtc, {
        zone: "utc",
      }).setZone(reminder.timezone);

      const date = dt.toFormat("d MMMM yyyy");
      const day = dt.toFormat("EEEE");
      const time = dt.toFormat("h:mm a");

      // Send WhatsApp message
      if (whatsappService) {
        let message = `🔔 *REMINDER NOW!*\n\n`;
        message += `*Meeting Schedule*\n\n`;
        message += `Date: ${date}\n`;
        message += `Day: ${day}\n`;
        message += `Time: ${time}\n`;
        message += `Meeting: ${reminder.title}`;

        // Build mentions array (include existing mentions + sender)
        const mentions = [...reminder.mentions];
        if (reminder.senderId && !mentions.includes(reminder.senderId)) {
          mentions.push(reminder.senderId);
        }

        // Add all mentions at the end
        if (mentions.length > 0) {
          const cleanMentions = mentions
            .map((jid) => `> @${this.cleanJidForDisplay(jid)}`)
            .join("\n");
          message += `\n\n${cleanMentions}`;
        }

        try {
          await whatsappService.sendMessage(reminder.chatId, {
            text: message,
            mentions: mentions,
          });
          logger.info(`✅ Final WhatsApp message sent for ${reminderId}`);
        } catch (error) {
          logger.error(
            `Failed to send final WhatsApp message for ${reminderId}:`,
            error
          );
        }
      } else {
        logger.warn(
          "WhatsApp service not available for sending final reminder"
        );
      }

      // Mark as sent and clean up jobs
      await prisma.reminder.update({
        where: { id: reminderId },
        data: { reminderSent: true },
      });

      this.jobs.delete(reminderId);

      logger.info(`✅ Final reminder sent for ${reminderId}`);
    } catch (error) {
      logger.error(`Error sending final reminder for ${reminderId}:`, error);
    }
  }

  /**
   * Periodic check for reminders that might have been missed
   * (e.g., if server was down)
   */
  private async checkAndSendDueReminders(): Promise<void> {
    try {
      const now = new Date();

      // Check for missed 24h reminders
      const missed24h = await prisma.reminder.findMany({
        where: {
          reminderSent: false,
          reminder24hSent: false,
          remindAtUtc: {
            gte: now,
            lte: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000), // Within next 24h + 5min buffer
          },
        },
      });

      for (const reminder of missed24h) {
        const twentyFourHoursBefore = new Date(
          reminder.remindAtUtc.getTime() - 24 * 60 * 60 * 1000
        );
        if (twentyFourHoursBefore <= now) {
          await this.send24HourReminder(reminder.id);
        }
      }

      // Check for missed 1h reminders
      const missed1h = await prisma.reminder.findMany({
        where: {
          reminderSent: false,
          reminder1hSent: false,
          remindAtUtc: {
            gte: now,
            lte: new Date(now.getTime() + 60 * 60 * 1000 + 5 * 60 * 1000), // Within next 1h + 5min buffer
          },
        },
      });

      for (const reminder of missed1h) {
        const oneHourBefore = new Date(
          reminder.remindAtUtc.getTime() - 60 * 60 * 1000
        );
        if (oneHourBefore <= now) {
          await this.send1HourReminder(reminder.id);
        }
      }

      // Check for missed final reminders
      const missedFinal = await prisma.reminder.findMany({
        where: {
          reminderSent: false,
          remindAtUtc: {
            lte: new Date(now.getTime() + 5 * 60 * 1000), // Past or within 5 minutes
          },
        },
      });

      for (const reminder of missedFinal) {
        if (reminder.remindAtUtc <= now) {
          await this.sendFinalReminder(reminder.id);
        }
      }
    } catch (error) {
      logger.error("Error checking for due reminders:", error);
    }
  }

  /**
   * Schedule daily digest to run at 8 AM every day
   */
  private scheduleDailyDigest(): void {
    // Schedule for 8 AM every day
    // Rule: { hour: 8, minute: 0 }
    const rule = new schedule.RecurrenceRule();
    rule.hour = 8;
    rule.minute = 0;
    rule.tz = "Asia/Kuwait"; // Default timezone

    this.dailyDigestJob = schedule.scheduleJob(rule, async () => {
      await this.sendDailyDigest();
    });

    logger.info("📅 Daily digest scheduled for 8:00 AM (Kuwait time)");
  }

  /**
   * Send daily digest of all reminders for today
   */
  private async sendDailyDigest(): Promise<void> {
    try {
      logger.info("Sending daily digest...");

      // Get all active reminders for today
      const today = DateTime.now().setZone("Asia/Kuwait");
      const startOfDay = today.startOf("day").toJSDate();
      const endOfDay = today.endOf("day").toJSDate();

      // Group reminders by chat
      const reminders = await prisma.reminder.findMany({
        where: {
          reminderSent: false,
          remindAtUtc: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: {
          remindAtUtc: "asc",
        },
      });

      if (reminders.length === 0) {
        logger.info("No reminders for today, skipping daily digest");
        return;
      }

      // Group by chatId
      const remindersByChat = new Map<string, typeof reminders>();
      for (const reminder of reminders) {
        const chatReminders = remindersByChat.get(reminder.chatId) || [];
        chatReminders.push(reminder);
        remindersByChat.set(reminder.chatId, chatReminders);
      }

      // Send digest to each chat
      for (const [chatId, chatReminders] of remindersByChat.entries()) {
        await this.sendChatDailyDigest(chatId, chatReminders);
      }

      logger.info(`✅ Daily digest sent to ${remindersByChat.size} chat(s)`);
    } catch (error) {
      logger.error("Error sending daily digest:", error);
    }
  }

  /**
   * Send daily digest to a specific chat
   */
  private async sendChatDailyDigest(
    chatId: string,
    reminders: any[]
  ): Promise<void> {
    if (!whatsappService) {
      logger.warn("WhatsApp service not available for sending daily digest");
      return;
    }

    try {
      const today = DateTime.now().setZone("Asia/Kuwait");
      const formattedDate = today.toFormat("EEEE, MMMM d, yyyy");

      let message = `📅 *Good morning!*\n\n`;
      message += `Here are your reminders for *${formattedDate}*:\n\n`;

      for (const reminder of reminders) {
        const localTime = DateTime.fromJSDate(reminder.remindAtUtc, {
          zone: "utc",
        })
          .setZone(reminder.timezone)
          .toFormat("h:mm a");

        message += `- *${reminder.title}*\n`;
        message += `    ${localTime}\n\n`;
      }

      message += `_You'll receive a notification 1h before each reminder._`;

      await whatsappService.sendMessage(chatId, {
        text: message,
      });

      logger.info(
        `✅ Daily digest sent to chat ${chatId} (${reminders.length} reminders)`
      );
    } catch (error) {
      logger.error(`Failed to send daily digest to chat ${chatId}:`, error);
    }
  }

  /**
   * Add a new reminder to the scheduler
   */
  async addReminder(
    reminderId: string,
    remindAtUtc: Date,
    reminder24hSent: boolean = false,
    reminder1hSent: boolean = false
  ): Promise<void> {
    logger.info(`Adding reminder ${reminderId} to scheduler`);
    this.scheduleReminder(
      reminderId,
      remindAtUtc,
      reminder24hSent,
      reminder1hSent
    );
  }

  /**
   * Clean JID for display by removing @lid or @s.whatsapp.net suffix
   * Examples:
   * - "100897539518569@lid" → "100897539518569"
   * - "96569072509@s.whatsapp.net" → "96569072509"
   */
  private cleanJidForDisplay(jid: string): string {
    return jid.replace(/@lid$/, "").replace(/@s\.whatsapp\.net$/, "");
  }
}

// Singleton instance
export const reminderScheduler = new ReminderScheduler();
