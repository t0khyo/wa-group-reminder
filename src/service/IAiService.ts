export interface IAiService {
    generateReply(
      text: string,
      userId: string,
      senderId?: string,
      mentionedJids?: string[],
      rawText?: string
    ): Promise<{ text: string; mentions?: string[] }>;
  
    clearHistory(userId: string): void;
    clearAllHistories(): void;
  }
  
