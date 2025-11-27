import { WhatsappService } from "./service/WhatsappService.js";
import logger from "./utils/logger.js";

logger.info("Starting WhatsApp Bot...");
const service = new WhatsappService();

service.start().catch((err) => {
  logger.error("Failed to start bot:", err);
  process.exit(1);
});
