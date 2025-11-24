import ReminderService from "./service/reminderService.js";

console.log("Starting WhatsApp Bot...");
const service = new ReminderService();

service.start().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
