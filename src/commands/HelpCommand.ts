import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";

export class HelpCommand implements Command {
  name = "help";
  aliases = ["/help", "/h"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const message = `*GiGi Commands*

*Task Commands:*
• \`/tasks\` - Your active tasks
• \`/all-tasks\` - All group tasks
• \`/recent-tasks\` - Recently closed tasks
• \`/task-digest\` - Manual task digest

*Reminder Commands:*
• \`/reminders\` or \`/meetings\` - Your active reminders
• \`/all-reminders\` or \`/all-meetings\` - All group reminders
• \`/recent-reminders\` or \`/recent-meetings\` - Recently completed reminders

*Other:*
• \`/help\` - Show this message

💬 *Chat naturally by mentioning me to:*
• Create tasks & reminders
• Update task status
• List & manage tasks

📌 Mention users to assign tasks or say "assign me"`;

    await services.whatsapp.sendMessage(context.chatId, {
      text: message,
    });
  }
}
