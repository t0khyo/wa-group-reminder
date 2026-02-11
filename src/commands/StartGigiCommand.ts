import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { groupConfigService } from "../service/GroupConfigService.js";
import logger from "../utils/logger.js";

export class StartGigiCommand implements Command {
  name = "start-gigi";
  aliases = ["/start-gigi", "/enable-gigi", "/gigi-on"];
  excludeFromHelp = true;

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    logger.info(`Enabling bot in group ${context.chatId} by ${context.senderId}`);

    try {
      await groupConfigService.enableBot(context.chatId);

      await services.whatsapp.sendMessage(context.chatId, {
        text: "✅ Gigi is now *enabled* in this group!\n\nI will respond to replies, mentions, and commands!",
      });
    } catch (error) {
      logger.error("Failed to enable bot:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Failed to enable bot. Please try again.",
      });
    }
  }
}
