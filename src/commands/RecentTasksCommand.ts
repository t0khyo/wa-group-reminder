import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";

export class RecentTasksCommand implements Command {
  name = "recent-tasks";
  aliases = ["/recent-tasks", "/recent-task", "/recent-t", "/recent", "/r"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const recentTasks = await taskService.getRecentClosedTasks(context.chatId);

    if (recentTasks.length === 0) {
      await services.whatsapp.sendMessage(context.chatId, {
        text: "No tasks completed or cancelled in the last 7 days.",
      });
      return;
    }

    let message = `*Recently Closed Tasks* (Last 7 days)\n\n`;

    const completed = recentTasks.filter((t) => t.status === TaskStatus.Done);
    const cancelled = recentTasks.filter(
      (t) => t.status === TaskStatus.Cancelled
    );

    if (completed.length > 0) {
      message += `✅ *Completed (${completed.length}):*\n`;
      for (const task of completed) {
        const taskNumber = taskService.formatTaskId(task.taskId);
        const assignee =
          task.assignedTo.length > 0
            ? `@${cleanJidForDisplay(task.assignedTo[0])}`
            : "unassigned";
        message += `* *${taskNumber}* - ${task.title} (${assignee})\n`;
      }
      message += "\n";
    }

    if (cancelled.length > 0) {
      message += `*Cancelled (${cancelled.length}):*\n`;
      for (const task of cancelled) {
        const taskNumber = taskService.formatTaskId(task.taskId);
        const assignee =
          task.assignedTo.length > 0
            ? `@${cleanJidForDisplay(task.assignedTo[0])}`
            : "unassigned";
        message += `* *${taskNumber}* - ${task.title} (${assignee})\n`;
      }
    }

    // Extract mentions from tasks
    const mentions = recentTasks
      .filter((t) => t.assignedTo.length > 0)
      .map((t) => t.assignedTo[0])
      .filter((jid, index, self) => self.indexOf(jid) === index); // unique

    await services.whatsapp.sendMessage(context.chatId, {
      text: message,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
  }
}
