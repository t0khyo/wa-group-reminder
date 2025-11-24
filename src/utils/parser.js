import * as chrono from "chrono-node";

class MessageParser {
  /**
   * Parse structured message format:
   * @bot
   * Meeting title
   * Date time
   */
  static parseStructuredFormat(text) {
    const cleaned = text.replace(/@\w+/g, "").trim();
    const lines = cleaned.split("\n").filter((line) => line.trim() !== "");

    if (lines.length < 2) {
      return {
        success: false,
        error: "Invalid format. Use:\n@bot\nTitle\nDate time",
      };
    }

    const title = lines[0].trim();
    const dateTimeText = lines.slice(1).join(" ").trim();

    const parsedDates = chrono.parse(dateTimeText);

    if (parsedDates.length === 0) {
      return {
        success: false,
        error: "Could not parse date/time. Try:\n- tomorrow 3pm\n- Monday 9am",
      };
    }

    const meetingTime = parsedDates[0].start.date();

    if (meetingTime <= new Date()) {
      return {
        success: false,
        error: "Time is in the past!",
      };
    }

    return {
      success: true,
      title,
      meetingTime,
      dateTimeText,
    };
  }

  /**
   * Parse simple single-line format:
   * @bot Meeting title tomorrow 3pm
   */
  static parseSimpleFormat(text) {
    const cleaned = text.replace(/@\w+/g, "").trim();
    const parsedDates = chrono.parse(cleaned);

    if (parsedDates.length === 0) {
      return {
        success: false,
        error: "Could not find date/time in message.",
      };
    }

    const meetingTime = parsedDates[0].start.date();

    if (meetingTime <= new Date()) {
      return {
        success: false,
        error: "Time is in the past!",
      };
    }

    const dateText = parsedDates[0].text;
    const title = cleaned.replace(dateText, "").trim() || "Meeting";

    return {
      success: true,
      title,
      meetingTime,
      dateTimeText: dateText,
    };
  }

  /**
   * Smart parser - tries both formats
   */
  static parse(text) {
    const lines = text.split("\n").filter((l) => l.trim() !== "");

    if (lines.length >= 2) {
      const structured = this.parseStructuredFormat(text);
      if (structured.success) return structured;
    }

    return this.parseSimpleFormat(text);
  }

  /**
   * Extract text from WhatsApp message
   */
  static getMessageText(message) {
    return message.conversation || message.extendedTextMessage?.text || "";
  }

  /**
   * Check if bot is mentioned
   */
  static isBotMentioned(message, botId) {
    const mentionedJids =
      message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const botNumber = botId?.split(":")[0]?.split("@")[0];
    console.log("Bot number:", botNumber);
    console.log("Bot ID:", botId);
    console.log("Mentioned JIDs:", mentionedJids);
    console.log(
      "isBotMentioned: ",
      mentionedJids.some((jid) => jid.includes("100897539518569@lid"))
    );
    console.log("message:", message);
    return mentionedJids.some((jid) => jid.includes("100897539518569@lid"));
  }

  /**
   * Format date for display
   */
  static formatDateTime(date) {
    return date.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export default MessageParser;
