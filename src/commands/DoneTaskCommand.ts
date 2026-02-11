import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import logger from "../utils/logger.js";

export class DoneTaskCommand implements Command {
  name = "done";
  aliases = ["/done"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    // Extract task number from message
    // Expected format: "/done T1" or "/done 1"
    const args = context.text.trim().split(/\s+/);
    
    if (args.length < 2) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: "⚠️ Usage: `/done T1` or `/done 1`",
      });
      return;
    }

    // Parse task number (handle both "T1" and "1")
    let taskNumberStr = args[1].toUpperCase();
    if (taskNumberStr.startsWith("T")) {
      taskNumberStr = taskNumberStr.substring(1);
    }
    
    const taskNumber = parseInt(taskNumberStr, 10);
    
    if (isNaN(taskNumber)) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: `⚠️ Invalid task number: "${args[1]}". Use format: \`/done T1\` or \`/done 1\``,
      });
      return;
    }

    try {
      logger.info(`Quick done command: Task ${taskNumber} in chat ${context.chatId}`);
      
      const task = await taskService.getTaskByNumber(taskNumber, context.chatId);

      if (!task) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: `❌ Task #${taskNumber} not found`,
        });
        return;
      }

      const updatedTask = await taskService.updateTaskStatus(task.id, TaskStatus.Done);
      const formattedTaskNumber = taskService.formatTaskId(updatedTask.taskId);
      const statusEmoji = taskService.getStatusEmoji(updatedTask.status);

      await services.whatsapp.sendMessage(context.chatId, {
        text: `✅ *${formattedTaskNumber}* - ${updatedTask.title} ${statusEmoji}`,
      });
    } catch (error: any) {
      logger.error("Error in DoneTaskCommand:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Failed to update task. Please try again.",
      });
    }
  }
}
