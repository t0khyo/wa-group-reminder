import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { reminderService } from "../service/ReminderService.js";
import { DateTime } from "luxon";
import { cleanJidForDisplay } from "../utils/jidUtils.js";

export class MyRemindersCommand implements Command {
  name = "reminders";
  aliases = [
    "/reminders",
    "/reminder",
    "/meetings",
    "/meeting",
    "/my-reminders",
    "/my-meetings",
    "/m",
  ];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const allReminders = await reminderService.listReminders(
      context.chatId,
      "active"
    );

    // Filter reminders where the sender is mentioned or is the creator
    const myReminders = allReminders.filter(
      (r) =>
        r.mentions?.includes(context.senderId) ||
        r.createdBy === context.senderId
    );

    if (myReminders.length === 0) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: `> @${cleanJidForDisplay(
          context.senderId
        )}\n\nYou have no active reminders.`,
        mentions: [context.senderId],
      });
      return;
    }

    let message = `> @${cleanJidForDisplay(context.senderId)}\n\n`;
    message += `You have *${myReminders.length}* Active Reminder${
      myReminders.length > 1 ? "s" : ""
    }\n\n`;

    for (const reminder of myReminders) {
      const reminderNumber = reminderService.formatReminderId(
        reminder.reminderId
      );

      // Parse the scheduled time to get individual components
      const dt = DateTime.fromJSDate(reminder.scheduledTime, {
        zone: "Asia/Kuwait",
      });

      const date = dt.toFormat("d MMM yyyy");
      const day = dt.toFormat("EEEE");
      const time = dt.toFormat("h:mm a");

      message += `*${reminderNumber}* - ${reminder.message}\n\n`;
      message += `Date: ${date}\n`;
      message += `Day: ${day}\n`;
      message += `Time: ${time}`;

      if (reminder.mentions && reminder.mentions.length > 0) {
        const mentionsList = reminder.mentions
          .map((m) => `> @${cleanJidForDisplay(m)}`)
          .join("\n");
        message += `\n\n${mentionsList}`;
      }

      message += `\n\n---\n\n`;
    }

    // Extract all unique mentions from the sender's reminders
    const mentions: string[] = [context.senderId];
    for (const reminder of myReminders) {
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
      mentions: mentions,
    });
  }
}
