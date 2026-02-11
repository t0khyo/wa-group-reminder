import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";
import logger from "../utils/logger.js";

export class SearchTasksCommand implements Command {
  name = "search-tasks";
  aliases = ["/search-tasks", "/search", "/find"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    // Extract query: "/search keyword" or "/search-tasks keyword phrase"
    const args = context.text.trim().split(/\s+/);
    
    if (args.length < 2) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: "⚠️ Usage: `/search keyword` or `/search-tasks keyword phrase`",
      });
      return;
    }

    const query = args.slice(1).join(" "); // Join all args after command
    
    try {
      logger.info(`Search command: "${query}" in chat ${context.chatId}`);
      
      const results = await taskService.searchTasks(context.chatId, query, {
        limit: 15,
      });

      if (results.length === 0) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: `No tasks found matching "*${query}*"`,
        });
        return;
      }

      // Group by assignee
      const byUser = new Map<string, typeof results>();
      const unassigned: typeof results = [];

      for (const task of results) {
        if (!task.assignedTo || task.assignedTo.length === 0) {
          unassigned.push(task);
        } else {
          for (const userId of task.assignedTo) {
            const tasks = byUser.get(userId) || [];
            tasks.push(task);
            byUser.set(userId, tasks);
          }
        }
      }

      let message = `🔍 Found *${results.length}* task(s) for "*${query}*"\n\n`;

      // Display by user
      for (const [userId, tasks] of byUser) {
        message += `> @${cleanJidForDisplay(userId)}\n`;
        for (const task of tasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
        message += '\n';
      }

      // Unassigned tasks
      if (unassigned.length > 0) {
        message += `*Unassigned:*\n`;
        for (const task of unassigned) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
      }

      const mentions = Array.from(byUser.keys());
      await services.whatsapp.sendMessage(context.chatId, {
        text: message,
        mentions,
      });
    } catch (error: any) {
      logger.error("Error in SearchTasksCommand:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Search failed. Please try again.",
      });
    }
  }
}
