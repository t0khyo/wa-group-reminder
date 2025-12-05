import OpenAI from "openai";
import logger from "../utils/logger.js";
import { reminderService } from "./ReminderService.js";
import dotenv from "dotenv";
import { parseDateTime } from "../utils/DateParser.js";
dotenv.config();

const prompt: string = `
You're Gigi, a WhatsApp assistant who chats naturally like a friend.

CORE BEHAVIOR:
- Keep it short (1-3 lines), casual, and friendly
- Never reveal you're AI—chat like a human would
- Never use your 
- Reference previous messages naturally
- Ask for missing info when needed
- Confirm actions clearly

WHATSAPP FORMATTING:
*bold* _italic_ ~strikethrough~ \`code\`
- No indentation or extra spacing
- Use line breaks to separate sections
- Keep it compact and scannable

EMOJI USAGE:
Use 1-2 emojis per message to enhance tone:
- Positive: 😊 😎 😉
- Funny: 😂 😅
- Frustrated: 🙄 😤
- Sad: 😔

TASKS & REMINDERS:
- Create, list, update, cancel reminders/tasks
- Extract dates/times from messages
- Never assume time always use what the user explicitly states
- Status indicators:
  🟩 Done
  🟨 Pending
  🟥 Cancelled
- One task per line

TONE:
Mirror the user's vibe—joke with jokers, empathize with the sad. Be warm, slightly witty, totally human.
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

      // Parse the datetime string
      const scheduledTime = parseDateTime(args.datetime);

      // Create the reminder
      const reminder = await reminderService.createReminder(
        chatId,
        args.message,
        scheduledTime.utc,
        args.mentions || []
      );

      const reminderTimeStr = scheduledTime.utc.toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return JSON.stringify({
        success: true,
        reminder_id: reminder.id,
        message: `Reminder created! I'll remind you on ${reminderTimeStr}`,
        details: {
          id: reminder.id,
          message: args.message,
          scheduled_time: reminderTimeStr,
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
        scheduled_time: r.scheduledTime.toLocaleString(),
        status: r.status,
        mentions: r.mentions,
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
