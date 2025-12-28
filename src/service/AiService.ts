import { IAiService } from "./IAiService.js";
import { OpenAiService } from "./OpenAiService.js";
import { GeminiAiService } from "./GeminiAiService.js";
import dotenv from "dotenv";

dotenv.config();

const AI_PROVIDER = process.env.AI_PROVIDER || "openai";

export class AiService implements IAiService {
  private service: IAiService;

  constructor() {
    if (AI_PROVIDER.toLowerCase() === "gemini") {
      this.service = new GeminiAiService();
    } else {
      this.service = new OpenAiService();
    }
  }

  public async generateReply(
    text: string,
    userId: string,
    senderId?: string,
    mentionedJids?: string[],
    rawText?: string
  ): Promise<{ text: string; mentions?: string[] }> {
    return this.service.generateReply(
      text,
      userId,
      senderId,
      mentionedJids,
      rawText
    );
  }

  public clearHistory(userId: string): void {
    this.service.clearHistory(userId);
  }

  public clearAllHistories(): void {
    this.service.clearAllHistories();
  }
}
