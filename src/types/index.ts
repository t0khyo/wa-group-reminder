import { proto } from "@whiskeysockets/baileys";

export interface MessageContent {
  text?: string;
  [key: string]: any;
}

export interface BotIdentity {
  jid: string | null;
  lid: string | null;
  name: string;
  phoneNumber?: string;
}

export interface MessageContext {
  chatId: string;
  senderId: string;
  isGroup: boolean;
  text: string;
  rawText: string;
  quotedMessage?: proto.IMessage;
  mentionedJids: string[];
}
