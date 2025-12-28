import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";

export class ClearHistoryCommand implements Command {
  name = "clear-history";
  aliases = ["/clear-history", "/clear", "/reset", "/new-chat"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    await services.whatsapp.clearAiHistory(context.senderId);
    await services.whatsapp.sendMessage(context.chatId, {
      text: "Cleared our conversation history! Started a new chat session. 🧹",
    });
  }
}
