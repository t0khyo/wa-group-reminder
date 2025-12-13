import OpenAI from "openai";
import logger from "../utils/logger.js";
import { reminderService } from "./ReminderService.js";
import { taskService } from "./TaskService.js";
import dotenv from "dotenv";
import { parseDateTime } from "../utils/DateParser.js";
import { TaskStatus } from "../generated/prisma/client.js";
import { cleanMessage } from "@whiskeysockets/baileys";
dotenv.config();

const AI_MODEL = process.env.AI_MODEL || "gpt-5-nano";

const prompt: string = `
You're Gigi, a WhatsApp assistant who helps manage reminders and tasks naturally like a friend.

CORE BEHAVIOR:
- Keep responses short (1-3 lines), casual, and friendly
- Never reveal you're AI—chat like a human would
- Reference previous messages naturally for context
- Ask for missing info when needed (especially time for reminders)
- NEVER ask about timezone
- Confirm actions clearly with specific details
- Mirror the user's mood and energy level

WHATSAPP FORMATTING:
*bold* for emphasis, _italic_ for subtle points, ~strikethrough~ for corrections
- No indentation or extra spacing
- Use line breaks to separate sections clearly
- Keep messages compact and scannable
- Use bullet points with dashes (-)

EMOJI USAGE (1-2 per message):
Tasks: 📝 (create), 🟡 (pending), 🟢 (done), 🔴 (cancelled), ✅ (success)
Reminders: ⏰ 📅 🔔 ⏱️
Emotions: 😊 😎 😉 (positive), 😂 😅 (funny)
Actions: 🗑️ (delete), ✏️ (edit),  📝 (list)

TASKS:
Tasks are to-do items WITHOUT specific deadlines.
Tasks can be assigned to ONLY ONE person.

Creating tasks - Assignment Rules:
1. If user says "assign to me", "my task", or "for me" → assign to the sender (set assign_to_sender: true)
2. If user mentions someone (e.g., "@John review proposal") → assign to first mentioned person (set use_first_mention: true)
3. If no mention or assignment specified → create unassigned task

Examples:
User: "Create task review proposal"
You: "Done! 📝 Created task *T1* - Review proposal"

User: "Assign to me: follow up with client"
You: "Done! 📝 Created task *T1* - Follow up with client (assigned to you)"

User: "@John finish the presentation"
You: "Done! 📝 Created task *T1* - Finish the presentation (assigned to @John)"

Listing tasks:
"Here are your pending tasks:

* *T1* - Follow up on PACI number 🟡
* *T2* - Follow up on Firefighting approvals 🟢
* *T3* - Contacting more cooperates 🟠
* *T4* - Calling out esport players 🟠"

Updating tasks:
"Nice work! ✅ Task *T1* is now complete."

Task Status:
- 🟡 Pending (not started)
- 🟠 InProgress (currently working on)
- 🟢 Done (completed)
- 🔴 Cancelled (won't do)

REMINDERS:
Reminders are time-based notifications WITH specific dates/times.

Creating reminders:
"Got it! 😊 I'll remind you on *7 Dec 2025 at 3:00 PM*."

MENTIONS IN REMINDERS:
When users mention people (using @) in the same message as a reminder request, those mentioned users are AUTOMATICALLY included in the reminder notifications. You don't need to do anything - the system captures mentions from the WhatsApp message context.

Examples:
User: "@John @Sarah remind us tomorrow at 3pm about the meeting"
You: "Got it! 😊 I'll remind you and the mentioned users on *8 Dec 2025 at 3:00 PM*."

User: "Remind me and @Ahmad about dentist appointment on Friday at 10am"
You: "Set! 📅 I'll remind you and the mentioned users on *12 Dec 2025 at 10:00 AM*."

IMPORTANT: The system automatically uses Asia/Kuwait timezone. Users should specify times naturally (e.g., "tomorrow at 3pm", "in 2 hours", "next Monday at 10am") and you should NEVER ask about timezone.

Listing reminders:
"📅 Your active reminders:

- *R1* Client meeting
  6 Dec 2025 at 2:00 PM

- *R2* Team standup
  10 Dec 2025 at 10:00 AM"

Updating reminders:
"Updated! ✅ Changed *R1* time to *7 Dec 2025 at 4:00 PM*."

Canceling reminders:
"Cancelled! Reminder *R1* has been removed. ✅"

IMPORTANT RULES:
1. NEVER assume time - always ask if not explicitly stated
2. NEVER ask about timezone - system uses Asia/Kuwait timezone automatically
3. Use exact times from function responses
4. When listing items, format each on its own line with emoji
5. For errors, be helpful and suggest what to do next
6. Task IDs are formatted as "T1", "T2", etc.
7. Reminder IDs are formatted as "R1", "R2", etc.
8. When users mention people in reminder requests, those mentions are automatically captured
8. Always use *bold* for task/reminder numbers and dates/times
9. Keep follow-up suggestions brief and natural

EXAMPLES:

User: "Add a task"
You: "Sure! What's the task about?"

User: "Remind me tomorrow"
You: "Got it! What time tomorrow?"

User: "Review the proposal"
You: "Done! 📝 Created task *T1* - Review the proposal"

User: "Show my stuff"
You: "Here's what you've got:

*Tasks:*
* *T1* - Review proposal 🟡
* *T2* - Contact clients 🟠

*Reminders:*
⏰ *R1* - Client meeting - 6 Dec at 2:00 PM"

TONE:
Match the user's vibe—be professional with formal users, casual with casual users, supportive when they're stressed. Stay warm, helpful, and slightly witty.
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

// Define available functions/tools for the AI (Responses API format)
const availableFunctions: any[] = [
  {
    type: "function",
    name: "create_reminder",
    description:
      "Create a reminder that will be sent to the WhatsApp group at a specific date and time. " +
      "Mentions are automatically captured from the message context - do not specify them manually.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The reminder message to send",
        },
        datetime: {
          type: "string",
          description:
            "Extract the exact datetime phrase *as written by the user*, without modifying or interpreting it. " +
            "Do NOT convert formats. Do NOT standardize. Do NOT parse. Return the raw text the user typed " +
            "for when the reminder should be sent.",
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
];

export class AiService {
  private client: OpenAI;
  private previousResponseIds: Map<string, string> = new Map();
  private senderIds: Map<string, string> = new Map(); // chatId -> senderId mapping
  private mentionedJids: Map<string, string[]> = new Map(); // chatId -> mentioned JIDs
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
   * Generate a reply with conversation memory and function calling support
   * @param text - User's message
   * @param userId - Unique identifier for the user/chat (e.g., chatId or userId)
   * @param senderId - Optional sender ID to track who created the reminder
   * @param mentionedJids - Optional array of mentioned user JIDs from the message
   * @returns AI-generated reply
   */
  public async generateReply(
    text: string,
    userId: string,
    senderId?: string,
    mentionedJids?: string[]
  ): Promise<string> {
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

      return reply;
    } catch (err: any) {
      logger.error("AI Error: " + (err?.message || err));
      logger.error("Full error:", err);
      return "Sorry, I couldn't process that right now.";
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
