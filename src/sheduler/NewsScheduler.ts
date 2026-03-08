import * as schedule from "node-schedule";
import logger from "../utils/logger.js";
import { newsService } from "../service/NewsService.js";
import { newsDigestService } from "../service/NewsDigestService.js";
import { DEFAULT_TIMEZONE } from "../config/TimeZone.js";
import { prisma } from "../lib/prisma.js";
import { TaskStatus } from "../generated/prisma/client.js";

// WhatsApp service instance (will be set after initialization)
let whatsappService: any = null;

/**
 * Set the WhatsApp service instance for sending messages
 */
export function setWhatsappService(service: any): void {
    whatsappService = service;
    logger.info("WhatsApp service connected to NewsScheduler");
}

/**
 * NewsScheduler - Manages scheduled AI news digest notifications
 * Sends news summaries at 8:00 AM daily
 */
export class NewsScheduler {
    private dailyDigestJob: schedule.Job | null = null;
    private isProcessing: boolean = false; // Prevent concurrent executions

    constructor() {
        logger.info("NewsScheduler initialized");
    }

    /**
     * Start the scheduler
     */
    async start(): Promise<void> {
        logger.info("🚀 Starting NewsScheduler...");

        // Schedule daily digest at 8:00 AM (in configured timezone)
        this.scheduleDailyDigest();

        logger.info("✅ NewsScheduler started successfully");
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        logger.info("Stopping NewsScheduler...");

        if (this.dailyDigestJob) {
            this.dailyDigestJob.cancel();
            this.dailyDigestJob = null;
        }

        logger.info("NewsScheduler stopped");
    }

    /**
     * Schedule daily digest at 8:00 AM
     */
    private scheduleDailyDigest(): void {
        try {
            // Schedule for 8:00 AM every day
            const rule = new schedule.RecurrenceRule();
            rule.hour = 8;
            rule.minute = 0;
            rule.tz = DEFAULT_TIMEZONE;

            this.dailyDigestJob = schedule.scheduleJob(rule, async () => {
                logger.info(`Running daily AI news digest at 8:00 AM (${DEFAULT_TIMEZONE})...`);
                await this.runDigest();
            });

            logger.info(`📰 Daily AI news digest scheduled for 8:00 AM daily (${DEFAULT_TIMEZONE})`);
        } catch (error) {
            logger.error("Error scheduling daily news digest:", error);
        }
    }

    /**
     * Orchestrates fetching, formatting, and broadcasting the digest
     * @param specificChatId Optional: if provided, only sends to this chat (used for manual command)
     * @param isManual Optional: if true, bypasses the seen-articles cache
     * @returns The generated digest text, or null if nothing was generated
     */
    private async runPipeline(specificChatId?: string, isManual: boolean = false): Promise<string | null> {
        if (this.isProcessing) {
            logger.warn("News digest pipeline is already running. Skipping.");
            return null;
        }

        this.isProcessing = true;
        let digest: string | null = null;

        try {
            // 1. Fetch filtered candidates (bypass cache if manual)
            const candidates = await newsService.fetchAiStories(isManual);

            if (candidates.length === 0) {
                logger.info("No new AI stories found today. Skipping digest generation.");
                return null;
            }

            // 2. Generate summary with Gemini
            logger.info(`Generating digest for ${candidates.length} stories...`);
            digest = await newsDigestService.generateDigest(candidates);

            if (!digest) {
                logger.error("Failed to generate AI news digest. Skipping broadcast.");
                return null;
            }

            // 3. Optional: add a tiny delay to ensure formatting is clean before sending
            if (!whatsappService) {
                logger.warn("WhatsApp service not connected to NewsScheduler. Skipping broadcast.");
                return digest;
            }

            // 4. Send to chats
            const targetChats = specificChatId
                ? [specificChatId]
                : await this.getSubscribedChats();

            if (targetChats.length === 0) {
                logger.info("No subscribed chats found for news digest.");
                return digest;
            }

            logger.info(`Broadcasting AI news digest to ${targetChats.length} chat(s)...`);

            for (const chatId of targetChats) {
                try {
                    await whatsappService.sendMessage(chatId, { text: digest });
                    // Add a small delay between messages to avoid rate limits
                    if (targetChats.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (err) {
                    logger.error(`Failed to send news digest to chat ${chatId}:`, err);
                }
            }

            // 5. Mark as seen only after successful generation and (attempted) sending
            // (Even if manually triggered, we add them to cache so the automated run won't repeat them)
            newsService.markStoriesAsSeen(candidates);

            return digest;

        } catch (error) {
            logger.error("Error in news digest pipeline:", error);
            return null;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Scheduled run - broadcasts to all subscribed groups
     */
    private async runDigest(): Promise<void> {
        await this.runPipeline();
    }

    /**
     * Gets distinct chat IDs that have at least one pending or in-progress task.
     * We use the same subscription criteria as task digests.
     */
    private async getSubscribedChats(): Promise<string[]> {
        try {
            const result = await prisma.tasks.findMany({
                where: {
                    OR: [
                        { status: TaskStatus.Pending },
                        { status: TaskStatus.InProgress },
                    ],
                },
                select: {
                    chatId: true,
                },
                distinct: ["chatId"],
            });

            return result.map((r) => r.chatId);
        } catch (error) {
            logger.error("Error getting subscribed chats for news:", error);
            return [];
        }
    }

    /**
     * Manually trigger a news digest for a specific chat
     */
    async sendManualDigest(chatId: string): Promise<string | null> {
        logger.info(`Manually triggering AI news digest for chat ${chatId}`);
        return await this.runPipeline(chatId, true);
    }
}

// Singleton instance
export const newsScheduler = new NewsScheduler();
