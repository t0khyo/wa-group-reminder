import logger from "../utils/logger.js";
import { newsService } from "../service/NewsService.js";
import { newsDigestService } from "../service/NewsDigestService.js";
import { audioService } from "../service/AudioService.js";
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
 * NewsScheduler - Manages AI news digest for manual commands
 */
export class NewsScheduler {
    private isProcessing: boolean = false; // Prevent concurrent executions

    constructor() {
        logger.info("NewsScheduler initialized");
    }

    /**
     * Start the scheduler
     */
    async start(): Promise<void> {
        logger.info("✅ NewsScheduler started");
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        logger.info("NewsScheduler stopped");
    }

    /**
     * Orchestrates fetching, formatting, and broadcasting the digest + audio
     * @param specificChatId Optional: if provided, only sends to this chat (used for manual command)
     * @param isManual Optional: if true, bypasses the seen-articles cache
     * @param withAudio Optional: if true, also generates and sends podcast audio
     * @returns The generated digest text, or null if nothing was generated
     */
    private async runPipeline(specificChatId?: string, isManual: boolean = false, withAudio: boolean = true): Promise<string | null> {
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

            // 2. Enrich articles with full content (for podcast generation)
            const enrichedArticles = await newsService.enrichArticles(candidates);

            // 3. Generate digest (+ podcast script if we have enough enriched articles)
            let podcastAudioPath: string | null = null;

            if (enrichedArticles.length >= 2 && withAudio) {
                // Use the combined generation (text digest + podcast script)
                logger.info(`Generating digest + podcast script for ${enrichedArticles.length} enriched articles...`);
                const result = await newsDigestService.generateDigestWithPodcast(enrichedArticles);

                if (result) {
                    digest = result.digest;

                    // Generate audio if we have segments and audio service is available
                    if (result.segments.length > 0 && audioService.isAvailable()) {
                        try {
                            logger.info(`Generating podcast audio from ${result.segments.length} segments...`);
                            podcastAudioPath = await audioService.generatePodcastAudio(result.segments);
                        } catch (audioErr) {
                            logger.error("Audio generation failed (text digest will still be sent):", {
                                error: audioErr instanceof Error ? audioErr.message : String(audioErr)
                            });
                            // Audio failure never blocks text digest
                        }
                    } else if (!audioService.isAvailable()) {
                        logger.info("Audio service not available. Skipping podcast audio.");
                    }
                }
            } else {
                // Not enough enriched articles for podcast — generate text-only digest
                if (enrichedArticles.length < 2) {
                    logger.info(`Only ${enrichedArticles.length} enriched article(s). Skipping audio, generating text-only digest.`);
                }
                digest = await newsDigestService.generateDigest(candidates);
            }

            if (!digest) {
                logger.error("Failed to generate AI news digest. Skipping broadcast.");
                return null;
            }

            // 4. Check WhatsApp service
            if (!whatsappService) {
                logger.warn("WhatsApp service not connected to NewsScheduler. Skipping broadcast.");
                if (podcastAudioPath) audioService.cleanupFile(podcastAudioPath);
                return digest;
            }

            // 5. Determine target chats
            const targetChats = specificChatId
                ? [specificChatId]
                : await this.getSubscribedChats();

            if (targetChats.length === 0) {
                logger.info("No subscribed chats found for news digest.");
                if (podcastAudioPath) audioService.cleanupFile(podcastAudioPath);
                return digest;
            }

            // 6. Broadcast to chats: text first, then audio
            logger.info(`Broadcasting AI news digest to ${targetChats.length} chat(s)...`);

            for (const chatId of targetChats) {
                try {
                    // Send text digest first
                    await whatsappService.sendMessage(chatId, { text: digest });

                    // Send audio immediately after (if available)
                    if (podcastAudioPath) {
                        try {
                            await whatsappService.sendAudioAsVoice(chatId, podcastAudioPath);
                        } catch (audioSendErr) {
                            logger.error(`Failed to send podcast audio to chat ${chatId}:`, audioSendErr);
                            // Don't fail the whole loop because of audio
                        }
                    }

                    // Add a small delay between messages to avoid rate limits
                    if (targetChats.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (err) {
                    logger.error(`Failed to send news digest to chat ${chatId}:`, err);
                }
            }

            // 7. Cleanup audio file after all sends
            if (podcastAudioPath) {
                audioService.cleanupFile(podcastAudioPath);
            }

            // 8. Mark as seen only after successful generation and (attempted) sending
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
     * Manually trigger a text-only news digest for a specific chat (existing /news command)
     */
    async sendManualDigest(chatId: string): Promise<string | null> {
        logger.info(`Manually triggering AI news digest for chat ${chatId}`);
        return await this.runPipeline(chatId, true, false);
    }

    /**
     * Manually trigger a news digest WITH podcast audio for a specific chat (/read-news command)
     */
    async sendManualDigestWithAudio(chatId: string): Promise<string | null> {
        logger.info(`Manually triggering AI news digest WITH audio for chat ${chatId}`);
        return await this.runPipeline(chatId, true, true);
    }
}

// Singleton instance
export const newsScheduler = new NewsScheduler();
