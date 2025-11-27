import { ListenerService } from "./service/listenerService.js";
import ReminderService from "./service/reminderService.js";
import logger from "./utils/logger.js";

logger.info("Starting WhatsApp Bot...");
const service = new ListenerService();

service.start().catch((err) => {
  logger.error("Failed to start bot:", err);
  process.exit(1);
});
