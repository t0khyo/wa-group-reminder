import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import logger from "../utils/logger.js";

export class ReadNewsCommand implements Command {
    name = "read-news";
    aliases = ["/read-news", "/readnews", "/podcast"];

    async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
        // Import NewsScheduler dynamically to avoid circular dependency
        const { newsScheduler } = await import("../sheduler/NewsScheduler.js");

        // Send a "generating" message since audio takes longer
        await services.whatsapp.sendMessage(context.chatId, {
            text: "Generating your AI news podcast...🎙️  This may take a minute."
        });

        const digest = await newsScheduler.sendManualDigestWithAudio(context.chatId);

        // If no digest was generated (e.g., no new articles or API failure), send fallback
        if (!digest) {
            const fallbackMessage = "No new AI stories available right now. Try again later!";
            await services.whatsapp.sendMessage(context.chatId, { text: fallbackMessage });
        }

        logger.info(
            `Manual AI news podcast triggered in ${context.chatId} by ${context.senderId}`
        );
    }
}
