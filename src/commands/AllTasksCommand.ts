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

    // Send statistics first
    let statsMessage = `*All Tasks Overview*\n\n`;
    statsMessage += `*Statistics:*\n`;
    statsMessage += `Total: ${stats.total}\n`;
    statsMessage += `🟡 Pending: ${stats.pending}\n`;
    statsMessage += `🟠 In Progress: ${stats.inProgress}\n`;
    statsMessage += `🟢 Done: ${stats.done}\n`;
    statsMessage += `🔴 Cancelled: ${stats.cancelled}\n`;
    
    await services.whatsapp.sendMessage(context.chatId, { text: statsMessage });

    // Identify all unique users involved (active or recent)
    const allUserIds = new Set<string>();
    
    // Group active tasks by assignee
    const activeTasksByUser = new Map<string, typeof activeTasks>();
    const unassignedActiveTasks: typeof activeTasks = [];

    for (const task of activeTasks) {
      if (task.assignedTo && task.assignedTo.length > 0) {
        for (const assignee of task.assignedTo) {
          allUserIds.add(assignee);
          const tasks = activeTasksByUser.get(assignee) || [];
          tasks.push(task);
          activeTasksByUser.set(assignee, tasks);
        }
      } else {
        unassignedActiveTasks.push(task);
      }
    }

    // Recent closed tasks
    const recentClosedTasks = await taskService.getRecentClosedTasks(context.chatId, 7);
    
    // Group recent tasks by assignee
    const recentTasksByUser = new Map<string, typeof recentClosedTasks>();
    
    for (const task of recentClosedTasks) {
       if (task.assignedTo && task.assignedTo.length > 0) {
        for (const assignee of task.assignedTo) {
          allUserIds.add(assignee);
          const tasks = recentTasksByUser.get(assignee) || [];
          tasks.push(task);
          recentTasksByUser.set(assignee, tasks);
        }
      }
    }

    if (allUserIds.size === 0 && unassignedActiveTasks.length === 0) {
         await services.whatsapp.sendMessage(context.chatId, { text: "No active or recent tasks found." });
         return;
    }

    // Send message for each user
    for (const userId of allUserIds) {
        const userActiveTasks = activeTasksByUser.get(userId) || [];
        const userRecentTasks = recentTasksByUser.get(userId) || [];
        
        // Skip users with no tasks at all (though Set logic ensures this shouldn't happen unless tasks were filtered out)
        if (userActiveTasks.length === 0 && userRecentTasks.length === 0) continue;

        let userMessage = `> @${cleanJidForDisplay(userId)}\n\n`;

        // Active Section
        if (userActiveTasks.length > 0) {
            userMessage += `*Active Tasks (${userActiveTasks.length}):*\n`;
            userActiveTasks.sort((a, b) => a.taskId - b.taskId);
            for (const task of userActiveTasks) {
                const emoji = taskService.getStatusEmoji(task.status);
                const taskNumber = taskService.formatTaskId(task.taskId);
                userMessage += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
            }
        } else {
            userMessage += `No active tasks.\n`;
        }

        // Recent Section
        if (userRecentTasks.length > 0) {
            userMessage += `\n*Recently Completed/Cancelled (Last 7 Days):*\n`;
            userRecentTasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            for (const task of userRecentTasks) {
                const emoji = taskService.getStatusEmoji(task.status);
                const taskNumber = taskService.formatTaskId(task.taskId);
                userMessage += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
            }
        }

        await services.whatsapp.sendMessage(context.chatId, { 
            text: userMessage, 
            mentions: [userId] 
        });
    }

    // Send unassigned tasks if any
    if (unassignedActiveTasks.length > 0) {
        let unassignedMessage = `*Unassigned Tasks (${unassignedActiveTasks.length}):*\n`;
        unassignedActiveTasks.sort((a, b) => a.taskId - b.taskId);
        for (const task of unassignedActiveTasks) {
            const emoji = taskService.getStatusEmoji(task.status);
            const taskNumber = taskService.formatTaskId(task.taskId);
            unassignedMessage += `* *${taskNumber}* - ${task.title} ${emoji}\n`;
        }
        await services.whatsapp.sendMessage(context.chatId, { text: unassignedMessage });
    }
  }
}
