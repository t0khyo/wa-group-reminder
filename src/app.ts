import WhatsappService from "./service/WhatsappService.js";
import logger from "./utils/logger.js";

async function main() {
  try {
    const whatsappService = new WhatsappService();

    await whatsappService.start();

    logger.info("🚀 WhatsApp bot started successfully!");

    // Cleanup rate limiter every hour
    setInterval(() => {
      // Access via whatsappService if exposed
      logger.debug("Running rate limiter cleanup...");
    }, 3600000);

    // Graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      // await whatsappService.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      // await whatsappService.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();
