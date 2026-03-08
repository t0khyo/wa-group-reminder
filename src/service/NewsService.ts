import logger from "../utils/logger.js";
import * as cheerio from "cheerio";

export interface HackerNewsStory {
    id: number;
    title: string;
    url: string;
    score: number;
    descendants: number; // comment count
}

export interface EnrichedArticle {
    id: number;
    title: string;
    url: string;
    score: number;
    descendants: number;
    body: string;
    source: "article" | "hn_comments";
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
     * excludes already seen articles (unless skipCache is true), and returns up to 8 candidates.
     */
    async fetchAiStories(skipCache: boolean = false): Promise<HackerNewsStory[]> {
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

                // Skip if we've seen this URL before (and we're not bypassing the cache)
                if (!skipCache && story.url && this.seenArticleUrls.has(story.url)) {
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
            const urlsArray = Array.from(this.seenArticleUrls);
            const itemsToRemove = urlsArray.length - this.MAX_CACHE_SIZE;
            this.seenArticleUrls = new Set(urlsArray.slice(itemsToRemove));
            logger.debug(`Trimmed seen articles cache by ${itemsToRemove} items. New size: ${this.seenArticleUrls.size}`);
        }
    }

    /**
     * Enriches selected articles by fetching their full content.
     * Falls back to HN comments if article body is paywalled or too short.
     * Drops articles where both fetch and comment fallback fail, promoting next candidate.
     */
    async enrichArticles(stories: HackerNewsStory[], maxArticles: number = 5): Promise<EnrichedArticle[]> {
        const enriched: EnrichedArticle[] = [];

        // Process in parallel
        const results = await Promise.allSettled(
            stories.map(story => this.enrichSingleArticle(story))
        );

        for (const result of results) {
            if (enriched.length >= maxArticles) break;
            if (result.status === "fulfilled" && result.value !== null) {
                enriched.push(result.value);
            }
        }

        logger.info(`Successfully enriched ${enriched.length}/${stories.length} articles`);
        return enriched;
    }

    /**
     * Enriches a single article with content
     */
    private async enrichSingleArticle(story: HackerNewsStory): Promise<EnrichedArticle | null> {
        try {
            // Try fetching article HTML
            const body = await this.fetchArticleBody(story.url);

            if (body && body.length >= 200) {
                return {
                    ...story,
                    body,
                    source: "article"
                };
            }

            // Paywall fallback: fetch HN comments
            logger.info(`Article body too short for "${story.title}", falling back to HN comments`);
            const commentsBody = await this.fetchHnComments(story.id, 5);

            if (commentsBody && commentsBody.length > 0) {
                return {
                    ...story,
                    body: commentsBody,
                    source: "hn_comments"
                };
            }

            logger.warn(`Both article fetch and HN comments failed for "${story.title}". Dropping.`);
            return null;
        } catch (error) {
            logger.error(`Failed to enrich article "${story.title}":`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Fetches article HTML and strips to plain text using cheerio
     */
    private async fetchArticleBody(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
                    "Accept": "text/html"
                },
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            if (!response.ok) return null;

            const html = await response.text();
            const $ = cheerio.load(html);

            // Remove scripts, styles, nav, footer, and other non-content elements
            $("script, style, nav, footer, header, aside, iframe, noscript, .ad, .advertisement").remove();

            // Try to find main content areas first
            let text = "";
            const contentSelectors = ["article", "main", "[role='main']", ".post-content", ".article-body", ".entry-content"];
            for (const selector of contentSelectors) {
                const content = $(selector).text();
                if (content && content.trim().length > 200) {
                    text = content;
                    break;
                }
            }

            // Fall back to body text
            if (!text || text.trim().length < 200) {
                text = $("body").text();
            }

            // Clean up whitespace
            text = text.replace(/\s+/g, " ").trim();

            // Truncate to ~3000 chars to keep Gemini context reasonable
            if (text.length > 3000) {
                text = text.substring(0, 3000) + "...";
            }

            return text;
        } catch (error) {
            logger.debug(`Failed to fetch article body from ${url}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Fetches top N HN comments for a story as fallback body text
     */
    private async fetchHnComments(storyId: number, limit: number): Promise<string | null> {
        try {
            const response = await fetch(`${this.HN_ITEM_URL_BASE}${storyId}.json`);
            if (!response.ok) return null;

            const item = await response.json();
            const commentIds: number[] = item.kids?.slice(0, limit) || [];

            if (commentIds.length === 0) return null;

            const commentPromises = commentIds.map(async (id) => {
                try {
                    const res = await fetch(`${this.HN_ITEM_URL_BASE}${id}.json`);
                    if (!res.ok) return null;
                    const comment = await res.json();
                    if (!comment || comment.deleted || comment.dead || !comment.text) return null;
                    // Strip HTML from HN comment text
                    const $ = cheerio.load(`<div>${comment.text}</div>`);
                    return $("div").text().trim();
                } catch {
                    return null;
                }
            });

            const comments = (await Promise.all(commentPromises)).filter((c): c is string => c !== null);

            if (comments.length === 0) return null;

            return comments.join("\n\n---\n\n");
        } catch (error) {
            logger.debug(`Failed to fetch HN comments for story ${storyId}`);
            return null;
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
                    url: item.url,
                    score: item.score || 0,
                    descendants: item.descendants || 0
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
