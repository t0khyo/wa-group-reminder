import { Command, ServiceContainer } from "./Command.js";
import { MessageContext } from "../types/index.js";
import { prisma } from "../lib/prisma.js";
import logger from "../utils/logger.js";

export class HealthCommand implements Command {
  name = "health";
  aliases = ["/health", "/status"];
  excludeFromHelp = true;

  async execute(
    context: MessageContext,
    services: ServiceContainer,
  ): Promise<void> {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;

      // Get uptime (if process started timestamp is available)
      const uptimeSeconds = process.uptime();
      const uptimeHours = Math.floor(uptimeSeconds / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
      const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

      // Get bot enabled status
      const { groupConfigService } =
        await import("../service/GroupConfigService.js");
      const botEnabled = await groupConfigService.isBotEnabled(context.chatId);

      const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const memTotal = Math.round(
        process.memoryUsage().heapTotal / 1024 / 1024,
      );
      const botStatusLine = botEnabled ? `Enabled 🟢` : `Disabled 🔴`;

      const message = [
        "Gigi — Health Report",
        "",
        `Bot       ${botStatusLine}`,
        `Database  Connected 🟢`,
        `Uptime    ${uptime}`,
        `Node.js   ${process.version}`,
        `Memory    ${memUsed}MB / ${memTotal}MB`,
      ].join("\n");

      await services.whatsapp.sendMessage(context.chatId, {
        text: message,
      });
    } catch (error) {
      logger.error("Health check failed:", error);
      await services.whatsapp.sendMessage(context.chatId, {
        text: "❌ Health check failed. Check logs for details.",
      });
    }
  }
}
