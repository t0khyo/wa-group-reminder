import WhatsappService from "./service/WhatsappService.js";
import logger from "./utils/logger.js";
import { reminderScheduler } from "./service/ReminderScheduler.js";
import { setWhatsappService } from "./service/ReminderScheduler.js";

async function main() {
  try {
    const whatsappService = new WhatsappService();

    // Start the reminder scheduler
    await reminderScheduler.start();

    await whatsappService.start();

    // Connect WhatsApp service to scheduler for sending messages
    setWhatsappService(whatsappService);

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
      // await whatsappService.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      reminderScheduler.stop();
      // await whatsappService.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();
