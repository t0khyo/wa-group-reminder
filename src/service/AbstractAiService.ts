import { IAiService } from "./IAiService.js";
import logger from "../utils/logger.js";
import { reminderService } from "./ReminderService.js";
import { taskService } from "./TaskService.js";
import { parseDateTime } from "../utils/DateParser.js";
import { TaskStatus } from "../generated/prisma/client.js";

interface ReminderParams {
  message: string;
  datetime: string;
}

interface ListRemindersParams {
  status?: "active" | "completed" | "all";
}

interface CancelReminderParams {
  reminder_number: number;
}

interface UpdateReminderParams {
  reminder_number: number;
  message?: string;
  datetime?: string;
}

interface CreateTaskParams {
  title: string;
  assign_to_sender?: boolean;
  use_first_mention?: boolean;
}

interface ListTasksParams {
  status?: "Pending" | "InProgress" | "Done" | "Cancelled" | "all";
  assign_to_sender?: boolean;
  user_mention_index?: number;
}

interface UpdateTaskParams {
  task_number: number;
  status: "Pending" | "InProgress" | "Done" | "Cancelled";
}

interface DeleteTaskParams {
  task_number: number;
}

interface CreateBulkTasksParams {
  tasks_by_user: Array<{
    assign_to_sender?: boolean;
    user_mention_index?: number;
    tasks: string[];
  }>;
}

export abstract class AbstractAiService implements IAiService {
    protected senderIds: Map<string, string> = new Map();
    protected mentionedJids: Map<string, string[]> = new Map();
    protected rawTexts: Map<string, string> = new Map();
    protected functionHandlers: Map<
        string,
        (args: any, chatId: string) => Promise<string>
    >;

    constructor() {
        this.functionHandlers = new Map();
        this.initializeFunctionHandlers();
    }

    abstract generateReply(
        text: string,
        userId: string,
        senderId?: string,
        mentionedJids?: string[],
        rawText?: string
    ): Promise<{ text: string; mentions?: string[] }>;

    abstract clearHistory(userId: string): void;
    abstract clearAllHistories(): void;

    protected initializeFunctionHandlers(): void {
        this.functionHandlers.set("create_reminder", this.handleCreateReminder.bind(this));
        this.functionHandlers.set("list_reminders", this.handleListReminders.bind(this));
        this.functionHandlers.set("cancel_reminder", this.handleCancelReminder.bind(this));
        this.functionHandlers.set("update_reminder", this.handleUpdateReminder.bind(this));
        this.functionHandlers.set("create_task", this.handleCreateTask.bind(this));
        this.functionHandlers.set("list_tasks", this.handleListTasks.bind(this));
        this.functionHandlers.set("update_task", this.handleUpdateTask.bind(this));
        this.functionHandlers.set("delete_task", this.handleDeleteTask.bind(this));
        this.functionHandlers.set("create_bulk_tasks", this.handleCreateBulkTasks.bind(this));
    }

    // --- Tool Implementations (Copied from AiService.ts) ---

    protected async handleCreateReminder(args: ReminderParams, chatId: string): Promise<string> {
        try {
            logger.info(`Creating reminder in chat ${chatId}:`, args);
            const scheduledTime = parseDateTime(args.datetime);
            const senderId = this.senderIds.get(chatId) || "system";
            const contextMentions = this.mentionedJids.get(chatId) || [];

            const reminder = await reminderService.createReminder(
                chatId,
                args.message,
                scheduledTime.utc,
                contextMentions,
                senderId
            );

            return JSON.stringify({
                success: true,
                reminder_number: reminder.reminderNumber,
                message: `Reminder created! I'll remind you on ${reminder.scheduledTimeLocal}`,
                details: {
                    reminder_number: reminder.reminderNumber,
                    message: args.message,
                    scheduled_time: reminder.scheduledTimeLocal,
                    mentions: contextMentions,
                },
            });
        } catch (error: any) {
            logger.error("Error creating reminder:", error.toString());
            return JSON.stringify({
                success: false,
                error: "Failed to create reminder: " + error.message,
            });
        }
    }

    protected async handleListReminders(args: ListRemindersParams, chatId: string): Promise<string> {
        try {
            logger.info(`Listing reminders for chat ${chatId}:`, args);
            const reminders = await reminderService.listReminders(chatId, args.status || "active");

            if (reminders.length === 0) {
                return JSON.stringify({
                    success: true,
                    count: 0,
                    reminders: [],
                    message: `No ${args.status || "active"} reminders found.`,
                });
            }

            const formattedReminders = reminders.map((r) => ({
                id: r.id,
                reminder_number: reminderService.formatReminderId(r.reminderId),
                message: r.message,
                scheduled_time: r.scheduledTimeLocal,
                status: r.status,
                mentions: r.mentions || [],
            }));

            return JSON.stringify({
                success: true,
                count: reminders.length,
                reminders: formattedReminders,
                message: `Found ${reminders.length} ${args.status || "active"} reminder(s)`,
            });
        } catch (error: any) {
            logger.error("Error listing reminders:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to list reminders: " + error.message,
            });
        }
    }

    protected async handleCancelReminder(args: CancelReminderParams, chatId: string): Promise<string> {
        try {
            logger.info(`Canceling reminder ${args.reminder_number} in chat ${chatId}`);
            const reminder = await reminderService.getReminderByNumber(args.reminder_number, chatId);

            if (!reminder) {
                return JSON.stringify({
                    success: false,
                    error: `Reminder #${args.reminder_number} not found`,
                });
            }

            const success = await reminderService.cancelReminder(reminder.id);
            const reminderNumber = reminderService.formatReminderId(args.reminder_number);

            if (success) {
                return JSON.stringify({
                    success: true,
                    message: `✅ Reminder ${reminderNumber} has been cancelled`,
                    reminder_number: reminderNumber,
                });
            } else {
                return JSON.stringify({
                    success: false,
                    error: `Reminder ${reminderNumber} not found or already completed/cancelled`,
                });
            }
        } catch (error: any) {
            logger.error("Error canceling reminder:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to cancel reminder: " + error.message,
            });
        }
    }

    protected async handleUpdateReminder(args: UpdateReminderParams, chatId: string): Promise<string> {
        try {
            logger.info(`Updating reminder ${args.reminder_number} in chat ${chatId}:`, args);
            if (!args.message && !args.datetime) {
                return JSON.stringify({
                    success: false,
                    error: "At least one field (message or datetime) must be provided to update",
                });
            }

            const reminder = await reminderService.getReminderByNumber(args.reminder_number, chatId);
            if (!reminder) {
                return JSON.stringify({
                    success: false,
                    error: `Reminder #${args.reminder_number} not found`,
                });
            }

            const updates: { message?: string; scheduledTime?: Date } = {};
            if (args.message) updates.message = args.message;
            if (args.datetime) {
                const scheduledTime = parseDateTime(args.datetime);
                updates.scheduledTime = scheduledTime.utc;
            }

            const updatedReminder = await reminderService.updateReminder(reminder.id, updates);

            if (updatedReminder) {
                let updateDetails = [];
                if (args.message) updateDetails.push(`message to "${args.message}"`);
                if (args.datetime) updateDetails.push(`time to ${updatedReminder.scheduledTimeLocal}`);

                return JSON.stringify({
                    success: true,
                    reminder_number: updatedReminder.reminderNumber,
                    message: `✅ Updated reminder ${updateDetails.join(" and ")}`,
                    details: {
                        reminder_number: updatedReminder.reminderNumber,
                        message: updatedReminder.message,
                        scheduled_time: updatedReminder.scheduledTimeLocal,
                    },
                });
            } else {
                return JSON.stringify({
                    success: false,
                    error: `Reminder #${args.reminder_number} not found or already completed`,
                });
            }
        } catch (error: any) {
            logger.error("Error updating reminder:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to update reminder: " + error.message,
            });
        }
    }

    protected async handleCreateTask(args: CreateTaskParams, chatId: string): Promise<string> {
        try {
            logger.info(`Creating task in chat ${chatId}:`, args);
            let assignedTo: string | undefined = undefined;
            const senderId = this.senderIds.get(chatId);
            const mentions = this.mentionedJids.get(chatId) || [];

            if (args.assign_to_sender) {
                if (senderId) assignedTo = senderId;
            } else if (mentions.length > 0) {
                assignedTo = mentions[0];
            } else {
                if (senderId) assignedTo = senderId;
            }

            const task = await taskService.createTask({
                chatId,
                title: args.title,
                assignedTo: assignedTo ? [assignedTo] : [],
            });

            const taskNumber = taskService.formatTaskId(task.taskId);
            let message = `Task created: ${taskNumber}`;
            if (assignedTo) message += `\nAssigned to: ${assignedTo}`;

            return JSON.stringify({
                success: true,
                task_id: task.id,
                task_number: taskNumber,
                message,
                details: {
                    id: task.id,
                    taskId: task.taskId,
                    title: args.title,
                    assigned_to: assignedTo ? [assignedTo] : [],
                },
            });
        } catch (error: any) {
            logger.error("Error creating task:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to create task: " + error.message,
            });
        }
    }

    protected async handleListTasks(args: ListTasksParams, chatId: string): Promise<string> {
        try {
            logger.info(`Listing tasks for chat ${chatId}:`, args);
            const status = args.status === "all" ? undefined : (args.status as TaskStatus);
            
            let assignedTo: string | undefined;
            const senderId = this.senderIds.get(chatId);
            const mentionedJids = this.mentionedJids.get(chatId) || [];

            if (args.assign_to_sender) {
                if (senderId) assignedTo = senderId;
            } else if (args.user_mention_index !== undefined) {
                 if (args.user_mention_index >= 0 && args.user_mention_index < mentionedJids.length) {
                     assignedTo = mentionedJids[args.user_mention_index];
                 }
            }

            const tasks = await taskService.listTasks(chatId, status, assignedTo);
            
            // Also fetch recent closed tasks for context
            let recentClosedTasks = await taskService.getRecentClosedTasks(chatId, 7);
            if (assignedTo) {
                recentClosedTasks = recentClosedTasks.filter(t => t.assignedTo && t.assignedTo.includes(assignedTo));
            }

            const formattedTasks = tasks.map((t) => ({
                id: t.id,
                task_number: taskService.formatTaskId(t.taskId),
                title: t.title,
                status: t.status,
                assigned_to: t.assignedTo,
                emoji: taskService.getStatusEmoji(t.status),
            }));

            const formattedRecentTasks = recentClosedTasks.map((t) => ({
                id: t.id,
                task_number: taskService.formatTaskId(t.taskId),
                title: t.title,
                status: t.status,
                assigned_to: t.assignedTo,
                emoji: taskService.getStatusEmoji(t.status),
            }));

            return JSON.stringify({
                success: true,
                count: tasks.length,
                tasks: formattedTasks,
                recent_completed_tasks: formattedRecentTasks,
                message: `Found ${tasks.length} ${args.status || "pending"} task(s). Also found ${recentClosedTasks.length} recently completed tasks.`,
            });
        } catch (error: any) {
            logger.error("Error listing tasks:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to list tasks: " + error.message,
            });
        }
    }

    protected async handleUpdateTask(args: UpdateTaskParams, chatId: string): Promise<string> {
        try {
            logger.info(`Updating task ${args.task_number} in chat ${chatId}:`, args);
            const taskNumber = Number(args.task_number);
            const task = await taskService.getTaskByNumber(taskNumber, chatId);

            if (!task) {
                return JSON.stringify({
                    success: false,
                    error: `Task #${args.task_number} not found`,
                });
            }

            const updatedTask = await taskService.updateTaskStatus(task.id, args.status as TaskStatus);
            const formattedTaskNumber = taskService.formatTaskId(updatedTask.taskId);

            return JSON.stringify({
                success: true,
                task_id: updatedTask.id,
                task_number: formattedTaskNumber,
                message: `✅ Task ${formattedTaskNumber} status updated to ${args.status}`,
                details: {
                    id: updatedTask.id,
                    taskId: updatedTask.taskId,
                    title: updatedTask.title,
                    status: updatedTask.status,
                    assigned_to: updatedTask.assignedTo,
                },
            });
        } catch (error: any) {
            logger.error("Error updating task:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to update task: " + error.message,
            });
        }
    }

    protected async handleDeleteTask(args: DeleteTaskParams, chatId: string): Promise<string> {
        try {
            logger.info(`Deleting task ${args.task_number} in chat ${chatId}`);
            const task = await taskService.getTaskByNumber(args.task_number, chatId);

            if (!task) {
                return JSON.stringify({
                    success: false,
                    error: `Task #${args.task_number} not found`,
                });
            }

            const success = await taskService.deleteTask(task.id);

            if (success) {
                return JSON.stringify({
                    success: true,
                    message: `🗑️ Task ${taskService.formatTaskId(args.task_number)} deleted successfully`,
                    task_number: args.task_number,
                });
            } else {
                return JSON.stringify({
                    success: false,
                    error: `Failed to delete task #${args.task_number}`,
                });
            }
        } catch (error: any) {
            logger.error("Error deleting task:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to delete task: " + error.message,
            });
        }
    }



    protected async handleCreateBulkTasks(args: CreateBulkTasksParams, chatId: string): Promise<string> {
        try {
            logger.info(`Creating bulk tasks in chat ${chatId}:`, args);
            const mentionedJids = this.mentionedJids.get(chatId) || [];
            const senderId = this.senderIds.get(chatId);
            const createdTasks: Array<{ task_number: string; title: string; assigned_to: string[] }> = [];
            const errors: string[] = [];

            for (const userTasks of args.tasks_by_user) {
                const { assign_to_sender, user_mention_index, tasks } = userTasks;
                let assignedToJid: string | undefined;

                if (assign_to_sender) {
                   if (!senderId) {
                       errors.push("Cannot assign to sender: senderId not found");
                       continue;
                   }
                   assignedToJid = senderId;
                } else {
                    if (user_mention_index === undefined || user_mention_index < 0 || user_mention_index >= mentionedJids.length) {
                        errors.push(`Invalid mention index ${user_mention_index} (available: 0-${mentionedJids.length - 1})`);
                        continue;
                    }
                    assignedToJid = mentionedJids[user_mention_index];
                }

                for (const taskTitle of tasks) {
                    if (!taskTitle || taskTitle.trim().length === 0) continue;
                    
                    let cleanedTitle = taskTitle.trim();
                    cleanedTitle = cleanedTitle.replace(/[🟡🟠🟢🔴]/g, "").trim();
                    cleanedTitle = cleanedTitle.replace(/^[\*\-\•\⁠]+/, "").trim();
                    cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

                    if (cleanedTitle.length === 0) continue;

                    try {
                        const task = await taskService.createTask({
                            chatId,
                            senderId: senderId || undefined,
                            title: cleanedTitle,
                            assignedTo: [assignedToJid],
                        });
                        const taskNumber = taskService.formatTaskId(task.taskId);
                        createdTasks.push({
                            task_number: taskNumber,
                            title: task.title,
                            assigned_to: [assignedToJid],
                        });
                    } catch (error: any) {
                        logger.error(`Error creating task "${taskTitle}" for user ${assignedToJid}:`, error);
                        errors.push(`Failed to create task "${taskTitle}": ${error.message}`);
                    }
                }
            }

            const totalCreated = createdTasks.length;
            const totalErrors = errors.length;
            let message = `Done! ✅\n\nCreated *${totalCreated}* task${totalCreated !== 1 ? "s" : ""}`;
            if (totalErrors > 0) message += ` (${totalErrors} error${totalErrors !== 1 ? "s" : ""})`;

            const tasksByAssignee = new Map<string, typeof createdTasks>();
            const allMentionedJids = new Set<string>();

            for (const task of createdTasks) {
                const assignee = task.assigned_to[0];
                allMentionedJids.add(assignee);
                if (!tasksByAssignee.has(assignee)) tasksByAssignee.set(assignee, []);
                tasksByAssignee.get(assignee)!.push(task);
            }

            for (const [assignee, assigneeTasks] of tasksByAssignee.entries()) {
                message += `\n\n> @${assignee}`;
                for (const task of assigneeTasks) {
                    message += `\n* *${task.task_number}* - ${task.title}`;
                }
            }

            if (errors.length > 0) message += `\n\n*Errors:*\n${errors.join("\n")}`;

            return JSON.stringify({
                success: totalCreated > 0,
                total_created: totalCreated,
                total_errors: totalErrors,
                message,
                details: {
                    tasks: createdTasks,
                    assigned_to: Array.from(allMentionedJids),
                    errors: errors.length > 0 ? errors : undefined,
                },
            });
        } catch (error: any) {
            logger.error("Error creating bulk tasks:", error);
            return JSON.stringify({
                success: false,
                error: "Failed to create bulk tasks: " + error.message,
            });
        }
    }
    
    protected cleanTextMessage(text: string): string {
        if (!text) return "";
        let cleanText = text;
        cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF]/g, "");
        cleanText = cleanText.replace(/\n{2,}/g, "\n");
        cleanText = cleanText
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter((line) => line.length > 0)
          .join("\n");
        return cleanText;
      }
}
