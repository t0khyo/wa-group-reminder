import OpenAI from "openai";
import logger from "../utils/logger.js";
import { reminderService } from "./ReminderService.js";
import { taskService } from "./TaskService.js";
import dotenv from "dotenv";
import { parseDateTime } from "../utils/DateParser.js";
import { TaskStatus } from "../generated/prisma/client.js";
dotenv.config();

const AI_MODEL = process.env.AI_MODEL || "gpt-5-nano";

const prompt: string = `
# Identity

You are Gigi a WhatsApp assistant who helps manage reminders and tasks naturally like a friend.

# Behavior

* Keep responses short (1-3 lines), casual, and friendly
* Never reveal you are AI chat
* Reference previous messages naturally for context
* Ask for missing info when needed only
* NEVER ask about timezone or assume dates always use exact user input
* Confirm actions clearly with specific details
* Use line breaks to separate sections clearly
* Keep messages compact and scannable
* Use bullet points with dashes - for lists
* Use single asterisks * for bolding important info
* Tasks emojis: 🟡 (pending), 🟠 (in progress), 🟢 (done), 🔴 (cancelled)
* Use these emojis for actions: Success ✅, Delete 🗑️, Fail ❌
* For errors be helpful and suggest what to do next
* If a user asks to translate a message, phrase, or word into another language (e.g., Arabic(Egypt accent)), provide the translation directly.

# Tasks

* Tasks are to-do items WITHOUT specific deadlines.
* Tasks can be assigned to ONLY ONE person.
* If user says "assign to me" or "my task" or "for me" then assign to the sender (set assign_to_sender: true)
* If user mentions someone (e.g., "@John review proposal") assign to mentioned person (set use_first_mention: true)
* If no mention or assignment specified assign to the sender by default and mention him in the response message
* Task IDs are formatted as "T1", "T2" etc.
* If the user gives a direct task or command with no missing information, execute it immediately without asking for confirmation or suggestions.
* When a message contains multiple users with tasks organized under each user (e.g., "@User1 Tasks: task1, task2" followed by "@User2 Tasks: task3"), use create_bulk_tasks function instead of creating tasks one by one.

## Examples:

1. User: "Assign to me: follow up with client"
Gigi: "Done! ✅
@assignedTo@lid
* *T1* Follow up with client"

2. User: "@John finish the presentation"
Gigi: "Done! ✅
@John
* *T2* - Finish the presentation"

3. User: "list tasks"
"Here are all tasks:

Total: 10
Completed: 5
Active: 3

> @John
* *T1* - Follow up on PACI number 🟡
* *T2* - Prepare presentation slides 🟠

> @Mark
* *T3* - Contacting more cooperates 🟠

4. User: "Mark task T1 as done"
Gigi: "Done! ✅

Task *T1* is now complete 🟢"

5. User: "Task: update gigi to do something"
Gigi: "Done! ✅

* *T4* - Update gigi to do something"

6. User: "Please @Gigi add these tasks

@User1 Tasks:
- Task 1
- Task 2

@User2 Tasks:
- Task 3
- Task 4"
Gigi: "Done! ✅

Created *4* tasks

> @User1
* *T5* - Task 1
* *T6* - Task 2

> @User2
* *T7* - Task 3
* *T8* - Task 4"

Note: For bulk task messages with multiple users, use create_bulk_tasks function. The user_mention_index is 0-based: first mentioned user (excluding bot) is 0, second is 1, etc.

# Reminders

* Reminders are time based notifications with specific date and time
* Reminders IDs are formatted as "R1", "R2" etc.
* Always use the exact datetime phrase as provided by the user without modification
* Never standardize, parse, or convert datetime formats
* If user does not provide date/time ask for it specifically
* Use exact times from function responses
* Ignore mentions in reminder requests they are automatically included in notifications DO NOT specify mentions
* Reminder titles must be normalized into a second-person action-oriented phrase suitable for a notification


## Examples:

1. User: "Remind me on 7 Dec 2025 at 3pm to submit the report"
Gigi: "Got it I will remind you! ✅

*Submit the report*

Date: 7 Dec 2025
Day: Sunday
Time: 3:00 PM"

2. User: "@John @Sarah remind us tomorrow at 3pm about the meeting with the manager"
Gigi: "Got it I will remind you! ✅

*Meeting with the manager*

Date: [tomorrow's date]
Day: [tomorrow's day]
Time: 3:00 PM"
"

3. User: "What reminders do we have?"
"Here is upcoming reminders:

- *R1* - Submit report

Date: 6 Dec 2025
Day: Saturday
Time: 2:00 PM

---

- *R23* - Meeting with designer Mohamed

Date: 8 Dec 2025
Day: Monday
Time: 11:00 AM
"

4. User: "Meeting with development team on 10 Dec 2025"
Gigi: "Could you please provide the time for the meeting on 10 Dec 2025?"
User: "10am"
Gigi: "Got it I will remind you! ✅

*Meeting with development team*

Date: 10 Dec 2025
Day: [day provided by function return]
Time: 10:00 AM"
`.trim();

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
}

// Type definitions for function calls
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
}

interface UpdateTaskParams {
  task_number: number; // Use the task number (1, 2, 3) instead of UUID
  status: "Pending" | "InProgress" | "Done" | "Cancelled";
}

interface DeleteTaskParams {
  task_number: number; // Use the task number (1, 2, 3) instead of UUID
}

interface CreateBulkTasksParams {
  tasks_by_user: Array<{
    user_mention_index: number; // Index in the mentionedJids array (0-based)
    tasks: string[]; // Array of task titles for this user
  }>;
}

// Define available functions/tools for the AI (Responses API format)
const availableFunctions: any[] = [
  {
    type: "function",
    name: "create_reminder",
    description:
      "Create a reminder that will be sent to the WhatsApp group at a specific date and time. " +
      "Mentions are automatically captured from the message context do not specify them.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The reminder title to send",
        },
        datetime: {
          type: "string",
          description:
            "Extract the exact datetime phrase *as written by the user* without modifying or interpreting it",
        },
      },
      required: ["message", "datetime"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_reminders",
    description:
      "List all reminders for this chat. Can filter by status (active, completed, or all).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "completed", "all"],
          description: "Filter reminders by status. Default is 'active'",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cancel_reminder",
    description: "Cancel an existing reminder by its number (e.g., 1, 2, 3)",
    parameters: {
      type: "object",
      properties: {
        reminder_number: {
          type: "number",
          description: "The reminder number (e.g., 1, 2, 3) - NOT the UUID",
        },
      },
      required: ["reminder_number"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_reminder",
    description:
      "Update an existing reminder's message or time. At least one field (message or datetime) must be provided.",
    parameters: {
      type: "object",
      properties: {
        reminder_number: {
          type: "number",
          description: "The reminder number (e.g., 1, 2, 3) - NOT the UUID",
        },
        message: {
          type: "string",
          description: "New reminder message (optional)",
        },
        datetime: {
          type: "string",
          description:
            "New datetime for the reminder. Extract the exact datetime phrase *as written by the user*, " +
            "without modifying or interpreting it. Return the raw text the user typed (optional).",
        },
      },
      required: ["reminder_number"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_task",
    description:
      "Create a new task in the chat. Tasks are to-do items without specific deadlines. " +
      "Tasks can be assigned to ONE person only.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The task title/description",
        },
        assign_to_sender: {
          type: "boolean",
          description:
            "Set to true if the user wants to assign the task to themselves (e.g., 'assign to me', 'my task'). Default is false.",
        },
        use_first_mention: {
          type: "boolean",
          description:
            "Set to true if the task should be assigned to the first person mentioned in the message (excluding the bot). Default is false.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_tasks",
    description:
      "List all tasks for this chat. Can filter by status (Pending, InProgress, Done, Cancelled, or all).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Pending", "InProgress", "Done", "Cancelled", "all"],
          description: "Filter tasks by status. Default is 'all'",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_task",
    description:
      "Update a task's status. Use task_number from list_tasks (e.g., 1, 2, 3).",
    parameters: {
      type: "object",
      properties: {
        task_number: {
          type: "number",
          description: "The task number (e.g., 1, 2, 3) - NOT the UUID",
        },
        status: {
          type: "string",
          enum: ["Pending", "InProgress", "Done", "Cancelled"],
          description: "New status for the task",
        },
      },
      required: ["task_number", "status"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "delete_task",
    description: "Delete a task permanently by its number (e.g., 1, 2, 3)",
    parameters: {
      type: "object",
      properties: {
        task_number: {
          type: "number",
          description: "The task number (e.g., 1, 2, 3) - NOT the UUID",
        },
      },
      required: ["task_number"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_bulk_tasks",
    description:
      "Create multiple tasks for multiple users at once. Use this when a message contains tasks organized by user mentions (e.g., '@User1 Tasks: task1, task2' followed by '@User2 Tasks: task3, task4'). " +
      "The user_mention_index refers to the position of the user in the mentionedJids array (0-based, excluding bot mentions). " +
      "For example, if the message mentions @Bot, @User1, @User2, then User1 is index 0 and User2 is index 1. " +
      "Extract all tasks for each mentioned user and create them in bulk. Remove emoji status indicators (🟡, 🟠, 🟢, 🔴) from task titles.",
    parameters: {
      type: "object",
      properties: {
        tasks_by_user: {
          type: "array",
          description:
            "Array of objects, each containing a user's mention index and their tasks. " +
            "Each object represents one user and all their tasks from the message.",
          items: {
            type: "object",
            properties: {
              user_mention_index: {
                type: "number",
                description:
                  "The index of the user in the mentionedJids array (0-based, bot mentions excluded). " +
                  "Count mentions in order: first mentioned user (excluding bot) = 0, second = 1, third = 2, etc. " +
                  "If a user appears multiple times in the message, use the index of their first appearance.",
              },
              tasks: {
                type: "array",
                description:
                  "Array of task titles/descriptions for this user. " +
                  "Extract tasks from lines that appear under this user's section (after their mention and before the next user's mention or end of message). " +
                  "Remove emoji status indicators (🟡, 🟠, 🟢, 🔴) and bullet points (*, -, •) from task titles. " +
                  "Clean up extra whitespace and keep only the task description.",
                items: {
                  type: "string",
                },
              },
            },
            required: ["user_mention_index", "tasks"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks_by_user"],
      additionalProperties: false,
    },
  },
];

export class AiService {
  private client: OpenAI;
  private previousResponseIds: Map<string, string> = new Map();
  private senderIds: Map<string, string> = new Map(); // chatId -> senderId mapping
  private mentionedJids: Map<string, string[]> = new Map(); // chatId -> mentioned JIDs
  private rawTexts: Map<string, string> = new Map(); // chatId -> rawText for parsing
  private functionHandlers: Map<
    string,
    (args: any, chatId: string) => Promise<string>
  >;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not defined in .env");
    }

    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.functionHandlers = new Map();
    this.initializeFunctionHandlers();
  }

  /**
   * Initialize function handlers that will be called when AI requests a function
   */
  private initializeFunctionHandlers(): void {
    this.functionHandlers.set(
      "create_reminder",
      this.handleCreateReminder.bind(this)
    );
    this.functionHandlers.set(
      "list_reminders",
      this.handleListReminders.bind(this)
    );
    this.functionHandlers.set(
      "cancel_reminder",
      this.handleCancelReminder.bind(this)
    );
    this.functionHandlers.set(
      "update_reminder",
      this.handleUpdateReminder.bind(this)
    );
    this.functionHandlers.set("create_task", this.handleCreateTask.bind(this));
    this.functionHandlers.set("list_tasks", this.handleListTasks.bind(this));
    this.functionHandlers.set("update_task", this.handleUpdateTask.bind(this));
    this.functionHandlers.set("delete_task", this.handleDeleteTask.bind(this));
    this.functionHandlers.set(
      "create_bulk_tasks",
      this.handleCreateBulkTasks.bind(this)
    );
  }

  /**
   * Handler for creating a reminder
   */
  private async handleCreateReminder(
    args: ReminderParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Creating reminder in chat ${chatId}:`, args);

      const scheduledTime = parseDateTime(args.datetime);

      // Get sender ID from the map, fallback to "system" if not found
      const senderId = this.senderIds.get(chatId) || "system";

      // Get mentioned JIDs from the message context (automatic from WhatsApp)
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

  /**
   * Handler for listing reminders
   */
  private async handleListReminders(
    args: ListRemindersParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Listing reminders for chat ${chatId}:`, args);

      const reminders = await reminderService.listReminders(
        chatId,
        args.status || "active"
      );

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
        message: `Found ${reminders.length} ${
          args.status || "active"
        } reminder(s)`,
      });
    } catch (error: any) {
      logger.error("Error listing reminders:", error);
      return JSON.stringify({
        success: false,
        error: "Failed to list reminders: " + error.message,
      });
    }
  }

  /**
   * Handler for canceling a reminder
   */
  private async handleCancelReminder(
    args: CancelReminderParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(
        `Canceling reminder ${args.reminder_number} in chat ${chatId}`
      );

      // Get reminder by number
      const reminder = await reminderService.getReminderByNumber(
        args.reminder_number,
        chatId
      );

      if (!reminder) {
        return JSON.stringify({
          success: false,
          error: `Reminder #${args.reminder_number} not found`,
        });
      }

      const success = await reminderService.cancelReminder(reminder.id);
      const reminderNumber = reminderService.formatReminderId(
        args.reminder_number
      );

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

  /**
   * Handler for updating a reminder
   */
  private async handleUpdateReminder(
    args: UpdateReminderParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(
        `Updating reminder ${args.reminder_number} in chat ${chatId}:`,
        args
      );

      // Validate that at least one field is being updated
      if (!args.message && !args.datetime) {
        return JSON.stringify({
          success: false,
          error:
            "At least one field (message or datetime) must be provided to update",
        });
      }

      // Get reminder by number
      const reminder = await reminderService.getReminderByNumber(
        args.reminder_number,
        chatId
      );

      if (!reminder) {
        return JSON.stringify({
          success: false,
          error: `Reminder #${args.reminder_number} not found`,
        });
      }

      const updates: { message?: string; scheduledTime?: Date } = {};

      if (args.message) {
        updates.message = args.message;
      }

      if (args.datetime) {
        const scheduledTime = parseDateTime(args.datetime);
        updates.scheduledTime = scheduledTime.utc;
      }

      const updatedReminder = await reminderService.updateReminder(
        reminder.id,
        updates
      );

      if (updatedReminder) {
        let updateDetails = [];
        if (args.message) updateDetails.push(`message to "${args.message}"`);
        if (args.datetime)
          updateDetails.push(`time to ${updatedReminder.scheduledTimeLocal}`);

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

  /**
   * Handler for creating a task
   */
  private async handleCreateTask(
    args: CreateTaskParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Creating task in chat ${chatId}:`, args);

      let assignedTo: string | undefined = undefined;

      // Determine who to assign the task to.
      // New rule: if the user explicitly requested assignment to themselves
      // (assign_to_sender) OR there are no mentions in the message, the task
      // will be assigned to the senderId. If mentions exist, assign to the
      // first mention (this matches 'assign to @someone' behavior).
      const senderId = this.senderIds.get(chatId);
      const mentions = this.mentionedJids.get(chatId) || [];

      if (args.assign_to_sender) {
        // Explicit instruction from AI to assign to sender
        if (senderId) assignedTo = senderId;
      } else if (mentions.length > 0) {
        // There are mentions in the message — assign to the first one
        assignedTo = mentions[0];
      } else {
        // No mentions and no explicit flag — default to assigning to sender
        if (senderId) assignedTo = senderId;
      }

      const task = await taskService.createTask({
        chatId,
        title: args.title,
        assignedTo: assignedTo ? [assignedTo] : [],
      });

      const taskNumber = taskService.formatTaskId(task.taskId);
      let message = `Task created: ${taskNumber}`;

      if (assignedTo) {
        message += `\nAssigned to: ${assignedTo}`;
      }

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

  /**
   * Handler for listing tasks
   */
  private async handleListTasks(
    args: ListTasksParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Listing tasks for chat ${chatId}:`, args);

      const status =
        args.status === "all" ? undefined : (args.status as TaskStatus);
      const tasks = await taskService.listTasks(chatId, status);

      if (tasks.length === 0) {
        return JSON.stringify({
          success: true,
          count: 0,
          tasks: [],
          message: `No ${args.status || "pending"} tasks found.`,
        });
      }

      const formattedTasks = tasks.map((t) => ({
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
        message: `Found ${tasks.length} ${args.status || "pending"} task(s)`,
      });
    } catch (error: any) {
      logger.error("Error listing tasks:", error);
      return JSON.stringify({
        success: false,
        error: "Failed to list tasks: " + error.message,
      });
    }
  }

  /**
   * Handler for updating a task status
   */
  private async handleUpdateTask(
    args: UpdateTaskParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Updating task ${args.task_number} in chat ${chatId}:`, args);

      // Get task by number
      const task = await taskService.getTaskByNumber(args.task_number, chatId);

      if (!task) {
        return JSON.stringify({
          success: false,
          error: `Task #${args.task_number} not found`,
        });
      }

      // Update only the status
      const updatedTask = await taskService.updateTaskStatus(
        task.id,
        args.status as TaskStatus
      );
      const taskNumber = taskService.formatTaskId(updatedTask.taskId);

      return JSON.stringify({
        success: true,
        task_id: updatedTask.id,
        task_number: taskNumber,
        message: `✅ Task ${taskNumber} status updated to ${args.status}`,
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

  /**
   * Handler for deleting a task
   */
  private async handleDeleteTask(
    args: DeleteTaskParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Deleting task ${args.task_number} in chat ${chatId}`);

      // Get task by number
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
          message: `🗑️ Task ${taskService.formatTaskId(
            args.task_number
          )} deleted successfully`,
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

  /**
   * Handler for creating bulk tasks for multiple users
   */
  private async handleCreateBulkTasks(
    args: CreateBulkTasksParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Creating bulk tasks in chat ${chatId}:`, args);

      const mentionedJids = this.mentionedJids.get(chatId) || [];
      const senderId = this.senderIds.get(chatId);
      const createdTasks: Array<{
        task_number: string;
        title: string;
        assigned_to: string[];
      }> = [];
      const errors: string[] = [];

      // Process each user's tasks
      for (const userTasks of args.tasks_by_user) {
        const { user_mention_index, tasks } = userTasks;

        // Validate mention index
        if (
          user_mention_index < 0 ||
          user_mention_index >= mentionedJids.length
        ) {
          errors.push(
            `Invalid mention index ${user_mention_index} (available: 0-${
              mentionedJids.length - 1
            })`
          );
          continue;
        }

        const assignedToJid = mentionedJids[user_mention_index];

        // Create each task for this user
        for (const taskTitle of tasks) {
          if (!taskTitle || taskTitle.trim().length === 0) {
            continue; // Skip empty tasks
          }

          // Clean task title: remove emoji status indicators and bullet points
          let cleanedTitle = taskTitle.trim();
          // Remove emoji status indicators
          cleanedTitle = cleanedTitle.replace(/[🟡🟠🟢🔴]/g, "").trim();
          // Remove bullet points at the start
          cleanedTitle = cleanedTitle.replace(/^[\*\-\•\⁠]+/, "").trim();
          // Remove extra whitespace
          cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

          if (cleanedTitle.length === 0) {
            continue; // Skip if nothing left after cleaning
          }

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
            logger.error(
              `Error creating task "${taskTitle}" for user ${assignedToJid}:`,
              error
            );
            errors.push(
              `Failed to create task "${taskTitle}": ${error.message}`
            );
          }
        }
      }

      // Build response
      const totalCreated = createdTasks.length;
      const totalErrors = errors.length;

      let message = `Done! ✅\n\nCreated *${totalCreated}* task${
        totalCreated !== 1 ? "s" : ""
      }`;
      if (totalErrors > 0) {
        message += ` (${totalErrors} error${totalErrors !== 1 ? "s" : ""})`;
      }

      // Group tasks by assignee for display and collect all mentioned JIDs
      const tasksByAssignee = new Map<string, typeof createdTasks>();
      const allMentionedJids = new Set<string>();

      for (const task of createdTasks) {
        const assignee = task.assigned_to[0];
        allMentionedJids.add(assignee);
        if (!tasksByAssignee.has(assignee)) {
          tasksByAssignee.set(assignee, []);
        }
        tasksByAssignee.get(assignee)!.push(task);
      }

      // Format response with tasks grouped by user
      for (const [assignee, assigneeTasks] of tasksByAssignee.entries()) {
        message += `\n\n> @${assignee}`;
        for (const task of assigneeTasks) {
          message += `\n* *${task.task_number}* - ${task.title}`;
        }
      }

      if (errors.length > 0) {
        message += `\n\n*Errors:*\n${errors.join("\n")}`;
      }

      return JSON.stringify({
        success: totalCreated > 0,
        total_created: totalCreated,
        total_errors: totalErrors,
        message,
        details: {
          tasks: createdTasks,
          assigned_to: Array.from(allMentionedJids), // All unique JIDs that received tasks
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

  /**
   * Generate a reply with conversation memory and function calling support
   * @param text - User's message
   * @param userId - Unique identifier for the user/chat (e.g., chatId or userId)
   * @param senderId - Optional sender ID to track who created the reminder
   * @param mentionedJids - Optional array of mentioned user JIDs from the message
   * @returns AI-generated reply with optional mentions
   */
  public async generateReply(
    text: string,
    userId: string,
    senderId?: string,
    mentionedJids?: string[],
    rawText?: string
  ): Promise<{ text: string; mentions?: string[] }> {
    text = this.cleanTextMessage(text);
    logger.info(`AI processing text from user ${userId}: "${text}"`);

    // Store sender ID if provided
    if (senderId) {
      this.senderIds.set(userId, senderId);
    }

    // Store mentioned JIDs if provided (excluding the bot itself)
    if (mentionedJids && mentionedJids.length > 0) {
      this.mentionedJids.set(userId, mentionedJids);
    }

    // Store raw text if provided (for parsing mentions in bulk tasks)
    if (rawText) {
      this.rawTexts.set(userId, rawText);
    }

    try {
      // Get previous response ID for this user (if any)
      const previousResponseId = this.previousResponseIds.get(userId);

      // Call OpenAI Responses API with function calling enabled
      let response = await this.client.responses.create({
        model: AI_MODEL,
        instructions: prompt,
        input: text,
        tools: availableFunctions,
        store: true, // Enable statefulness for better reasoning
        previous_response_id: previousResponseId, // Chain with previous conversation
      });

      // Process the response output for function calls
      let needsFollowUp = false;
      const functionOutputs: any[] = [];
      const collectedMentions: Set<string> = new Set();

      for (const item of response.output) {
        // Handle function calls
        if (item.type === "function_call") {
          needsFollowUp = true;
          const functionName = item.name;
          const functionArgs = JSON.parse(item.arguments);

          logger.info(
            `AI requested function call: ${functionName}`,
            functionArgs
          );

          // Execute the function
          const functionHandler = this.functionHandlers.get(functionName);
          let functionResponse: string;

          if (functionHandler) {
            functionResponse = await functionHandler(functionArgs, userId);
          } else {
            functionResponse = JSON.stringify({
              success: false,
              error: `Unknown function: ${functionName}`,
            });
          }

          // Extract mentions from function response
          try {
            const responseData = JSON.parse(functionResponse);
            if (responseData.success) {
              // Extract mentions from task assignments in details (works for both single and bulk tasks)
              if (
                responseData.details?.assigned_to &&
                Array.isArray(responseData.details.assigned_to)
              ) {
                responseData.details.assigned_to.forEach((jid: string) => {
                  if (jid) {
                    collectedMentions.add(jid);
                    logger.debug(
                      `Collected mention from task assignment: ${jid}`
                    );
                  }
                });
              }
              // Extract mentions from reminder mentions in details
              if (
                responseData.details?.mentions &&
                Array.isArray(responseData.details.mentions)
              ) {
                responseData.details.mentions.forEach((jid: string) => {
                  if (jid) {
                    collectedMentions.add(jid);
                    logger.debug(`Collected mention from reminder: ${jid}`);
                  }
                });
              }
              // For list operations, collect mentions from all items
              if (responseData.tasks && Array.isArray(responseData.tasks)) {
                responseData.tasks.forEach((task: any) => {
                  if (task.assigned_to && Array.isArray(task.assigned_to)) {
                    task.assigned_to.forEach((jid: string) => {
                      if (jid) {
                        collectedMentions.add(jid);
                        logger.debug(
                          `Collected mention from task list: ${jid}`
                        );
                      }
                    });
                  }
                });
              }
              if (
                responseData.reminders &&
                Array.isArray(responseData.reminders)
              ) {
                responseData.reminders.forEach((reminder: any) => {
                  if (reminder.mentions && Array.isArray(reminder.mentions)) {
                    reminder.mentions.forEach((jid: string) => {
                      if (jid) {
                        collectedMentions.add(jid);
                        logger.debug(
                          `Collected mention from reminder list: ${jid}`
                        );
                      }
                    });
                  }
                });
              }
            }
          } catch (e) {
            // If parsing fails, continue without extracting mentions
            logger.debug("Could not parse function response for mentions", e);
          }

          // Store function output for follow-up request
          functionOutputs.push({
            type: "function_call_output",
            call_id: item.call_id,
            output: functionResponse,
          });

          logger.info(`Function ${functionName} response: ${functionResponse}`);
        }
      }

      // If functions were called, make a follow-up request with the results
      if (needsFollowUp) {
        response = await this.client.responses.create({
          model: AI_MODEL,
          instructions: prompt,
          input: functionOutputs,
          previous_response_id: response.id, // Chain with the function call response
          tools: availableFunctions,
          store: true,
        });
      }

      // Store this response ID for future conversation continuity
      this.previousResponseIds.set(userId, response.id);

      // Extract final reply using the helper
      const reply =
        response.output_text || "Sorry, I couldn't generate a reply.";

      // Convert collected mentions to array
      const mentions =
        collectedMentions.size > 0 ? Array.from(collectedMentions) : undefined;

      if (mentions && mentions.length > 0) {
        logger.info(
          `Including ${
            mentions.length
          } mention(s) in AI response: ${mentions.join(", ")}`
        );
      }

      text.replace("@lid", "");

      return { text: reply, mentions };
    } catch (err: any) {
      logger.error("AI Error: " + (err?.message || err));
      logger.error("Full error:", err);
      return { text: "Sorry, I couldn't process that right now." };
    }
  }

  /**
   * Clear conversation history for a specific user
   * @param userId - User/chat identifier
   */
  public clearHistory(userId: string): void {
    this.previousResponseIds.delete(userId);
    logger.info(`Cleared conversation history for user ${userId}`);
  }

  /**
   * Clear all conversation histories (useful for memory management)
   */
  public clearAllHistories(): void {
    this.previousResponseIds.clear();
    logger.info("Cleared all conversation histories");
  }

  private cleanTextMessage(text: string): string {
    if (!text) return "";

    let cleanText = text;

    // Remove invisible zero-width characters
    cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Normalize multiple new lines to a single one
    cleanText = cleanText.replace(/\n{2,}/g, "\n");

    // Normalize spaces per line while preserving newlines
    cleanText = cleanText
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n");

    return cleanText;
  }
}
