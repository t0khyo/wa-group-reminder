import OpenAI from "openai";
import logger from "../utils/logger.js";
import dotenv from "dotenv";
dotenv.config();

export class AiService {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateReply(text) {
    logger.info(`AI processing text: "${text}"`);

    const prompt = `
You are a helpful WhatsApp bot. Reply in a friendly short way. if you don't know the answer, say "I can't help with that."

User said: "${text}"
    `;

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a friendly, helpful WhatsApp assistant bot. Your job is to reply politely and concisely whenever someone mentions you in a chat. Keep your replies short, human- like, and easy to read. If the message is unclear, ask a clarifying question. If you cannot answer or perform an action, simply reply: "Sorry, I can\'t help with that." . If the user writes in Arabic, reply in Arabic; otherwise, reply in English. Do not send long paragraphs; keep it under 3 sentences.',
          },
          { role: "user", content: prompt },
        ],
      });

      const reply = completion.choices[0].message.content;
      logger.info(`AI reply generated: ${reply}`);
      return reply;
    } catch (err) {
      logger.error("AI Error: " + err.message);
      return "Sorry, I couldn't process that right now.";
    }
  }
}
