import { AiService } from "./AiService.js";
import logger from "../utils/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
     * Generates a summarized digest from a list of candidate articles.
     * @param articles List of candidate articles
     * @returns Formatted WhatsApp markdown string or null if generation fails
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
}

export const newsDigestService = new NewsDigestService();
