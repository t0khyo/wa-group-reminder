import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import logger from "../utils/logger.js";

export class TaskDigestCommand implements Command {
  name = "task-digest";
  aliases = ["/task-digest", "/digest", "/d"];

  async execute(context: MessageContext, services: ServiceContainer): Promise<void> {
    // Import TaskScheduler dynamically to avoid circular dependency
    const { taskScheduler } = await import("../sheduler/TaskScheduler.js");

    await taskScheduler.sendManualDigest(context.chatId, "morning");

    logger.info(
      `Manual task digest sent to ${context.chatId} by ${context.senderId}`
    );
  }
}
