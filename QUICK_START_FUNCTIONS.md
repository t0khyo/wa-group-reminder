# 🚀 Quick Start: Function Calling Implementation

## ✅ What's Been Implemented

Your WhatsApp bot now has **OpenAI Function Calling** capabilities!

### Files Modified/Created:

1. ✅ `src/service/AiService.ts` - Enhanced with function calling
2. ✅ `src/service/ReminderService.ts` - New service for reminder logic
3. ✅ `src/examples/test-function-calling.ts` - Test file
4. ✅ `FUNCTION_CALLING_GUIDE.md` - Complete documentation

## 🎯 Available Functions

### 1. `create_reminder`

Creates a reminder that will be sent at a specific time.

**Parameters:**

- `message` (string, required) - What to remind about
- `datetime` (string, required) - When to send the reminder
- `mentions` (array, optional) - Users to mention

**Example:**

```
User: @Gigi remind me to submit report tomorrow at 3pm
AI: ✅ Reminder created! I'll remind you on Dec 04, 2025 at 03:00 PM
```

---

### 2. `list_reminders`

Lists all reminders for the current chat.

**Parameters:**

- `status` (string, optional) - Filter by: "active", "completed", "all"

**Example:**

```
User: @Gigi show my reminders
AI: You have 2 active reminders:
    1. Submit report - Dec 04, 2025 at 03:00 PM
    2. Team meeting - Dec 04, 2025 at 02:00 PM
```

---

### 3. `cancel_reminder`

Cancels an existing reminder.

**Parameters:**

- `reminder_id` (string, required) - The ID of the reminder

**Example:**

```
User: @Gigi cancel reminder REM-123456
AI: ✅ Reminder REM-123456 has been cancelled
```

## 🧪 Testing

### Option 1: Test Locally (No WhatsApp needed)

```bash
# Run the test file
npx tsx src/examples/test-function-calling.ts
```

This will simulate conversations and show you how the AI calls functions.

### Option 2: Test with WhatsApp

1. Start your bot:

   ```bash
   npm run start
   ```

2. Scan the QR code with WhatsApp

3. In a group, mention the bot:

   ```
   @Gigi remind me to test this in 5 minutes
   ```

4. Check the logs to see function calls:
   ```
   AI requested function call: create_reminder { message: 'test this', datetime: 'in 5 minutes' }
   Function create_reminder response: {"success":true,...}
   ```

## ⏰ Supported Time Formats

The AI understands natural language times:

- ✅ `in 2 hours`
- ✅ `in 30 minutes`
- ✅ `tomorrow at 3pm`
- ✅ `tomorrow at 14:30`
- ✅ `in 5 days`
- ✅ `in 1 week`
- ✅ `2024-12-15T14:30:00Z` (ISO format)

## 🔧 How It Works

```
1. User sends message → "@Gigi remind me to X at Y"
                          ↓
2. AI analyzes intent → Decides to call create_reminder()
                          ↓
3. Function executes  → ReminderService.createReminder()
                          ↓
4. Result returned   → { success: true, reminder_id: "REM-..." }
                          ↓
5. AI formats reply  → "✅ Reminder created! I'll remind you on..."
```

## 📝 Current Implementation Status

### ✅ Working Now:

- Function calling infrastructure
- 3 fully working functions
- Conversation memory
- Natural language time parsing
- In-memory reminder storage

### ⚠️ TODO (Production):

- [ ] Persist reminders to database (Prisma)
- [ ] Implement job queue (Bull/node-schedule)
- [ ] Send actual WhatsApp messages when reminder fires
- [ ] Add user permissions/authentication
- [ ] Error handling improvements
- [ ] Rate limiting

## 🔐 Environment Variables

Make sure your `.env` has:

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional (defaults shown)
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
MAX_CONVERSATION_HISTORY=20
```

## 📚 Next Steps

### Immediate:

1. Test the function calling with the test script
2. Try it with WhatsApp
3. Monitor the logs to see function calls

### Short-term:

1. Add database schema for reminders
2. Implement job scheduling
3. Connect reminder execution to WhatsApp sending

### Long-term:

1. Add more functions (edit, snooze, recurring)
2. Implement user permissions
3. Create admin dashboard
4. Add analytics

## 🐛 Troubleshooting

### AI doesn't call functions

**Check:**

- OpenAI API key is valid
- Model supports function calling (gpt-4o-mini or better)
- Function descriptions are clear

### Reminder doesn't fire

**Note:**
Currently using `setTimeout` for demo purposes. In production:

- Use Bull queue with Redis
- Or node-schedule for cron-like scheduling
- Ensure process stays running (PM2)

### Type errors

```bash
# Reinstall dependencies
npm install

# Check TypeScript
npx tsc --noEmit
```

## 💡 Example Conversations

### Creating a reminder:

```
User: @Gigi I have a meeting tomorrow
AI: What time is your meeting tomorrow?
User: at 2pm
AI: Got it! What would you like me to remind you about?
User: Team standup meeting
AI: ✅ Reminder created! I'll remind you "Team standup meeting" on Dec 04, 2025 at 02:00 PM
```

### Listing reminders:

```
User: @Gigi what reminders do I have?
AI: You have 3 active reminders:
    1. Team standup - Tomorrow at 02:00 PM (REM-123)
    2. Submit report - Dec 05 at 03:00 PM (REM-456)
    3. Call client - Today at 05:30 PM (REM-789)
```

### Canceling:

```
User: @Gigi cancel the team standup reminder
AI: I found reminder REM-123 for "Team standup". Would you like me to cancel it?
User: yes
AI: ✅ Reminder REM-123 has been cancelled
```

## 📖 Full Documentation

See `FUNCTION_CALLING_GUIDE.md` for:

- Detailed API reference
- Adding new functions
- Production deployment
- Advanced configuration

---

**Ready to test?** Run:

```bash
npx tsx src/examples/test-function-calling.ts
```

🎉 Happy coding!
