import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";

export class AllTasksCommand implements Command {
  name = "all-tasks";
  aliases = ["/all-tasks", "/all-task", "/all-t", "/alltasks", "/alltask"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    const stats = await taskService.getTaskStats(context.chatId);
    const pendingTasks = await taskService.listTasks(
      context.chatId,
      TaskStatus.Pending
    );
    const inProgressTasks = await taskService.listTasks(
      context.chatId,
      TaskStatus.InProgress
    );

    const activeTasks = [...pendingTasks, ...inProgressTasks];

    let message = `*All Active Tasks*\n\n`;
    message += `*Statistics:*\n`;
    message += `Total: ${stats.total}\n`;
    message += `🟡 Pending: ${stats.pending}\n`;
    message += `🟠 In Progress: ${stats.inProgress}\n`;
    message += `🟢 Done: ${stats.done}\n`;
    message += `🔴 Cancelled: ${stats.cancelled}\n\n`;

    if (activeTasks.length === 0) {
      message += `No active tasks! 🎉`;
    } else {
      message += `*Active Tasks (${activeTasks.length}):*\n\n`;

      // Group by assignee
      const tasksByAssignee = new Map<string, typeof activeTasks>();
      const unassignedTasks: typeof activeTasks = [];

      for (const task of activeTasks) {
        if (task.assignedTo && task.assignedTo.length > 0) {
          for (const assignee of task.assignedTo) {
            const assigneeTasks = tasksByAssignee.get(assignee) || [];
            assigneeTasks.push(task);
            tasksByAssignee.set(assignee, assigneeTasks);
          }
        } else {
          unassignedTasks.push(task);
        }
      }

      // Display tasks by assignee
      for (const [assignee, tasks] of tasksByAssignee.entries()) {
        const cleanAssignee = cleanJidForDisplay(assignee);
        message += `> @${cleanAssignee}\n`;
        for (const task of tasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
        message += `\n`;
      }

      // Unassigned tasks
      if (unassignedTasks.length > 0) {
        message += `*Unassigned:*\n`;
        for (const task of unassignedTasks) {
          const emoji = taskService.getStatusEmoji(task.status);
          const taskNumber = taskService.formatTaskId(task.taskId);
          message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
      }
    }

    // Collect mentions
    const mentions: string[] = [];
    for (const task of activeTasks) {
      if (task.assignedTo) {
        for (const assignee of task.assignedTo) {
          if (!mentions.includes(assignee)) {
            mentions.push(assignee);
          }
        }
      }
    }

    await services.whatsapp.sendMessage(context.chatId, { text: message, mentions });
  }
}
