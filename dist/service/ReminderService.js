import logger from "../utils/logger.js";
import * as chrono from "chrono-node";
export class ReminderService {
    constructor() {
        // In-memory storage for now - replace with database later
        this.reminders = new Map();
    }
    /**
     * Create a new reminder
     */
    async createReminder(chatId, message, scheduledTime, mentions = [], createdBy = "system") {
        const reminderId = `REM-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const reminder = {
            id: reminderId,
            chatId,
            message,
            scheduledTime,
            mentions,
            status: "active",
            createdAt: new Date(),
            createdBy,
        };
        this.reminders.set(reminderId, reminder);
        logger.info(`Created reminder ${reminderId} for chat ${chatId}`);
        // TODO: Schedule the actual reminder job here
        // Example: Use node-schedule, bull queue, or similar
        this.scheduleReminderJob(reminder);
        return reminder;
    }
    /**
     * List reminders for a specific chat
     */
    async listReminders(chatId, status) {
        const allReminders = Array.from(this.reminders.values()).filter((r) => r.chatId === chatId);
        if (!status || status === "all") {
            return allReminders;
        }
        return allReminders.filter((r) => r.status === status);
    }
    /**
     * Get a specific reminder by ID
     */
    async getReminder(reminderId) {
        return this.reminders.get(reminderId) || null;
    }
    /**
     * Cancel a reminder
     */
    async cancelReminder(reminderId) {
        const reminder = this.reminders.get(reminderId);
        if (!reminder) {
            logger.warn(`Reminder ${reminderId} not found`);
            return false;
        }
        if (reminder.status === "completed" || reminder.status === "cancelled") {
            logger.warn(`Reminder ${reminderId} is already ${reminder.status}`);
            return false;
        }
        reminder.status = "cancelled";
        this.reminders.set(reminderId, reminder);
        logger.info(`Cancelled reminder ${reminderId}`);
        // TODO: Cancel the scheduled job
        this.cancelReminderJob(reminderId);
        return true;
    }
    /**
     * Mark reminder as completed (called when the reminder is sent)
     */
    async completeReminder(reminderId) {
        const reminder = this.reminders.get(reminderId);
        if (!reminder) {
            return false;
        }
        reminder.status = "completed";
        this.reminders.set(reminderId, reminder);
        logger.info(`Completed reminder ${reminderId}`);
        return true;
    }
    /**
     * Parse relative time strings to absolute Date using chrono-node
     * Examples: "in 2 hours", "tomorrow at 3pm", "next monday 10am", "Dec 15 at 2pm"
     */
    parseDateTime(dateTimeString) {
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
        logger.warn(`Could not parse datetime: "${dateTimeString}", defaulting to +1 hour`);
        const defaultDate = new Date(now);
        defaultDate.setHours(defaultDate.getHours() + 1);
        return defaultDate;
    }
    /**
     * Schedule the actual reminder job
     * TODO: Implement with a proper job scheduler (Bull, node-schedule, etc.)
     */
    scheduleReminderJob(reminder) {
        const delay = reminder.scheduledTime.getTime() - Date.now();
        if (delay > 0) {
            logger.info(`Scheduling reminder ${reminder.id} to fire in ${Math.round(delay / 1000)} seconds`);
            // Simple setTimeout for demonstration - replace with proper job queue
            setTimeout(() => {
                this.executeReminder(reminder.id);
            }, delay);
        }
        else {
            logger.warn(`Reminder ${reminder.id} scheduled time is in the past`);
        }
    }
    /**
     * Cancel a scheduled reminder job
     * TODO: Implement with your job scheduler
     */
    cancelReminderJob(reminderId) {
        logger.info(`Cancelling scheduled job for reminder ${reminderId}`);
        // TODO: Cancel the scheduled job in your queue system
    }
    /**
     * Execute the reminder (send the message)
     * TODO: Integrate with WhatsappService to actually send the message
     */
    async executeReminder(reminderId) {
        const reminder = this.reminders.get(reminderId);
        if (!reminder || reminder.status !== "active") {
            return;
        }
        logger.info(`Executing reminder ${reminderId}: ${reminder.message}`);
        // TODO: Send the actual WhatsApp message here
        // Example:
        // const whatsappService = new WhatsappService();
        // await whatsappService.sendMessage(reminder.chatId, {
        //   text: `⏰ Reminder: ${reminder.message}`,
        //   mentions: reminder.mentions
        // });
        await this.completeReminder(reminderId);
    }
    /**
     * Clean up old completed/cancelled reminders
     */
    async cleanupOldReminders(olderThanDays = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        let cleaned = 0;
        for (const [id, reminder] of this.reminders.entries()) {
            if ((reminder.status === "completed" || reminder.status === "cancelled") &&
                reminder.createdAt < cutoffDate) {
                this.reminders.delete(id);
                cleaned++;
            }
        }
        logger.info(`Cleaned up ${cleaned} old reminders`);
        return cleaned;
    }
}
// Singleton instance
export const reminderService = new ReminderService();
