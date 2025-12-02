# Conversation Memory Implementation Guide

## Current Implementation (In-Memory)

The AI service now remembers conversations using an in-memory Map. This works well for:

- Development and testing
- Small-scale deployments
- Single-instance applications

### Features:

- ✅ Remembers last 20 messages per chat
- ✅ AI asks for clarification when needed
- ✅ Context-aware responses
- ✅ Automatic history trimming

### Usage:

```typescript
// The AI now automatically remembers conversations
const reply = await aiService.generateReply(text, chatId);

// Clear history for a specific chat
aiService.clearHistory(chatId);

// Clear all histories (good for memory cleanup)
aiService.clearAllHistories();
```

## Approach 2: Database-Based Storage (Production)

For production deployments with multiple instances or long-term storage:

### Step 1: Update Prisma Schema

Add to `prisma/schema.prisma`:

```prisma
model Conversation {
  id        String   @id @default(uuid())
  userId    String   // chatId or userId
  role      String   // "system", "user", or "assistant"
  content   String   @db.Text
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

### Step 2: Create Database Service

Create `src/service/ConversationService.ts`:

```typescript
import { PrismaClient } from "../generated/prisma/index.js";
import logger from "../utils/logger.js";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ConversationService {
  private prisma: PrismaClient;
  private readonly maxMessages: number = 20;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getHistory(userId: string): Promise<Message[]> {
    const messages = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: this.maxMessages,
    });

    return messages.reverse().map((msg) => ({
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
    }));
  }

  async addMessage(
    userId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    await this.prisma.conversation.create({
      data: { userId, role, content },
    });

    // Clean old messages (keep last 50)
    const count = await this.prisma.conversation.count({
      where: { userId },
    });

    if (count > 50) {
      const oldMessages = await this.prisma.conversation.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: count - 50,
      });

      await this.prisma.conversation.deleteMany({
        where: {
          id: { in: oldMessages.map((m) => m.id) },
        },
      });
    }
  }

  async clearHistory(userId: string): Promise<void> {
    await this.prisma.conversation.deleteMany({
      where: { userId },
    });
    logger.info(`Cleared conversation history for user ${userId}`);
  }

  async clearOldConversations(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    await this.prisma.conversation.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });
    logger.info(`Cleared conversations older than ${daysOld} days`);
  }
}
```

### Step 3: Update AiService for Database

```typescript
import { ConversationService } from "./ConversationService.js";

export class AiService {
  private client: OpenAI;
  private conversationService: ConversationService;
  private systemPrompt =
    "Your name is Gigi. You are a helpful assistant in a WhatsApp group. " +
    "If you need more information to provide a complete answer, ask the user for clarification. " +
    "Keep responses concise (under 300 characters when possible). " +
    "Remember the conversation context and refer back to previous messages when relevant.";

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not defined in .env");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.conversationService = new ConversationService();
  }

  public async generateReply(text: string, userId: string): Promise<string> {
    logger.info(`AI processing text from user ${userId}: "${text}"`);

    try {
      // Get conversation history from database
      let history = await this.conversationService.getHistory(userId);

      // Add system prompt if this is a new conversation
      if (history.length === 0) {
        history = [{ role: "system", content: this.systemPrompt }];
      }

      // Add user's message to history
      await this.conversationService.addMessage(userId, "user", text);
      history.push({ role: "user", content: text });

      const response = await this.client.responses.create({
        model: "gpt-5-nano",
        input: history,
      });

      const reply =
        response.output_text ?? "Sorry, I couldn't generate a reply.";

      // Save assistant's reply
      await this.conversationService.addMessage(userId, "assistant", reply);

      return reply;
    } catch (err: any) {
      logger.error("AI Error: " + (err?.message || err));
      return "Sorry, I couldn't process that right now.";
    }
  }

  public async clearHistory(userId: string): Promise<void> {
    await this.conversationService.clearHistory(userId);
  }
}
```

## Configuration Options

### Adjust Memory Settings

In `AiService.ts`, you can modify:

```typescript
private readonly maxHistoryLength: number = 20; // Number of messages to remember
```

### Enhanced System Prompt

For better clarification asking:

```typescript
content:
  "Your name is Gigi. You are a helpful assistant in a WhatsApp group. " +
  "When users ask vague questions or you need more details, politely ask for clarification. " +
  "Examples: " +
  "- If asked 'remind me', ask 'What would you like to be reminded about and when?' " +
  "- If asked about 'that thing', ask 'Which thing are you referring to?' " +
  "Keep responses under 300 characters when possible. " +
  "Use previous conversation context to provide more personalized responses.",
```

## Testing

Test the conversation memory:

1. **First message**: `@Gigi What's the weather like?`

   - AI: "I don't have access to weather data. Which city are you asking about?"

2. **Second message**: `@Gigi Paris`

   - AI: "I understand you're asking about Paris, but I still can't access weather..."
   - Notice it remembers "Paris" from context

3. **Clear and test**:
   ```typescript
   aiService.clearHistory(chatId);
   ```

## Migration Command

If using database approach:

```bash
npx prisma migrate dev --name add_conversation_memory
npx prisma generate
```

## Memory Management

### Automatic Cleanup

Add a cron job or scheduled task:

```typescript
// In your main app startup
setInterval(() => {
  aiService.clearAllHistories(); // In-memory approach
  // OR
  conversationService.clearOldConversations(30); // Database approach
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

## Troubleshooting

**Issue**: AI doesn't remember previous messages

- Check that `userId`/`chatId` is consistent across calls
- Verify history is being stored (check logs or database)

**Issue**: Out of memory errors

- Reduce `maxHistoryLength`
- Implement regular cleanup
- Consider database approach for production

**Issue**: Slow responses

- Reduce number of messages in history
- Use database indexes
- Consider caching recent conversations
