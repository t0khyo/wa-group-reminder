import { MessageContext } from "../types/index.js";

export interface IWhatsappConnector {
  sendMessage(chatId: string, content: any): Promise<any>;
  clearAiHistory(userId: string): Promise<void>;
}

export interface ICommandRegistry {
  getAll(): Command[];
}

export interface ServiceContainer {
  whatsapp: IWhatsappConnector;
  registry: ICommandRegistry;
}

export interface Command {
  name: string;
  aliases: string[];
  execute(context: MessageContext, services: ServiceContainer): Promise<void>;
}
