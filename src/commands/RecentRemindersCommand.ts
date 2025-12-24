import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { reminderService } from "../service/ReminderService.js";
import { DateTime } from "luxon";
import { cleanJidForDisplay } from "../utils/jidUtils.js";

export class RecentRemindersCommand implements Command {
  name = "recent-reminders";
  aliases = [
    "/recent-reminders",
    "/recent-reminder",
    "/recent-meetings",
    "/recent-meeting",
    "/recent-r",
    "/recent-m",
  ];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const recentReminders = await reminderService.getRecentCompletedReminders(
      context.chatId
    );

    if (recentReminders.length === 0) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: "No reminders completed in the last 7 days.",
      });
      return;
    }

    let message = `*Recently Completed Reminders* (Last 7 days)\n\n`;
    message += `✅ *Completed (${recentReminders.length}):*\n`;

    for (const reminder of recentReminders) {
      const reminderNumber = reminderService.formatReminderId(
        reminder.reminderId
      );

      // Parse the scheduled time to get individual components
      const dt = DateTime.fromJSDate(reminder.scheduledTime, {
        zone: "Asia/Kuwait",
      });

      const date = dt.toFormat("d MMM yyyy");
      const time = dt.toFormat("h:mm a");

      const mentionsList =
        reminder.mentions && reminder.mentions.length > 0
          ? ` (${reminder.mentions
              .map((m) => `@${cleanJidForDisplay(m)}`)
              .join(", ")})`
          : "";

      message += `* *${reminderNumber}* - ${reminder.message} - ${date} at ${time}${mentionsList}\n\n`;
    }

    // Extract all mentions from reminders
    const mentions: string[] = [];
    for (const reminder of recentReminders) {
      if (reminder.mentions) {
        for (const mention of reminder.mentions) {
          if (!mentions.includes(mention)) {
            mentions.push(mention);
          }
        }
      }
    }

    await services.whatsapp.sendMessage(context.chatId, {
      text: message,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
  }
}
