import WhatsappService from "./service/WhatsappService.js";
import logger from "./utils/logger.js";
import { reminderScheduler } from "./sheduler/ReminderScheduler.js";
import { setWhatsappService as setReminderWhatsappService } from "./sheduler/ReminderScheduler.js";
import { taskScheduler } from "./sheduler/TaskScheduler.js";
import { setWhatsappService as setTaskWhatsappService } from "./sheduler/TaskScheduler.js";
import { newsScheduler } from "./sheduler/NewsScheduler.js";
import { setWhatsappService as setNewsWhatsappService } from "./sheduler/NewsScheduler.js";

async function main() {
  try {
    const whatsappService = new WhatsappService();

    // Start the reminder scheduler
    await reminderScheduler.start();

    // Start the task scheduler
    await taskScheduler.start();

    // Start the news digest scheduler
    await newsScheduler.start();

    await whatsappService.start();

    // Connect WhatsApp service to schedulers for sending messages
    setReminderWhatsappService(whatsappService);
    setTaskWhatsappService(whatsappService);
    setNewsWhatsappService(whatsappService);

    logger.info("🚀 WhatsApp bot started successfully!");

    // Cleanup rate limiter every hour
    setInterval(() => {
      // Access via whatsappService if exposed
      logger.debug("Running rate limiter cleanup...");
    }, 3600000);

    // Graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      reminderScheduler.stop();
      taskScheduler.stop();
      newsScheduler.stop();
      // await whatsappService.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      reminderScheduler.stop();
      taskScheduler.stop();
      newsScheduler.stop();
      // await whatsappService.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();
