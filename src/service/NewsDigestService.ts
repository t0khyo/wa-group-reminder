import logger from "../utils/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EnrichedArticle } from "./NewsService.js";

export interface PodcastSegment {
    speaker: "ALEX" | "SAM";
    text: string;
}

export interface DigestResult {
    digest: string;
    podcastScript: string | null;
    segments: PodcastSegment[];
}

// Word count targets by number of stories
const WORD_COUNT_TARGETS: Record<number, { min: number; max: number; target: number }> = {
    2: { min: 280, max: 350, target: 315 },
    3: { min: 420, max: 490, target: 560 },
    4: { min: 490, max: 630, target: 560 },
    5: { min: 560, max: 700, target: 630 },
};

export class NewsDigestService {
    private genAI: GoogleGenerativeAI | null = null;
    private modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        } else {
            logger.warn("GEMINI_API_KEY not found in environment variables. NewsDigestService will not work.");
        }
    }

    /**
     * Generates a text digest only (legacy method, for backward compatibility).
     * Used when articles are NOT enriched.
     */
    async generateDigest(articles: { title: string; url: string; id: number }[]): Promise<string | null> {
        if (!this.genAI) {
            logger.error("Cannot generate digest: Gemini API is not initialized.");
            return null;
        }

        if (!articles || articles.length === 0) {
            return null;
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: this.modelName });

            const articlesJson = JSON.stringify(articles, null, 2);

            const prompt = `You are an expert AI news curator. Your job is to select the 3 to 5 most important and impactful AI-related stories from the following list of candidate articles, and write a concise, engaging daily digest for a WhatsApp group.

Here are the candidate articles:
${articlesJson}

Instructions:
1. Select the 3 to 5 most significant AI stories from the candidates. Prioritize major model releases, significant research breakthroughs, and major industry news.
2. For each selected story, provide the headline and a 2-3 sentence summary explaining what it is and why it matters.
3. Format the output specifically for WhatsApp markdown:
   - Use bold (*text*) for headlines and important terms.
   - Use italic (_text_) where appropriate for emphasis.
   - Include a daily date header at the top (e.g., *AI News — Monday, March 10*).
   - Use numbered emojis (1️⃣, 2️⃣, 3️⃣) for the list items.
   - Include the link to the story using the 🔗 emoji.
4. Finally, append a short, thought-provoking "Thought of the day" one-liner about AI at the very bottom, formatted like this:
   > 💡 Thought of the day: [Your thought here]

CRITICAL: Output ONLY the formatted WhatsApp message. Do not include any meta-text, markdown code block wrappers (like \`\`\`markdown), or conversational filler. Your entire response will be sent directly as a WhatsApp message.`;

            const result = await model.generateContent(prompt);
            const response = result.response;
            let text = response.text();

            // Clean up any markdown code block wrappers that Gemini might accidentally include
            text = text.replace(/^```(markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();

            return text;
        } catch (error) {
            logger.error("Failed to generate AI news digest with Gemini", {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Generates both a text digest AND a podcast script from enriched articles.
     * Both are generated in a single Gemini call to save tokens.
     */
    async generateDigestWithPodcast(articles: EnrichedArticle[]): Promise<DigestResult | null> {
        if (!this.genAI) {
            logger.error("Cannot generate digest: Gemini API is not initialized.");
            return null;
        }

        if (!articles || articles.length === 0) {
            return null;
        }

        const storyCount = Math.min(articles.length, 5);
        const wordTarget = WORD_COUNT_TARGETS[storyCount] || WORD_COUNT_TARGETS[3];

        try {
            const model = this.genAI.getGenerativeModel({ model: this.modelName });

            const articlesContext = articles.map(a => ({
                title: a.title,
                url: a.url,
                score: a.score,
                comments: a.descendants,
                content_source: a.source,
                body: a.body
            }));

            const articlesJson = JSON.stringify(articlesContext, null, 2);

            const prompt = this.buildCombinedPrompt(articlesJson, storyCount, wordTarget);

            const result = await model.generateContent(prompt);
            const response = result.response;
            let text = response.text();

            // Clean up code block wrappers
            text = text.replace(/^```(markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();

            // Parse the two sections
            const { digest, podcastScript } = this.parseCombinedOutput(text);

            if (!digest) {
                logger.error("Failed to parse digest from combined output");
                return null;
            }

            // Parse and validate the podcast script
            let segments: PodcastSegment[] = [];
            if (podcastScript) {
                segments = this.parseScript(podcastScript);
                const wordCount = this.countWords(podcastScript);

                logger.info(`Podcast script: ${wordCount} words, ${segments.length} segments (target: ${wordTarget.min}-${wordTarget.max})`);

                // Retry once if word count is outside valid range
                if (wordCount < wordTarget.min || wordCount > wordTarget.max) {
                    logger.info(`Script word count ${wordCount} outside range ${wordTarget.min}-${wordTarget.max}. Retrying...`);
                    const retried = await this.retryPodcastScript(model, podcastScript, wordCount, wordTarget, storyCount);
                    if (retried) {
                        segments = retried.segments;
                    }
                }
            }

            return { digest, podcastScript, segments };
        } catch (error) {
            logger.error("Failed to generate digest with podcast", {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Builds the combined prompt for text digest + podcast script
     */
    private buildCombinedPrompt(
        articlesJson: string,
        storyCount: number,
        wordTarget: { min: number; max: number; target: number }
    ): string {
        return `You are an expert AI news curator and podcast scriptwriter. You will produce TWO outputs from the following enriched articles.

Here are the articles with their full content:
${articlesJson}

NOTE: Articles with content_source "hn_comments" have content sourced from Hacker News discussion comments rather than the article itself. Adjust your confidence and phrasing accordingly.

===== OUTPUT 1: WHATSAPP TEXT DIGEST =====

Write a concise, engaging daily digest for a WhatsApp group:
1. Select and summarize all ${storyCount} stories.
2. For each, provide the headline and a 2-3 sentence summary grounded in the article content.
3. Format for WhatsApp markdown:
   - Use bold (*text*) for headlines and important terms.
   - Use italic (_text_) where appropriate.
   - Include a daily date header (e.g., *AI News — Saturday, March 8*).
   - Use numbered emojis (1️⃣, 2️⃣, 3️⃣) for list items.
   - Include 🔗 links to each story.
4. End with a thought-provoking one-liner:
   > 💡 Thought of the day: [Your thought here]

===== OUTPUT 2: PODCAST SCRIPT =====

Write a natural, conversational podcast script between two hosts: Alex and Sam.
- Format: strictly alternating ALEX: ... / SAM: ... lines
- Target: ${wordTarget.target} words (valid range: ${wordTarget.min}-${wordTarget.max})
- Open with a one-line welcome
- Cover all ${storyCount} stories with real context from the article content
- Close with a punchy takeaway line
- NO filler phrases: "Great question", "Absolutely", "That's so interesting"
- Keep the tone casual but informative — like two friends who are genuinely excited about AI news

===== FORMAT =====

Separate the two outputs with this exact delimiter on its own line:
---PODCAST_SCRIPT---

CRITICAL: Output ONLY the two sections. No meta-text, no markdown code block wrappers. The digest section comes FIRST, then the delimiter, then the podcast script.`;
    }

    /**
     * Parses the combined output into digest and podcast script sections
     */
    private parseCombinedOutput(text: string): { digest: string | null; podcastScript: string | null } {
        const delimiter = "---PODCAST_SCRIPT---";
        const delimiterIndex = text.indexOf(delimiter);

        if (delimiterIndex === -1) {
            // No podcast script found — treat entire output as digest
            logger.warn("No podcast script delimiter found in Gemini output. Using entire output as digest.");
            return { digest: text.trim(), podcastScript: null };
        }

        const digest = text.substring(0, delimiterIndex).trim();
        const podcastScript = text.substring(delimiterIndex + delimiter.length).trim();

        return {
            digest: digest || null,
            podcastScript: podcastScript || null
        };
    }

    /**
     * Parses a podcast script string into structured segments
     */
    parseScript(script: string): PodcastSegment[] {
        const segments: PodcastSegment[] = [];
        const lines = script.split("\n");

        for (const line of lines) {
            const trimmed = line.trim();

            const alexMatch = trimmed.match(/^ALEX:\s*(.+)/i);
            if (alexMatch) {
                segments.push({ speaker: "ALEX", text: alexMatch[1].trim() });
                continue;
            }

            const samMatch = trimmed.match(/^SAM:\s*(.+)/i);
            if (samMatch) {
                segments.push({ speaker: "SAM", text: samMatch[1].trim() });
                continue;
            }

            // Discard lines not matching the pattern
        }

        return segments;
    }

    /**
     * Counts words in a text string
     */
    private countWords(text: string): number {
        return text.split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Retries podcast script generation with corrective instruction
     */
    private async retryPodcastScript(
        model: any,
        originalScript: string,
        currentWordCount: number,
        wordTarget: { min: number; max: number; target: number },
        storyCount: number
    ): Promise<{ script: string; segments: PodcastSegment[] } | null> {
        try {
            const direction = currentWordCount < wordTarget.min ? "too_short" : "too_long";
            const instruction = direction === "too_short"
                ? `The script is too short (${currentWordCount} words). Expand each story with more context and discussion. Target: ${wordTarget.target} words.`
                : `The script is too long (${currentWordCount} words). Cut filler, be more concise. Target: ${wordTarget.target} words.`;

            const prompt = `Here is a podcast script that needs revision:

${originalScript}

REVISION NEEDED: ${instruction}

Rules:
- Keep the ALEX: / SAM: format strictly
- Cover all ${storyCount} stories
- Valid word range: ${wordTarget.min}-${wordTarget.max}
- NO filler phrases

Output ONLY the revised script. No explanation or meta-text.`;

            const result = await model.generateContent(prompt);
            let revised = result.response.text();
            revised = revised.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

            const segments = this.parseScript(revised);
            const newWordCount = this.countWords(revised);

            if (newWordCount < wordTarget.min || newWordCount > wordTarget.max) {
                logger.warn(`Retry also failed validation (${newWordCount} words). Using it anyway.`);
            } else {
                logger.info(`Retry succeeded: ${newWordCount} words (target: ${wordTarget.min}-${wordTarget.max})`);
            }

            return { script: revised, segments };
        } catch (error) {
            logger.error("Failed to retry podcast script:", {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }
}

export const newsDigestService = new NewsDigestService();
