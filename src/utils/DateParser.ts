import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { DEFAULT_TIMEZONE } from "../config/TimeZone.js";

export interface ParsedDate {
  utc: Date;
  localIso: string;
  timezone: string;
}

export class DateParseError extends Error {
  constructor(message: string, public input: string) {
    super(message);
    this.name = "DateParseError";
  }
}

/**
 * Parse natural language date/time string
 * @param dateTimeString - Natural language time like "tomorrow at 3pm", "in 2 hours"
 * @param timezone - Timezone to use (defaults to DEFAULT_TIMEZONE)
 * @returns ParsedDate with UTC date and local ISO string
 * @throws DateParseError if parsing fails or date is in the past
 */
export function parseDateTime(
  dateTimeString: string,
  timezone: string = DEFAULT_TIMEZONE
): ParsedDate {
  if (!dateTimeString || typeof dateTimeString !== "string") {
    throw new DateParseError(
      "Invalid input: must be a non-empty string",
      dateTimeString
    );
  }

  const now = new Date();
  let parsedDate: Date | null = null;

  // Try chrono-node first (handles most natural language dates)
  // This includes: "in 2 hours", "tomorrow at 3pm", "next Monday", etc.
  parsedDate = chrono.parseDate(dateTimeString, now, { forwardDate: true });

  // Fallback: Try ISO string parsing
  if (!parsedDate) {
    const isoDate = new Date(dateTimeString);
    if (!isNaN(isoDate.getTime())) {
      parsedDate = isoDate;
    }
  }

  // If still no date, throw error
  if (!parsedDate) {
    throw new DateParseError(
      `Unable to parse date from: "${dateTimeString}". Try formats like "tomorrow at 3pm" or "in 2 hours"`,
      dateTimeString
    );
  }

  // Validate date is in the future (with 1 minute buffer for processing time)
  const oneMinuteFromNow = new Date(now.getTime() + 60000);
  if (parsedDate < oneMinuteFromNow) {
    throw new DateParseError(
      `Date must be in the future. Parsed: ${parsedDate.toLocaleString()}`,
      dateTimeString
    );
  }

  // Validate timezone is valid
  try {
    DateTime.local({ zone: timezone });
  } catch {
    throw new DateParseError(`Invalid timezone: ${timezone}`, dateTimeString);
  }

  // Convert to Luxon DateTime in specified timezone
  const dtLocal = DateTime.fromJSDate(parsedDate, { zone: timezone });

  return {
    utc: dtLocal.toUTC().toJSDate(),
    localIso: dtLocal.toISO() || dtLocal.toString(),
    timezone,
  };
}
