import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
import { AbstractAiService } from "./AbstractAiService.js";
import { availableFunctions } from "./AiTools.js";
import { SYSTEM_PROMPT } from "./AiPrompts.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export class GeminiAiService extends AbstractAiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private chatSessions: Map<string, any> = new Map(); // userId -> ChatSession

  constructor() {
    super();
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not defined in .env");
    }
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
    // transform OpenAI tools to Gemini tools
    const excludeAdditionalProperties = (obj: any): any => {
      if (typeof obj !== "object" || obj === null) return obj;
      
      const newObj: any = Array.isArray(obj) ? [] : {};
      
      for (const key in obj) {
        if (key === "additionalProperties") continue;
        newObj[key] = excludeAdditionalProperties(obj[key]);
      }
      return newObj;
    };

    const geminiTools = [{
      functionDeclarations: availableFunctions.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: excludeAdditionalProperties(tool.parameters),
      }))
    }];

    this.model = this.genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      tools: geminiTools,
    });
  }

  public async generateReply(
    text: string,
    userId: string,
    senderId?: string,
    mentionedJids?: string[],
    rawText?: string
  ): Promise<{ text: string; mentions?: string[] }> {
    text = this.cleanTextMessage(text);
    logger.info(`Gemini processing text from user ${userId}: "${text}"`);

    if (senderId) this.senderIds.set(userId, senderId);
    if (mentionedJids) this.mentionedJids.set(userId, mentionedJids);
    if (rawText) this.rawTexts.set(userId, rawText);

    try {
      let chat = this.chatSessions.get(userId);
      if (!chat) {
        chat = this.model.startChat({
          history: [],
        });
        this.chatSessions.set(userId, chat);
      }

      const result = await chat.sendMessage(text);
      let response = result.response;
      let functionCalls = response.functionCalls();

      const collectedMentions: Set<string> = new Set();

      // Handle function calls loop (Gemini might return multiple calls, or require turn-taking)
      // The SDK helper `sendMessage` handles simple text, but for tools we might need to loop if we want to auto-execute.
      // However, startChat supports auto-function-calling if we implement it, OR we manually handle it.
      // Standard Gemini SDK flow: receive user message -> model returns function call -> we execute -> send function response -> model returns text.
      
      while (functionCalls && functionCalls.length > 0) {
        const functionResponses: Part[] = [];

        for (const call of functionCalls) {
          const functionName = call.name;
          const functionArgs = call.args;

          logger.info(`Gemini requested function call: ${functionName}`, functionArgs);

          const functionHandler = this.functionHandlers.get(functionName);
          let functionResponseString: string;

          if (functionHandler) {
             // arguments from Gemini are objects, checking compatibility
            functionResponseString = await functionHandler(functionArgs, userId);
          } else {
            functionResponseString = JSON.stringify({
              success: false,
              error: `Unknown function: ${functionName}`,
            });
          }

          this.extractMentions(functionResponseString, collectedMentions);

          // Construct the response part
          // Gemini expects JSON object for response, or primitive.
          // functionResponseString is a JSON string. We should parse it back to object if possible or send as object.
          // The SDK expects: { functionResponse: { name: ..., response: ... } }
          
          let responseObj;
          try {
              responseObj = JSON.parse(functionResponseString);
          } catch {
              responseObj = { result: functionResponseString };
          }
          
          functionResponses.push({
            functionResponse: {
              name: functionName,
              response: responseObj,
            }
          });
          
          logger.info(`Function ${functionName} response sent to Gemini.`);
        }

        // Send function responses back to the model
        // We use sendMessage with the array of functionResponses
        const nextResult = await chat.sendMessage(functionResponses);
        response = nextResult.response;
        functionCalls = response.functionCalls();
      }

      const reply = response.text();
      const mentions = collectedMentions.size > 0 ? Array.from(collectedMentions) : undefined;

      if (mentions && mentions.length > 0) {
        logger.info(`Including ${mentions.length} mention(s) in Gemini response: ${mentions.join(", ")}`);
      }

      return { text: reply, mentions };
    } catch (err: any) {
      logger.error("Gemini Error: " + (err?.message || err));
      logger.error("Full error:", err);
      return { text: "Sorry, I couldn't process that right now." };
    }
  }

  public clearHistory(userId: string): void {
    this.chatSessions.delete(userId);
    logger.info(`Cleared conversation history for user ${userId}`);
  }

  public clearAllHistories(): void {
    this.chatSessions.clear();
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
