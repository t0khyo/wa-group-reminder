import { prisma } from "../lib/prisma.js";
import logger from "../utils/logger.js";
import * as chrono from "chrono-node";
import { Reminder } from "../generated/prisma/client.js";
import { DateTime } from "luxon";
import { DEFAULT_TIMEZONE } from "../config/TimeZone.js";
import { reminderScheduler } from "../sheduler/ReminderScheduler.js";

/**
 * ReminderService - Handles reminder creation, listing, and cancellation using Prisma
 */
export interface ReminderDto {
  id: string;
  chatId: string;
  message: string;
  scheduledTime: Date;
  scheduledTimeLocal: string; // Local time in the reminder's timezone
  timezone: string;
  mentions: string[];
  status: "pending" | "active" | "completed" | "cancelled";
  createdAt: Date;
  createdBy: string;
}

export class ReminderService {
  /**
   * Convert Prisma Reminder model to ReminderDto
   */
  private toReminderDto(reminder: Reminder): ReminderDto {
    const timezone = reminder.timezone || DEFAULT_TIMEZONE;
    const scheduledTimeLocal = DateTime.fromJSDate(reminder.remindAtUtc, {
      zone: "utc",
    })
      .setZone(timezone)
      .toLocaleString(DateTime.DATETIME_FULL);

    return {
      id: reminder.id,
      chatId: reminder.chatId,
      message: reminder.title,
      scheduledTime: reminder.remindAtUtc,
      scheduledTimeLocal,
      timezone,
      mentions: reminder.mentions,
      status: reminder.reminderSent ? "completed" : "active",
      createdAt: reminder.createdAt,
      createdBy: reminder.senderId || "system",
    };
  }

  /**
   * Create a new reminder using Prisma
   */
  async createReminder(
    chatId: string,
    message: string,
    scheduledTime: Date,
    mentions: string[] = [],
    createdBy: string = "system",
    timezone: string = DEFAULT_TIMEZONE
  ): Promise<ReminderDto> {
    const reminder = await prisma.reminder.create({
      data: {
        chatId,
        senderId: createdBy,
        title: message,
        mentions,
        remindAtUtc: scheduledTime,
        timezone,
      },
    });

    logger.info(`Created reminder ${reminder.id} for chat ${chatId}`);

    // Add to scheduler
    await reminderScheduler.addReminder(
      reminder.id,
      reminder.remindAtUtc,
      reminder.reminder24hSent,
      reminder.reminder1hSent
    );

    return this.toReminderDto(reminder);
  }

  /**
   * List reminders for a specific chat using Prisma
   */
  async listReminders(
    chatId: string,
    status?: "active" | "completed" | "cancelled" | "all"
  ): Promise<ReminderDto[]> {
    let whereClause: any = { chatId };

    if (status && status !== "all") {
      if (status === "active") {
        whereClause.reminderSent = false;
      } else if (status === "completed") {
        whereClause.reminderSent = true;
      }
      // Note: We don't have a cancelled status in the DB schema yet
      // You may want to add a status field to track cancelled reminders
    }

    const reminders = await prisma.reminder.findMany({
      where: whereClause,
      orderBy: { remindAtUtc: "asc" },
    });

    return reminders.map(this.toReminderDto);
  }

  /**
   * Get a specific reminder by ID using Prisma
   */
  async getReminder(reminderId: string): Promise<ReminderDto | null> {
    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
    });

    return reminder ? this.toReminderDto(reminder) : null;
  }

  /**
   * Cancel a reminder using Prisma
   * Note: Since we don't have a status field in the schema, we'll delete the reminder
   * or you can add a 'cancelled' boolean field to the schema
   */
  async cancelReminder(reminderId: string): Promise<boolean> {
    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });

      if (!reminder) {
        logger.warn(`Reminder ${reminderId} not found`);
        return false;
      }

      if (reminder.reminderSent) {
        logger.warn(`Reminder ${reminderId} is already completed`);
        return false;
      }

      // Delete the reminder (or you could add a 'cancelled' field)
      await prisma.reminder.delete({
        where: { id: reminderId },
      });

      logger.info(`Cancelled reminder ${reminderId}`);

      // Cancel scheduled jobs
      reminderScheduler.cancelReminder(reminderId);

      return true;
    } catch (error) {
      logger.error(`Error cancelling reminder ${reminderId}:`, error);
      return false;
    }
  }

  /**
   * Mark reminder as completed (called when the reminder is sent) using Prisma
   */
  async completeReminder(reminderId: string): Promise<boolean> {
    try {
      await prisma.reminder.update({
        where: { id: reminderId },
        data: { reminderSent: true },
      });

      logger.info(`Completed reminder ${reminderId}`);
      return true;
    } catch (error) {
      logger.error(`Error completing reminder ${reminderId}:`, error);
      return false;
    }
  }

  /**
   * Parse relative time strings to absolute Date using chrono-node
   * Examples: "in 2 hours", "tomorrow at 3pm", "next monday 10am", "Dec 15 at 2pm"
   */
  parseDateTime(dateTimeString: string): Date {
    const now = new Date();

    // Try to parse as ISO string first
    const isoDate = new Date(dateTimeString);
    if (!isNaN(isoDate.getTime()) && dateTimeString.includes("T")) {
      logger.info(`Parsed ISO date: ${isoDate}`);
      return isoDate;
    }

    // Use chrono-node for natural language parsing
    const parsed = chrono.parseDate(dateTimeString, now, { forwardDate: true });

    if (parsed) {
      logger.info(`Chrono parsed "${dateTimeString}" as ${parsed}`);
      return parsed;
    }

    // If chrono fails, try to extract relative time manually as fallback
    const lowerStr = dateTimeString.toLowerCase();
    const inMatch = lowerStr.match(/in (\d+) (hour|minute|day|week)s?/);

    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const futureDate = new Date(now);

      switch (unit) {
        case "minute":
          futureDate.setMinutes(futureDate.getMinutes() + amount);
          break;
        case "hour":
          futureDate.setHours(futureDate.getHours() + amount);
          break;
        case "day":
          futureDate.setDate(futureDate.getDate() + amount);
          break;
        case "week":
          futureDate.setDate(futureDate.getDate() + amount * 7);
          break;
      }

      logger.info(`Fallback parsed "${dateTimeString}" as ${futureDate}`);
      return futureDate;
    }

    // Default: return current time + 1 hour if can't parse
    logger.warn(
      `Could not parse datetime: "${dateTimeString}", defaulting to +1 hour`
    );
    const defaultDate = new Date(now);
    defaultDate.setHours(defaultDate.getHours() + 1);
    return defaultDate;
  }

  /**
   * Clean up old completed reminders using Prisma
   */
  async cleanupOldReminders(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.reminder.deleteMany({
      where: {
        reminderSent: true,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Cleaned up ${result.count} old reminders`);
    return result.count;
  }

  // formatReminderId(id: number): string {
  //   return `R-${id}`;
  // }

  // toReminderResponse(reminder: Reminder): ReminderResponse {
  //   return {
  //     reminderId: this.formatReminderId(reminder.reminderId),
  //     chatId: reminder.chatId,
  //     senderId: reminder.senderId || undefined,
  //     title: reminder.title,
  //     mentions: reminder.mentions,
  //     remindAtUtc: reminder.remindAtUtc,
  //     remindAtLocal: this.reminderLocalTime(
  //       reminder.remindAtUtc,
  //       reminder.timezone
  //     ),
  //     reminder1hSent: reminder.reminder1hSent,
  //     reminder24hSent: reminder.reminder24hSent,
  //     reminderSent: reminder.reminderSent,
  //   };
  // }

  // reminderLocalTime(remindAtUtc: Date, timezone: string): string {
  //   return DateTime.fromJSDate(remindAtUtc, { zone: "utc" })
  //     .setZone(timezone)
  //     .toISO();
  // }
}

// Singleton instance
export const reminderService = new ReminderService();
