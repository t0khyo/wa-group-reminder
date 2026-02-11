import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { taskService } from "../service/TaskService.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { cleanJidForDisplay } from "../utils/jidUtils.js";
import logger from "../utils/logger.js";

export class MyTasksCommand implements Command {
  name = "tasks";
  aliases = ["/tasks", "/task", "/t", "/my-tasks"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    // Parse status filter from command
    // /tasks pending → shows Pending + InProgress
    // /tasks done → shows Done only
    // /tasks cancelled → shows Cancelled only
    // /tasks → default behavior (active + recent closed)
    const args = context.text.trim().split(/\s+/);
    const statusFilter = args.length > 1 ? args[1].toLowerCase() : null;

    logger.info(
      `Fetching tasks for sender: ${context.senderId} in chat: ${context.chatId}, filter: ${statusFilter || 'default'}`
    );

    const myTasks = await taskService.getTasksAssignedTo(
      context.chatId,
      context.senderId
    );

    logger.info(
      `Found ${myTasks.length} total tasks assigned to ${context.senderId}`
    );

    let filteredTasks;
    let messageHeader = `> @${cleanJidForDisplay(context.senderId)}\n\n`;

    // Apply status filter
    if (statusFilter === 'pending') {
      // Show pending AND in-progress
      filteredTasks = myTasks.filter(
        (t) => t.status === TaskStatus.Pending || t.status === TaskStatus.InProgress
      );
      messageHeader += `You have *${filteredTasks.length}* active task(s):\n\n`;
      
      if (filteredTasks.length === 0) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: messageHeader + 'No active tasks! 🎉',
          mentions: [context.senderId],
        });
        return;
      }

      for (const task of filteredTasks) {
        const emoji = taskService.getStatusEmoji(task.status);
        const taskNumber = taskService.formatTaskId(task.taskId);
        messageHeader += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
      }

      await services.whatsapp.sendMessage(context.chatId, {
        text: messageHeader,
        mentions: [context.senderId],
      });
      return;
    }

    if (statusFilter === 'done') {
      filteredTasks = myTasks.filter((t) => t.status === TaskStatus.Done);
      messageHeader += `You have *${filteredTasks.length}* completed task(s):\n\n`;

      if (filteredTasks.length === 0) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: messageHeader + 'No completed tasks.',
          mentions: [context.senderId],
        });
        return;
      }

      // Sort by most recent first
      filteredTasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      for (const task of filteredTasks) {
        const emoji = taskService.getStatusEmoji(task.status);
        const taskNumber = taskService.formatTaskId(task.taskId);
        messageHeader += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
      }

      await services.whatsapp.sendMessage(context.chatId, {
        text: messageHeader,
        mentions: [context.senderId],
      });
      return;
    }

    if (statusFilter === 'cancelled') {
      filteredTasks = myTasks.filter((t) => t.status === TaskStatus.Cancelled);
      messageHeader += `You have *${filteredTasks.length}* cancelled task(s):\n\n`;

      if (filteredTasks.length === 0) {
        await services.whatsapp.sendMessage(context.chatId, {
          text: messageHeader + 'No cancelled tasks.',
          mentions: [context.senderId],
        });
        return;
      }

      // Sort by most recent first
      filteredTasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      for (const task of filteredTasks) {
        const emoji = taskService.getStatusEmoji(task.status);
        const taskNumber = taskService.formatTaskId(task.taskId);
        messageHeader += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
      }

      await services.whatsapp.sendMessage(context.chatId, {
        text: messageHeader,
        mentions: [context.senderId],
      });
      return;
    }

    // Default behavior (no filter or unrecognized filter)
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

    let message = `> @${cleanJidForDisplay(context.senderId)}\n\n`;

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
