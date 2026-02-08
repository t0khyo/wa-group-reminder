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

  // Validate timezone is valid first
  try {
    DateTime.local({ zone: timezone });
  } catch {
    throw new DateParseError(`Invalid timezone: ${timezone}`, dateTimeString);
  }

  const now = new Date();
  let parsedDate: Date | null = null;

  // Try chrono-node first (handles most natural language dates)
  // NOTE: chrono-node doesn't support timezones - it always parses in system timezone
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

  // CRITICAL FIX: chrono parses in system timezone, but we want Kuwait timezone
  // Solution: Extract the date/time components and recreate in target timezone
  
  // Get the parsed date components (these represent the user's intended local time)
  const parsedDt = DateTime.fromJSDate(parsedDate);
  
  // Recreate the same local time components in the TARGET timezone
  // E.g., if user said "7pm" and chrono parsed as "7pm system time",
  // we want "7pm Kuwait time" instead
  const dtInTargetTz = DateTime.fromObject({
    year: parsedDt.year,
    month: parsedDt.month,
    day: parsedDt.day,
    hour: parsedDt.hour,
    minute: parsedDt.minute,
    second: parsedDt.second,
  }, { zone: timezone });

  // Validate date is in the future (with 1 minute buffer for processing time)
  const nowInTargetTz = DateTime.now().setZone(timezone);
  const oneMinuteFromNow = nowInTargetTz.plus({ minutes: 1 });
  
  if (dtInTargetTz < oneMinuteFromNow) {
    throw new DateParseError(
      `Date must be in the future. Parsed: ${dtInTargetTz.toLocaleString(DateTime.DATETIME_FULL)}`,
      dateTimeString
    );
  }

  return {
    utc: dtInTargetTz.toUTC().toJSDate(),
    localIso: dtInTargetTz.toISO() || dtInTargetTz.toString(),
    timezone,
  };
}
