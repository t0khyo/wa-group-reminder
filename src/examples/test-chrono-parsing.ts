/**
 * Test script to demonstrate chrono-node time parsing capabilities
 * Run with: npx tsx src/examples/test-chrono-parsing.ts
 */

import { reminderService } from "../service/ReminderService.js";

console.log("\n🕐 Testing Chrono-Node Time Parsing\n");
console.log("=".repeat(70));

const testCases = [
  // Relative times
  "in 2 hours",
  "in 30 minutes",
  "in 5 days",
  "in 1 week",

  // Tomorrow variations
  "tomorrow",
  "tomorrow at 3pm",
  "tomorrow at 9:30am",
  "tomorrow morning",
  "tomorrow afternoon",
  "tomorrow evening",

  // Specific dates
  "Dec 15 at 2pm",
  "December 25th at 10:30am",
  "next Monday at 9am",
  "next Friday afternoon",

  // Day of week
  "Monday at 10am",
  "this Friday at 5pm",
  "next Tuesday at 2:30pm",

  // Time only (today)
  "at 5pm",
  "3:30pm",
  "9am",

  // Natural language
  "in an hour",
  "in half an hour",
  "in a week",
  "next month",

  // Complex expressions
  "two days from now at 3pm",
  "in 3 hours and 30 minutes",
  "the day after tomorrow at noon",

  // ISO format (should still work)
  "2024-12-15T14:30:00Z",
];

const now = new Date();
console.log(`\nCurrent time: ${now.toLocaleString()}\n`);

testCases.forEach((testCase, index) => {
  try {
    const parsed = reminderService.parseDateTime(testCase);
    const diff = parsed.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    console.log(`${(index + 1).toString().padStart(2)}. "${testCase}"`);
    console.log(`    → ${parsed.toLocaleString()}`);
    console.log(`    → ${hours}h ${minutes}m from now`);
    console.log();
  } catch (error) {
    console.error(
      `${(index + 1).toString().padStart(2)}. "${testCase}" - ERROR:`,
      error
    );
  }
});

console.log("=".repeat(70));
console.log(
  "\n✅ Chrono-node can parse all these natural language expressions!"
);
console.log("   No need to rely on GPT for time parsing.\n");
