/**
 * Example: Testing Function Calling Locally
 *
 * This file demonstrates how to test the AI function calling
 * without needing a WhatsApp connection.
 */

import { AiService } from "../service/AiService.js";
import logger from "../utils/logger.js";

async function testFunctionCalling() {
  const aiService = new AiService();
  const testChatId = "test-chat-12345";

  console.log("\n🧪 Testing AI Function Calling\n");
  console.log("=".repeat(60));

  // Test 1: Create a reminder
  console.log("\n📝 Test 1: Create Reminder");
  console.log("-".repeat(60));

  const test1 = await aiService.generateReply(
    "Remind me to submit the weekly report tomorrow at 3pm",
    testChatId
  );
  console.log("User:", "Remind me to submit the weekly report tomorrow at 3pm");
  console.log("AI:", test1);

  // Test 2: Create another reminder with relative time
  console.log("\n📝 Test 2: Create Reminder (Relative Time)");
  console.log("-".repeat(60));

  const test2 = await aiService.generateReply(
    "Set a reminder to call the client in 2 hours",
    testChatId
  );
  console.log("User:", "Set a reminder to call the client in 2 hours");
  console.log("AI:", test2);

  // Test 3: List reminders
  console.log("\n📋 Test 3: List Reminders");
  console.log("-".repeat(60));

  const test3 = await aiService.generateReply(
    "Show me all my active reminders",
    testChatId
  );
  console.log("User:", "Show me all my active reminders");
  console.log("AI:", test3);

  // Test 4: Cancel a reminder (you'll need to use an actual ID from test 1 or 2)
  console.log("\n🗑️  Test 4: Cancel Reminder");
  console.log("-".repeat(60));

  const test4 = await aiService.generateReply(
    "Can you list my reminders first?",
    testChatId
  );
  console.log("User:", "Can you list my reminders first?");
  console.log("AI:", test4);

  // Test 5: Contextual conversation
  console.log("\n💬 Test 5: Contextual Conversation");
  console.log("-".repeat(60));

  const test5a = await aiService.generateReply(
    "I need to remember something",
    testChatId
  );
  console.log("User:", "I need to remember something");
  console.log("AI:", test5a);

  const test5b = await aiService.generateReply(
    "To review the code tomorrow morning at 9am",
    testChatId
  );
  console.log("User:", "To review the code tomorrow morning at 9am");
  console.log("AI:", test5b);

  // Test 6: Ask for clarification
  console.log("\n❓ Test 6: AI Asks for Clarification");
  console.log("-".repeat(60));

  const test6a = await aiService.generateReply(
    "Remind me tomorrow",
    testChatId
  );
  console.log("User:", "Remind me tomorrow");
  console.log("AI:", test6a);

  const test6b = await aiService.generateReply(
    "About the team standup at 10am",
    testChatId
  );
  console.log("User:", "About the team standup at 10am");
  console.log("AI:", test6b);

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed!\n");
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testFunctionCalling().catch(console.error);
}

export { testFunctionCalling };
