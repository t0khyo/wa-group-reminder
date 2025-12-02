# OpenAI Function Calling Implementation Guide

## 🎯 Overview

Your AI assistant (Gigi) now has the ability to **call functions** based on user requests. The AI can:

- ✅ Create reminders
- ✅ List reminders
- ✅ Cancel reminders
- ✅ Understand natural language time expressions

## 🔧 How It Works

### 1. **Function Declaration**

Functions are declared with detailed schemas in `AiService.ts`:

```typescript
const availableFunctions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a reminder...",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "..." },
          datetime: { type: "string", description: "..." },
          mentions: { type: "array", items: { type: "string" } },
        },
        required: ["message", "datetime"],
      },
    },
  },
];
```

### 2. **Function Execution Flow**

```
User Message → AI Analyzes → Decides to Call Function → Executes Handler → Returns Result → AI Formats Response
```

Example:

```
User: "@Gigi remind me to submit the report tomorrow at 3pm"
  ↓
AI: Identifies need to create reminder
  ↓
Calls: create_reminder({
  message: "submit the report",
  datetime: "tomorrow at 3pm"
})
  ↓
Handler: Creates reminder via ReminderService
  ↓
Returns: { success: true, reminder_id: "REM-123", ... }
  ↓
AI: "✅ Reminder created! I'll remind you on Dec 4, 2025 at 3:00 PM"
```

## 💬 Usage Examples

### Create a Reminder

**User**: `@Gigi remind me about the team meeting tomorrow at 2pm`

**AI Response**:

```
✅ Reminder created! I'll remind you on Wed, Dec 04, 2025 at 02:00 PM
```

**Behind the scenes**:

- AI calls `create_reminder({ message: "team meeting", datetime: "tomorrow at 2pm" })`
- ReminderService creates the reminder
- Scheduler sets up the job

---

**User**: `@Gigi set a reminder to call mom in 3 hours`

**AI Response**:

```
✅ Reminder created! I'll remind you on Tue, Dec 03, 2025 at 05:30 PM
```

---

### List Reminders

**User**: `@Gigi show me my reminders`

**AI Response**:

```
You have 2 active reminders:

1. 📌 Submit the report
   ⏰ Dec 04, 2025 at 03:00 PM
   ID: REM-123456789

2. 📌 Team meeting
   ⏰ Dec 04, 2025 at 02:00 PM
   ID: REM-987654321
```

**Behind the scenes**:

- AI calls `list_reminders({ status: "active" })`
- Returns formatted list

---

**User**: `@Gigi list all reminders including completed ones`

**AI Response**:

```
Found 5 reminders (including completed):
[Lists all reminders]
```

---

### Cancel a Reminder

**User**: `@Gigi cancel reminder REM-123456789`

**AI Response**:

```
✅ Reminder REM-123456789 has been cancelled
```

**Behind the scenes**:

- AI calls `cancel_reminder({ reminder_id: "REM-123456789" })`
- ReminderService marks it as cancelled

---

## ⏰ Supported Time Formats

The `ReminderService.parseDateTime()` method understands:

### Relative Times

- `in 2 hours` → 2 hours from now
- `in 30 minutes` → 30 minutes from now
- `in 5 days` → 5 days from now
- `in 1 week` → 7 days from now

### Tomorrow/Today

- `tomorrow` → Tomorrow at 9:00 AM (default)
- `tomorrow at 3pm` → Tomorrow at 3:00 PM
- `tomorrow at 14:30` → Tomorrow at 2:30 PM

### ISO 8601 Format

- `2024-12-15T14:30:00Z` → Specific date/time
- `2024-12-15T14:30:00-05:00` → With timezone

### Examples:

```javascript
parseDateTime("in 2 hours"); // → Date object 2 hours from now
parseDateTime("tomorrow at 3pm"); // → Tomorrow at 15:00
parseDateTime("in 5 days"); // → 5 days from now at current time
```

## 🔨 Adding New Functions

### Step 1: Define the Function Schema

Add to `availableFunctions` array in `AiService.ts`:

```typescript
{
  type: "function",
  function: {
    name: "snooze_reminder",
    description: "Snooze an existing reminder by a specified duration",
    parameters: {
      type: "object",
      properties: {
        reminder_id: {
          type: "string",
          description: "The ID of the reminder to snooze"
        },
        duration: {
          type: "string",
          description: "How long to snooze (e.g., '30 minutes', '1 hour')"
        }
      },
      required: ["reminder_id", "duration"]
    }
  }
}
```

### Step 2: Create the Handler

Add to `AiService.ts`:

```typescript
private async handleSnoozeReminder(
  args: { reminder_id: string; duration: string },
  chatId: string
): Promise<string> {
  try {
    // Get the reminder
    const reminder = await reminderService.getReminder(args.reminder_id);

    if (!reminder) {
      return JSON.stringify({
        success: false,
        error: "Reminder not found"
      });
    }

    // Parse the duration and calculate new time
    const newTime = reminderService.parseDateTime(`in ${args.duration}`);

    // Update the reminder (you'll need to add this method to ReminderService)
    await reminderService.updateReminderTime(args.reminder_id, newTime);

    return JSON.stringify({
      success: true,
      message: `✅ Reminder snoozed until ${newTime.toLocaleString()}`,
      new_time: newTime.toISOString()
    });
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message
    });
  }
}
```

### Step 3: Register the Handler

In `initializeFunctionHandlers()`:

```typescript
this.functionHandlers.set(
  "snooze_reminder",
  this.handleSnoozeReminder.bind(this)
);
```

## 🧪 Testing Function Calls

### Manual Testing in WhatsApp

1. **Start your bot**: `npm run start`
2. **Message the bot**: `@Gigi remind me to test this in 5 minutes`
3. **Check logs**: You should see:
   ```
   AI requested function call: create_reminder { message: 'test this', datetime: 'in 5 minutes' }
   Function create_reminder response: {"success":true,"reminder_id":"REM-..."}
   ```

### Unit Testing

Create `tests/AiService.test.ts`:

```typescript
import { AiService } from "../src/service/AiService";

describe("AiService Function Calling", () => {
  let aiService: AiService;

  beforeEach(() => {
    aiService = new AiService();
  });

  it("should create a reminder when asked", async () => {
    const userId = "test-chat-123";
    const response = await aiService.generateReply(
      "remind me to test this in 1 hour",
      userId
    );

    expect(response).toContain("Reminder created");
    expect(response).toContain("✅");
  });

  it("should list reminders", async () => {
    const userId = "test-chat-123";

    // Create a reminder first
    await aiService.generateReply("remind me to test in 1 hour", userId);

    // List reminders
    const response = await aiService.generateReply("show my reminders", userId);

    expect(response).toContain("reminder");
  });
});
```

## 🚀 Production Enhancements

### 1. **Persist to Database**

Update `ReminderService.ts` to use Prisma:

```typescript
async createReminder(
  chatId: string,
  message: string,
  scheduledTime: Date,
  mentions: string[] = []
): Promise<Reminder> {
  const reminder = await prisma.reminder.create({
    data: {
      chatId,
      message,
      scheduledTime,
      mentions,
      status: 'active'
    }
  });

  // Schedule the job
  await queueService.scheduleReminder(reminder);

  return reminder;
}
```

### 2. **Use Job Queue (Bull)**

```typescript
import Bull from "bull";

const reminderQueue = new Bull("reminders", {
  redis: process.env.REDIS_URL,
});

reminderQueue.process(async (job) => {
  const { reminderId, chatId, message } = job.data;

  // Send the WhatsApp message
  await whatsappService.sendMessage(chatId, {
    text: `⏰ Reminder: ${message}`,
  });

  // Mark as completed
  await reminderService.completeReminder(reminderId);
});

// Schedule a reminder
await reminderQueue.add(reminderData, {
  delay: scheduledTime.getTime() - Date.now(),
});
```

### 3. **Add More Functions**

Ideas for additional functions:

- `edit_reminder` - Modify existing reminder
- `snooze_reminder` - Postpone a reminder
- `recurring_reminder` - Create repeating reminders
- `reminder_stats` - Show statistics
- `search_reminders` - Search by keyword
- `export_reminders` - Export to calendar format

### 4. **Error Handling**

Add better error handling:

```typescript
private async handleCreateReminder(
  args: ReminderParams,
  chatId: string
): Promise<string> {
  try {
    // Validate input
    if (!args.message || args.message.trim().length === 0) {
      return JSON.stringify({
        success: false,
        error: "Reminder message cannot be empty"
      });
    }

    const scheduledTime = reminderService.parseDateTime(args.datetime);

    // Check if time is in the past
    if (scheduledTime < new Date()) {
      return JSON.stringify({
        success: false,
        error: "Cannot create reminder for a time in the past"
      });
    }

    // Create reminder...
  } catch (error: any) {
    logger.error("Error creating reminder:", error);
    return JSON.stringify({
      success: false,
      error: error.message
    });
  }
}
```

## 📝 Configuration

### Environment Variables

Add to `.env`:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # or gpt-4, gpt-3.5-turbo
OPENAI_TEMPERATURE=0.7

# Feature Flags
ENABLE_FUNCTION_CALLING=true
MAX_CONVERSATION_HISTORY=20
```

### Model Selection

Different models have different function calling capabilities:

- `gpt-4o` - Best function calling, most reliable
- `gpt-4o-mini` - Good balance of cost/performance
- `gpt-3.5-turbo` - Cheaper, still supports functions
- `gpt-4-turbo` - Advanced reasoning

Update in `AiService.ts`:

```typescript
model: process.env.OPENAI_MODEL || "gpt-4o-mini";
```

## 🐛 Troubleshooting

### Issue: AI doesn't call functions

**Check:**

1. Function schema is properly defined
2. Description is clear and specific
3. Model supports function calling
4. `tool_choice` is set to `"auto"`

**Solution:**

```typescript
// Be more explicit in system prompt
content: "When users ask to create a reminder, ALWAYS use the create_reminder function.";
```

### Issue: Function returns error

**Check logs:**

```typescript
logger.info(`Function ${functionName} response:`, functionResponse);
```

**Common causes:**

- Invalid datetime parsing
- Missing required parameters
- Database connection issues

### Issue: Reminder not firing

**Check:**

1. `scheduleReminderJob` is being called
2. Scheduled time is in the future
3. Process stays running (use PM2 or similar)

## 🎉 Summary

You now have:

- ✅ **3 working functions**: create, list, cancel reminders
- ✅ **Natural language understanding**: "tomorrow at 3pm", "in 2 hours"
- ✅ **Conversation memory**: AI remembers context
- ✅ **Extensible architecture**: Easy to add new functions
- ✅ **Production-ready structure**: ReminderService separation

### Next Steps:

1. ✅ Test with real WhatsApp messages
2. ⚠️ Add database persistence (Prisma schema)
3. ⚠️ Implement job queue (Bull/node-schedule)
4. ⚠️ Add user authentication/permissions
5. ⚠️ Create admin dashboard
6. ⚠️ Add analytics/logging

Happy coding! 🚀
