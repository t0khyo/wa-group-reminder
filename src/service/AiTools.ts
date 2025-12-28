export const availableFunctions: any[] = [
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
      "Extract all tasks for each mentioned user and create them in bulk. Remove emoji status indicators from task titles.",
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
