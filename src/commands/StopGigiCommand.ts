import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { groupConfigService } from "../service/GroupConfigService.js";
import logger from "../utils/logger.js";

export class StopGigiCommand implements Command {
  name = "stop-gigi";
  aliases = ["/stop-gigi", "/disable-gigi", "/gigi-off"];
  excludeFromHelp = true;

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    logger.info(`Disabling bot in group ${context.chatId} by ${context.senderId}`);

    try {
      await groupConfigService.disableBot(context.chatId);

      await services.whatsapp.sendMessage(context.chatId, {
        text: "🔕 Gigi is now *disabled* in this group.\n\nI will not respond to messages.\nRe-enable anytime: `/start-gigi`",
      });
    } catch (error) {
      logger.error("Failed to disable bot:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Failed to disable bot. Please try again.",
      });
    }
  }
}
