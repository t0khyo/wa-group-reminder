import OpenAI from "openai";
import logger from "../utils/logger.js";
import { reminderService } from "./ReminderService.js";
import { taskService } from "./TaskService.js";
import dotenv from "dotenv";
import { parseDateTime } from "../utils/DateParser.js";
import { DEFAULT_TIMEZONE } from "../config/TimeZone.js";
import { TaskStatus } from "../generated/prisma/client.js";
dotenv.config();

const prompt: string = `
You're Gigi, a WhatsApp assistant who helps manage reminders and tasks naturally like a friend.

CORE BEHAVIOR:
- Keep responses short (1-3 lines), casual, and friendly
- Never reveal you're AI—chat like a human would
- Reference previous messages naturally for context
- Ask for missing info when needed (especially time for reminders)
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

Creating tasks:
"Done! 📝 Created task *T-1* - Review proposal"

Listing tasks:
"Here are your pending tasks:

🟡 *T-1* - Review proposal
🟡 *T-2* - Call client
   👤 Assigned to: John"

Updating tasks:
"Nice work! ✅ Task *T-1* is now complete."

Task Status:
- 🟡 Pending (not started)
- 🟢 Done (completed)
- 🔴 Cancelled (won't do)

REMINDERS:
Reminders are time-based notifications WITH specific dates/times.

Creating reminders:
"Got it! 😊 I'll remind you on *Tuesday, December 10, 2025, at 3:00 PM*."

Listing reminders:
"📅 Your active reminders:

- Client meeting
  Dec 6, 2025, at 2:00 PM

- Team standup
  Dec 10, 2025, at 10:00 AM"

Canceling reminders:
"Cancelled! The client meeting reminder has been removed. ✅"

IMPORTANT RULES:
1. NEVER assume time - always ask if not explicitly stated
2. Use exact times from function responses (include timezone)
3. When listing items, format each on its own line with emoji
4. For errors, be helpful and suggest what to do next
5. Task IDs are formatted as "T-1", "T-2", etc.
6. Always use *bold* for task numbers and dates/times
7. Keep follow-up suggestions brief and natural

EXAMPLES:

User: "Add a task"
You: "Sure! What's the task about?"

User: "Remind me tomorrow"
You: "Got it! What time tomorrow?"

User: "Review the proposal"
You: "Done! 📝 Created task *T-1* - Review the proposal"

User: "Show my stuff"
You: "Here's what you've got:

*Tasks:*
🟨 *T-1* - Review proposal

*Reminders:*
🟨 Client meeting - Dec 6, 2:00 PM"

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
  mentions?: string[];
}

interface ListRemindersParams {
  status?: "active" | "completed" | "all";
}

interface CancelReminderParams {
  reminder_id: string;
}

interface CreateTaskParams {
  title: string;
  assigned_to?: string[];
}

interface ListTasksParams {
  status?: "Pending" | "Done" | "Cancelled" | "all";
}

interface UpdateTaskParams {
  task_number: number; // Use the task number (1, 2, 3) instead of UUID
  status: "Pending" | "Done" | "Cancelled";
}

interface DeleteTaskParams {
  task_number: number; // Use the task number (1, 2, 3) instead of UUID
}

// Define available functions/tools for the AI
const availableFunctions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_reminder",
      description:
        "Create a reminder that will be sent to the WhatsApp group at a specific date and time. " +
        "The reminder will mention specific users if provided.",
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
              "When to send the reminder. Supports natural language like: 'in 2 hours', 'tomorrow at 3pm', " +
              "'next Monday at 10am', 'Dec 15 at 2:30pm', or ISO format '2024-12-15T14:30:00Z'. " +
              "Use the exact time expression from the user's message.",
          },
          mentions: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional array of user phone numbers or names to mention in the reminder",
          },
        },
        required: ["message", "datetime"],
      },
    },
  },
  {
    type: "function",
    function: {
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
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel an existing reminder by its ID",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "The ID of the reminder to cancel",
          },
        },
        required: ["reminder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task in the chat. Tasks are to-do items without specific deadlines.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title/description",
          },
          assigned_to: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional array of user names or phone numbers to assign the task to",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "List all tasks for this chat. Can filter by status (Pending, Done, Cancelled, or all).",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Pending", "Done", "Cancelled", "all"],
            description: "Filter tasks by status. Default is 'all'",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
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
            enum: ["Pending", "Done", "Cancelled"],
            description: "New status for the task",
          },
        },
        required: ["task_number", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
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
      },
    },
  },
];

export class AiService {
  private client: OpenAI;
  private conversationHistory: Map<
    string,
    OpenAI.Chat.ChatCompletionMessageParam[]
  > = new Map();
  private readonly maxHistoryLength: number = 20;
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

      // Parse the datetime string (defaults to DEFAULT_TIMEZONE)
      const scheduledTime = parseDateTime(args.datetime);

      // Create the reminder with timezone
      const reminder = await reminderService.createReminder(
        chatId,
        args.message,
        scheduledTime.utc,
        args.mentions || [],
        "system",
        scheduledTime.timezone
      );

      return JSON.stringify({
        success: true,
        reminder_id: reminder.id,
        message: `Reminder created! I'll remind you on ${reminder.scheduledTimeLocal}`,
        details: {
          id: reminder.id,
          message: args.message,
          scheduled_time: reminder.scheduledTimeLocal,
          mentions: args.mentions || [],
        },
      });
    } catch (error: any) {
      logger.error("Error creating reminder:", error);
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
      logger.info(`Canceling reminder ${args.reminder_id} in chat ${chatId}`);

      const success = await reminderService.cancelReminder(args.reminder_id);

      if (success) {
        return JSON.stringify({
          success: true,
          message: `✅ Reminder ${args.reminder_id} has been cancelled`,
          reminder_id: args.reminder_id,
        });
      } else {
        return JSON.stringify({
          success: false,
          error: `Reminder ${args.reminder_id} not found or already completed/cancelled`,
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
   * Handler for creating a task
   */
  private async handleCreateTask(
    args: CreateTaskParams,
    chatId: string
  ): Promise<string> {
    try {
      logger.info(`Creating task in chat ${chatId}:`, args);

      const task = await taskService.createTask({
        chatId,
        title: args.title,
        assignedTo: args.assigned_to || [],
      });

      const taskNumber = taskService.formatTaskId(task.taskId);
      let message = `Task created: ${taskNumber}`;

      if (args.assigned_to && args.assigned_to.length > 0) {
        message += `\nAssigned to: ${args.assigned_to.join(", ")}`;
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
          assigned_to: args.assigned_to || [],
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
   * @returns AI-generated reply
   */
  public async generateReply(text: string, userId: string): Promise<string> {
    logger.info(`AI processing text from user ${userId}: "${text}"`);

    try {
      // Get or initialize conversation history for this user
      if (!this.conversationHistory.has(userId)) {
        this.conversationHistory.set(userId, [
          {
            role: "system",
            content: prompt,
          },
        ]);
      }

      const history = this.conversationHistory.get(userId)!;

      // Add user's message to history
      history.push({ role: "user", content: text });

      // Trim history if it gets too long (keep system message + last N messages)
      if (history.length > this.maxHistoryLength) {
        const systemMessage = history[0];
        const recentMessages = history.slice(-this.maxHistoryLength + 1);
        this.conversationHistory.set(userId, [
          systemMessage,
          ...recentMessages,
        ]);
      }

      // Call OpenAI with function calling enabled
      let response = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: this.conversationHistory.get(userId)!,
        tools: availableFunctions,
        tool_choice: "auto", // Let the model decide when to call functions
        temperature: 0.7,
      });

      let assistantMessage = response.choices[0].message;

      // Handle function calls (the model can call multiple tools)
      while (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        // Add assistant's message with tool calls to history
        history.push(assistantMessage);

        // Process each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          // Handle function tool calls
          if (toolCall.type === "function") {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

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

            // Add function response to history
            history.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: functionResponse,
            });

            logger.info(`Function ${functionName} response:`, functionResponse);
          }
        }

        // Get the next response from the model with function results
        response = await this.client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: this.conversationHistory.get(userId)!,
          tools: availableFunctions,
          tool_choice: "auto",
          temperature: 0.7,
        });

        assistantMessage = response.choices[0].message;
      }

      // Extract final reply
      const reply =
        assistantMessage.content || "Sorry, I couldn't generate a reply.";

      // Add final assistant's reply to history
      if (!assistantMessage.tool_calls) {
        history.push({ role: "assistant", content: reply });
      }

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
    this.conversationHistory.delete(userId);
    logger.info(`Cleared conversation history for user ${userId}`);
  }

  /**
   * Clear all conversation histories (useful for memory management)
   */
  public clearAllHistories(): void {
    this.conversationHistory.clear();
    logger.info("Cleared all conversation histories");
  }
}
