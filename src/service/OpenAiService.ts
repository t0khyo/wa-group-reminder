import OpenAI from "openai";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
import { AbstractAiService, RequestContext } from "./AbstractAiService.js";
import { availableFunctions } from "./AiTools.js";
import { SYSTEM_PROMPT } from "./AiPrompts.js";
import { TTLMap } from "../utils/TTLMap.js";

dotenv.config();

const AI_MODEL = process.env.AI_MODEL || "gpt-5-nano"; 
// Note: gpt-5-nano is likely a placeholder or custom model name used by the user.

export class OpenAiService extends AbstractAiService {
  private client: OpenAI;
  private previousResponseIds: TTLMap<string, string>; // TTL-based map for auto-expiring response IDs

  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not defined in .env");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Initialize with 10-minute TTL
    this.previousResponseIds = new TTLMap<string, string>(10 * 60 * 1000);
  }

  public async generateReply(
    text: string,
    userId: string,
    senderId?: string,
    mentionedJids?: string[],
    rawText?: string
  ): Promise<{ text: string; mentions?: string[] }> {
    text = this.cleanTextMessage(text);
    logger.info(`AI processing text from user ${userId}: "${text}"`);

    // Create request context
    const ctx: RequestContext = {
      chatId: userId,
      senderId: senderId || "system",
      mentionedJids: mentionedJids || [],
      rawText: rawText || text,
    };

    try {
      const previousResponseId = this.previousResponseIds.get(userId);

      // Using 'any' to bypass potential type mismatch if using a custom/beta SDK method
      // that the referenced 'openai' package supports but our types might not.
      // Based on original AiService.ts implementation.
      let response: any = await (this.client as any).responses.create({
        model: AI_MODEL,
        instructions: SYSTEM_PROMPT,
        input: text,
        tools: availableFunctions,
        store: true,
        previous_response_id: previousResponseId,
      });

      let needsFollowUp = false;
      const functionOutputs: any[] = [];
      const collectedMentions: Set<string> = new Set();

      for (const item of response.output) {
        if (item.type === "function_call") {
          needsFollowUp = true;
          const functionName = item.name;
          const functionArgs = JSON.parse(item.arguments);

          logger.info(`AI requested function call: ${functionName}`, functionArgs);

          const functionHandler = this.functionHandlers.get(functionName);
          let functionResponse: string;

          if (functionHandler) {
            // Pass context instead of just chatId
            functionResponse = await functionHandler(functionArgs, ctx);
          } else {
            functionResponse = JSON.stringify({
              success: false,
              error: `Unknown function: ${functionName}`,
            });
          }

          this.extractMentions(functionResponse, collectedMentions);

          functionOutputs.push({
            type: "function_call_output",
            call_id: item.call_id,
            output: functionResponse,
          });

          logger.info(`Function ${functionName} response: ${functionResponse}`);
        }
      }

      if (needsFollowUp) {
        response = await (this.client as any).responses.create({
          model: AI_MODEL,
          instructions: SYSTEM_PROMPT,
          input: functionOutputs,
          previous_response_id: response.id,
          tools: availableFunctions,
          store: true,
        });
      }

      this.previousResponseIds.set(userId, response.id);
      const reply = response.output_text || "Sorry, I couldn't generate a reply.";
      const mentions = collectedMentions.size > 0 ? Array.from(collectedMentions) : undefined;

      if (mentions && mentions.length > 0) {
        logger.info(`Including ${mentions.length} mention(s) in AI response: ${mentions.join(", ")}`);
      }

      return { text: reply, mentions };
    } catch (err: any) {
      logger.error("AI Error: " + (err?.message || err));
      logger.error("Full error:", err);
      return { text: "Sorry, I couldn't process that right now." };
    }
  }

  public clearHistory(userId: string): void {
    this.previousResponseIds.delete(userId);
    logger.info(`Cleared conversation history for user ${userId}`);
  }

  public clearAllHistories(): void {
    this.previousResponseIds.clear();
    logger.info("Cleared all conversation histories");
  }
}
