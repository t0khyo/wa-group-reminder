import logger from "../utils/logger.js";

export interface HackerNewsStory {
    id: number;
    title: string;
    url: string;
}

export class NewsService {
    private readonly HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
    private readonly HN_ITEM_URL_BASE = "https://hacker-news.firebaseio.com/v0/item/";

    // AI-related keywords (case-insensitive)
    private readonly AI_KEYWORDS = [
        "ai", "llm", "gpt", "claude", "gemini", "openai", "anthropic",
        "machine learning", "neural", "model", "agent", "artificial intelligence",
        "deepseek", "mistral"
    ];

    // In-memory cache of seen article URLs to prevent unbounded growth
    private seenArticleUrls: Set<string> = new Set();
    private readonly MAX_CACHE_SIZE = 100;

    constructor() {
        logger.debug("NewsService initialized");
    }

    /**
     * Fetches the top 30 stories from Hacker News, filters them for AI content,
     * excludes already seen articles, and returns up to 8 candidates.
     */
    async fetchAiStories(): Promise<HackerNewsStory[]> {
        try {
            logger.info("Fetching top stories from Hacker News...");

            // 1. Fetch top 30 story IDs
            const topIdsResponse = await fetch(this.HN_TOP_STORIES_URL);
            if (!topIdsResponse.ok) {
                throw new Error(`Failed to fetch HN top stories: ${topIdsResponse.statusText}`);
            }

            const allTopIds = await topIdsResponse.json() as number[];
            const top30Ids = allTopIds.slice(0, 30);

            // 2. Fetch details for each story (in parallel, but handle individually)
            const storyPromises = top30Ids.map(id => this.fetchStoryDetails(id));
            const stories = (await Promise.all(storyPromises)).filter((s): s is HackerNewsStory => s !== null);

            // 3. Filter and select candidates
            const candidates: HackerNewsStory[] = [];

            for (const story of stories) {
                // Stop if we have enough candidates
                if (candidates.length >= 8) {
                    break;
                }

                // Skip if we've seen this URL before
                if (story.url && this.seenArticleUrls.has(story.url)) {
                    logger.debug(`Skipping seen article: ${story.url}`);
                    continue;
                }

                // Check if title contains AI keywords
                if (this.isStoryAiRelated(story.title)) {
                    candidates.push(story);
                }
            }

            logger.info(`Found ${candidates.length} new AI-related stories from top 30 HN items`);
            return candidates;

        } catch (error) {
            logger.error("Failed to fetch AI stories from Hacker News", {
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }

    /**
     * Marks a list of stories as seen and adds them to the cache.
     * Maintains the max cache size to prevent memory leaks.
     */
    markStoriesAsSeen(stories: HackerNewsStory[]): void {
        const urlsToAdd = stories.filter(s => s.url).map(s => s.url);

        if (urlsToAdd.length === 0) {
            return;
        }

        // Add new URLs
        urlsToAdd.forEach(url => this.seenArticleUrls.add(url));

        // Trim cache if it exceeds max size
        if (this.seenArticleUrls.size > this.MAX_CACHE_SIZE) {
            // Convert to array, keep only the most recent ones (the ones added last), convert back to Set
            // Note: Sets iterate in insertion order
            const urlsArray = Array.from(this.seenArticleUrls);
            const itemsToRemove = urlsArray.length - this.MAX_CACHE_SIZE;

            // Create new set with only the most recent MAX_CACHE_SIZE items
            this.seenArticleUrls = new Set(urlsArray.slice(itemsToRemove));

            logger.debug(`Trimmed seen articles cache by ${itemsToRemove} items. New size: ${this.seenArticleUrls.size}`);
        }
    }

    /**
     * Fetches details for a specific HN story ID
     */
    private async fetchStoryDetails(id: number): Promise<HackerNewsStory | null> {
        try {
            const response = await fetch(`${this.HN_ITEM_URL_BASE}${id}.json`);
            if (!response.ok) {
                return null;
            }

            const item = await response.json();

            // Only include valid stories with URLs
            if (item && item.type === "story" && item.title && item.url) {
                return {
                    id: item.id,
                    title: item.title,
                    url: item.url
                };
            }

            return null;
        } catch (error) {
            logger.debug(`Failed to fetch HN details for item ${id}`);
            return null;
        }
    }

    /**
     * Checks if a story title contains any AI-related keywords using word boundaries
     */
    private isStoryAiRelated(title: string): boolean {
        const lowerTitle = title.toLowerCase();

        return this.AI_KEYWORDS.some(keyword => {
            // Use word boundaries for short acronyms like AI, LLM, GPT
            if (keyword.length <= 4) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                return regex.test(lowerTitle);
            }

            // Simple includes for longer keywords
            return lowerTitle.includes(keyword.toLowerCase());
        });
    }
}

export const newsService = new NewsService();
