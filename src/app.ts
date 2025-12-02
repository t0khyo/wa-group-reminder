import { whatsappService } from "./service/WhatsappService.js";
import logger from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting WhatsApp Bot...");

  try {
    await whatsappService.start();
  } catch (err: any) {
    logger.error("Failed to start bot:", err?.message || err);
    process.exit(1);
  }
}

main();
