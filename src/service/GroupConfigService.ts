import logger from "../utils/logger.js";
import { prisma } from "../lib/prisma.js";

/**
 * Service to manage group-level configuration
 */
class GroupConfigService {
  /**
   * Check if bot is enabled in a group
   * @returns true if enabled (default), false if disabled
   */
  async isBotEnabled(chatId: string): Promise<boolean> {
    try {
      const config = await prisma.groupConfig.findUnique({
        where: { chatId },
      });

      // Default to DISABLED if no config exists
      return config?.botEnabled ?? false;
    } catch (error) {
      logger.error(`Failed to check if bot enabled for ${chatId}:`, error);
      return false; // Fail-closed: default to disabled
    }
  }

  /**
   * Enable bot in a group
   */
  async enableBot(chatId: string): Promise<void> {
    try {
      await prisma.groupConfig.upsert({
        where: { chatId },
        update: { botEnabled: true },
        create: { chatId, botEnabled: true },
      });

      logger.info(`Bot enabled in group ${chatId}`);
    } catch (error) {
      logger.error(`Failed to enable bot in ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Disable bot in a group
   */
  async disableBot(chatId: string): Promise<void> {
    try {
      await prisma.groupConfig.upsert({
        where: { chatId },
        update: { botEnabled: false },
        create: { chatId, botEnabled: false },
      });

      logger.info(`Bot disabled in group ${chatId}`);
    } catch (error) {
      logger.error(`Failed to disable bot in ${chatId}:`, error);
      throw error;
    }
  }
}

export const groupConfigService = new GroupConfigService();
