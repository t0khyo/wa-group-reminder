import OpenAI from "openai";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
import { AbstractAiService } from "./AbstractAiService.js";
import { availableFunctions } from "./AiTools.js";
import { SYSTEM_PROMPT } from "./AiPrompts.js";

dotenv.config();

const AI_MODEL = process.env.AI_MODEL || "gpt-5-nano"; 
// Note: gpt-5-nano is likely a placeholder or custom model name used by the user.

export class OpenAiService extends AbstractAiService {
  private client: OpenAI;
  private previousResponseIds: Map<string, string> = new Map();

  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not defined in .env");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    if (senderId) this.senderIds.set(userId, senderId);
    if (mentionedJids && mentionedJids.length > 0)
      this.mentionedJids.set(userId, mentionedJids);
    if (rawText) this.rawTexts.set(userId, rawText);

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
            functionResponse = await functionHandler(functionArgs, userId);
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

      // Cleanup @lid placeholder if it exists (from original code)
      // text.replace("@lid", ""); // Original code had this call on the input text but ignored return value? 
      // Actually original code was: text.replace("@lid", ""); which does nothing to 'text' as strings are immutable.
      // And it was at the end of the method. I will ignore it or enable it if it was meant to be on 'reply'.
      // The original code:
      // text.replace("@lid", "");
      // return { text: reply, mentions };
      // It seemingly did nothing.

      return { text: reply, mentions };
    } catch (err: any) {
      logger.error("AI Error: " + (err?.message || err));
      logger.error("Full error:", err);
      // Fallback? Original code returned simple error message.
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

  private extractMentions(functionResponse: string, collectedMentions: Set<string>) {
      try {
        const responseData = JSON.parse(functionResponse);
        if (responseData.success) {
            if (responseData.details?.assigned_to && Array.isArray(responseData.details.assigned_to)) {
                responseData.details.assigned_to.forEach((jid: string) => { if (jid) collectedMentions.add(jid); });
            }
            if (responseData.details?.mentions && Array.isArray(responseData.details.mentions)) {
                responseData.details.mentions.forEach((jid: string) => { if (jid) collectedMentions.add(jid); });
            }
            if (responseData.tasks && Array.isArray(responseData.tasks)) {
                responseData.tasks.forEach((task: any) => {
                    if (task.assigned_to && Array.isArray(task.assigned_to)) {
                        task.assigned_to.forEach((jid: string) => { if (jid) collectedMentions.add(jid); });
                    }
                });
            }
            if (responseData.reminders && Array.isArray(responseData.reminders)) {
                responseData.reminders.forEach((reminder: any) => {
                    if (reminder.mentions && Array.isArray(reminder.mentions)) {
                        reminder.mentions.forEach((jid: string) => { if (jid) collectedMentions.add(jid); });
                    }
                });
            }
        }
      } catch (e) {
          logger.debug("Could not parse function response for mentions", e);
      }
  }
}
