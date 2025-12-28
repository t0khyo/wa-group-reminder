import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";
import logger from "../utils/logger.js";

export class MyTasksCommand implements Command {
  name = "tasks";
  aliases = ["/tasks", "/task", "/t"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    logger.info(
      `Fetching tasks for sender: ${context.senderId} in chat: ${context.chatId}`
    );

    const myTasks = await taskService.getTasksAssignedTo(
      context.chatId,
      context.senderId
    );

    logger.info(
      `Found ${myTasks.length} total tasks assigned to ${context.senderId}`
    );
    logger.info(
      `Tasks: ${JSON.stringify(
        myTasks.map((t) => ({
          id: t.taskId,
          title: t.title,
          status: t.status,
          assignedTo: t.assignedTo,
        }))
      )}`
    );

    const activeTasks = myTasks.filter(
      (t) =>
        t.status === TaskStatus.Pending || t.status === TaskStatus.InProgress
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentClosedTasks = myTasks.filter(
      (t) =>
        (t.status === TaskStatus.Done || t.status === TaskStatus.Cancelled) &&
        new Date(t.updatedAt) >= sevenDaysAgo
    );
    // Sort recent closed tasks by date descending
    recentClosedTasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    logger.info(
      `Filtered to ${activeTasks.length} active tasks and ${recentClosedTasks.length} recent closed tasks`
    );

    const cleanSender = cleanJidForDisplay(context.senderId);
    let message = `> @${cleanSender}\n\n`;

    if (activeTasks.length === 0 && recentClosedTasks.length === 0) {
      message += `You have no active or recent tasks! 🎉`;
    } else {
      // --- Active Tasks ---
      if (activeTasks.length === 0) {
         message += `You have no active tasks! 🎉\n`;
      } else {
         message += `You have *${activeTasks.length}* active task(s):\n\n`;

         for (const task of activeTasks) {
            const emoji = taskService.getStatusEmoji(task.status);
            const taskNumber = taskService.formatTaskId(task.taskId);
            message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
         }
      }

      // --- Recent Closed Tasks ---
      if (recentClosedTasks.length > 0) {
          if (activeTasks.length > 0) message += `\n`;
          message += `*Recently Completed (Last 7 Days):*\n`;
          for (const task of recentClosedTasks) {
              const emoji = taskService.getStatusEmoji(task.status);
              const taskNumber = taskService.formatTaskId(task.taskId);
              message += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
          }
      }
    }

    await services.whatsapp.sendMessage(context.chatId, {
      text: message,
      mentions: [context.senderId],
    });
  }
}
