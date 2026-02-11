import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";

export class HelpCommand implements Command {
  name = "help";
  aliases = ["/help", "/h"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const message = `*GiGi Commands*

*Task Commands:*
• \`/tasks\` or \`/my-tasks\` - Your active tasks
• \`/tasks pending\` - Active tasks (pending + in-progress)
• \`/tasks done\` - Completed tasks
• \`/tasks cancelled\` - Cancelled tasks
• \`/all-tasks\` - All group tasks
• \`/search keyword\` - Search tasks by keyword
• \`/recent-tasks\` - Recently closed tasks
• \`/task-digest\` - Manual task digest
• \`/done T1\` - Quick: Mark task as done

*Reminder Commands:*
• \`/reminders\` or \`/meetings\` - Your active reminders
• \`/all-reminders\` or \`/all-meetings\` - All group reminders
• \`/recent-reminders\` or \`/recent-meetings\` - Recently completed reminders
• \`/cancel R1\` - Quick: Cancel reminder

*Other:*
• \`/help\` - Show this message
• \`/clear-history\` - Clear your AI conversation history

💬 *Chat naturally by mentioning me to:*
• Create tasks & reminders
• Update task status
• List & manage tasks

📌 Mention users to assign tasks or say "assign me"

_I'm GiGi, your group assistant! Mention me (@GiGi) to chat or create tasks/reminders._
`;

    await services.whatsapp.sendMessage(context.chatId, {
      text: message,
    });
  }
}
