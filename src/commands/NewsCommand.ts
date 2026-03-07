import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import logger from "../utils/logger.js";

export class NewsCommand implements Command {
    name = "news";
    aliases = ["/news", "/ai-news", "/ainews"];

    async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
        // Import NewsScheduler dynamically to avoid circular dependency
        const { newsScheduler } = await import("../sheduler/NewsScheduler.js");

        const digest = await newsScheduler.sendManualDigest(context.chatId);

        // If no digest was generated (e.g., no new articles or API failure), send fallback
        if (!digest) {
            const fallbackMessage = "No new AI stories available right now. Try again later!";
            await services.whatsapp.sendMessage(context.chatId, { text: fallbackMessage });
        }

        logger.info(
            `Manual AI news digest triggered in ${context.chatId} by ${context.senderId}`
        );
    }
}
