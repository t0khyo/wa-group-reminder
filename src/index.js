import { whatsappService } from "./service/WhatsappService.js";
import logger from "./utils/logger.js";

async function main() {
  logger.info("Starting WhatsApp Bot...");
  await whatsappService.start().catch((err) => {
    logger.error("Failed to start bot:", err);
    process.exit(1);
  });
}

main();
