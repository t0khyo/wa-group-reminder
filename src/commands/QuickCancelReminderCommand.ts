import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { reminderService } from "../service/ReminderService.js";
import logger from "../utils/logger.js";

export class QuickCancelReminderCommand implements Command {
  name = "cancel";
  aliases = ["/cancel"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    // Extract reminder number from message
    // Expected format: "/cancel R1" or "/cancel 1"
    const args = context.text.trim().split(/\s+/);
    
    if (args.length < 2) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: "⚠️ Usage: `/cancel R1` or `/cancel 1`",
      });
      return;
    }

    // Parse reminder number (handle both "R1" and "1")
    let reminderNumberStr = args[1].toUpperCase();
    if (reminderNumberStr.startsWith("R")) {
      reminderNumberStr = reminderNumberStr.substring(1);
    }
    
    const reminderNumber = parseInt(reminderNumberStr, 10);
    
    if (isNaN(reminderNumber)) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: `⚠️ Invalid reminder number: "${args[1]}". Use format: \`/cancel R1\` or \`/cancel 1\``,
      });
      return;
    }

    try {
      logger.info(`Quick cancel command: Reminder ${reminderNumber} in chat ${context.chatId}`);
      
      const reminder = await reminderService.getReminderByNumber(
        reminderNumber,
        context.chatId
      );

      if (!reminder) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: `❌ Reminder #${reminderNumber} not found`,
        });
        return;
      }

      await reminderService.cancelReminder(reminder.id);
      const formattedReminderNumber = reminderService.formatReminderId(reminder.reminderId);

      await services.whatsapp.sendMessage(context.chatId, {
          text: `🗑️ Reminder *${formattedReminderNumber}* - ${reminder.title}
        has been cancelled✅`,
      });
    } catch (error: any) {
      logger.error("Error in QuickCancelReminderCommand:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Failed to cancel reminder. Please try again.",
      });
    }
  }
}
