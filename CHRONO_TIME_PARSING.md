# ⏰ Chrono-Node Time Parsing

## Overview

The reminder service now uses **[chrono-node](https://github.com/wanasit/chrono)**, a natural language date parser, instead of relying on GPT or manual regex parsing. This provides:

- ✅ **More reliable** parsing
- ✅ **Better accuracy** for natural language
- ✅ **Consistent** results
- ✅ **Offline** capability (no API calls needed)
- ✅ **Faster** response times

## Supported Time Formats

### Relative Times

```
"in 2 hours"           → 2 hours from now
"in 30 minutes"        → 30 minutes from now
"in 5 days"            → 5 days from now
"in 1 week"            → 7 days from now
"in an hour"           → 1 hour from now
"in half an hour"      → 30 minutes from now
```

### Tomorrow Variations

```
"tomorrow"             → Tomorrow at 12:00 PM (noon)
"tomorrow at 3pm"      → Tomorrow at 3:00 PM
"tomorrow at 9:30am"   → Tomorrow at 9:30 AM
"tomorrow morning"     → Tomorrow at 9:00 AM
"tomorrow afternoon"   → Tomorrow at 2:00 PM
"tomorrow evening"     → Tomorrow at 6:00 PM
```

### Specific Dates

```
"Dec 15 at 2pm"        → December 15 at 2:00 PM
"December 25th at 10:30am" → December 25 at 10:30 AM
"next Monday at 9am"   → Next Monday at 9:00 AM
"next Friday afternoon" → Next Friday at 2:00 PM
```

### Day of Week

```
"Monday at 10am"       → Next Monday at 10:00 AM
"this Friday at 5pm"   → This Friday at 5:00 PM
"next Tuesday at 2:30pm" → Next Tuesday at 2:30 PM
```

### Time Today

```
"at 5pm"               → Today at 5:00 PM
"3:30pm"               → Today at 3:30 PM
"9am"                  → Today at 9:00 AM
```

### Complex Expressions

```
"two days from now at 3pm"      → 2 days from now at 3:00 PM
"the day after tomorrow at noon" → Day after tomorrow at 12:00 PM
"in 3 hours and 30 minutes"     → 3.5 hours from now
```

### ISO Format (Still Supported)

```
"2024-12-15T14:30:00Z" → December 15, 2024 at 2:30 PM UTC
```

## How It Works

### 1. **ISO Format First**

If the string contains a `T` (indicating ISO 8601), it's parsed directly:

```typescript
const isoDate = new Date(dateTimeString);
if (!isNaN(isoDate.getTime()) && dateTimeString.includes("T")) {
  return isoDate;
}
```

### 2. **Chrono-Node Parsing**

Natural language strings are passed to chrono:

```typescript
const parsed = chrono.parseDate(dateTimeString, now, { forwardDate: true });
```

The `forwardDate: true` option ensures times are in the future.

### 3. **Fallback Regex**

If chrono fails, a simple regex fallback handles "in X hours/minutes/days":

```typescript
const inMatch = lowerStr.match(/in (\d+) (hour|minute|day|week)s?/);
```

### 4. **Default**

If all parsing fails, defaults to 1 hour from now with a warning.

## Examples in Action

### User Input → Parsed Result

```typescript
// User: "remind me to call mom tomorrow at 3pm"
reminderService.parseDateTime("tomorrow at 3pm");
// → Wed Dec 04, 2025 at 3:00 PM

// User: "set reminder in 2 hours"
reminderService.parseDateTime("in 2 hours");
// → Today at 4:30 PM (if current time is 2:30 PM)

// User: "remind me next Monday morning"
reminderService.parseDateTime("next Monday morning");
// → Mon Dec 09, 2025 at 9:00 AM

// User: "December 25th at midnight"
reminderService.parseDateTime("December 25th at midnight");
// → Thu Dec 25, 2025 at 12:00 AM
```

## Integration with AI

The AI service description now reflects chrono-node's capabilities:

```typescript
datetime: {
  type: "string",
  description:
    "When to send the reminder. Supports natural language like: " +
    "'in 2 hours', 'tomorrow at 3pm', 'next Monday at 10am', " +
    "'Dec 15 at 2:30pm', or ISO format '2024-12-15T14:30:00Z'. " +
    "Use the exact time expression from the user's message.",
}
```

This tells GPT to:

- ✅ **Pass through** the user's time expression as-is
- ✅ **Don't convert** to ISO format
- ✅ **Trust** chrono-node to parse it

## Testing

Run the chrono parsing test:

```bash
npx tsx src/examples/test-chrono-parsing.ts
```

This will show you how various time expressions are parsed.

## Logging

The service logs all parsing attempts:

```
INFO: Chrono parsed "tomorrow at 3pm" as Wed Dec 04 2025 15:00:00
INFO: Fallback parsed "in 2 hours" as Tue Dec 03 2025 16:30:00
WARN: Could not parse datetime: "invalid time", defaulting to +1 hour
```

## Benefits Over GPT Parsing

| Feature       | GPT Parsing   | Chrono-Node |
| ------------- | ------------- | ----------- |
| Reliability   | Variable      | Consistent  |
| Speed         | 1-3 seconds   | <1ms        |
| Offline       | ❌ No         | ✅ Yes      |
| Cost          | API calls     | Free        |
| Deterministic | ❌ No         | ✅ Yes      |
| Edge Cases    | Unpredictable | Well-tested |

## Advanced Usage

### Custom Reference Time

```typescript
const referenceTime = new Date("2025-12-10T14:00:00");
const parsed = chrono.parseDate("tomorrow at 3pm", referenceTime);
// → Dec 11, 2025 at 3:00 PM
```

### Parse Multiple Dates

```typescript
import * as chrono from "chrono-node";

const results = chrono.parse("Meeting on Dec 15 and follow-up on Dec 20");
// Returns array with both dates
```

### Timezone Support

```typescript
const parsed = chrono.parseDate("tomorrow at 3pm EST");
// Chrono can handle timezone abbreviations
```

## Common Patterns

### User Says → Chrono Parses

```
"remind me later"          → +1 hour (default fallback)
"in the morning"           → Tomorrow at 9:00 AM
"this afternoon"           → Today at 2:00 PM
"tonight"                  → Today at 8:00 PM
"next week"                → 7 days from now at 12:00 PM
"in a couple hours"        → ~2 hours from now
"end of day"               → Today at 5:00 PM
"midnight"                 → Today at 12:00 AM
"noon"                     → Today at 12:00 PM
```

## Troubleshooting

### Issue: Time in the past

Chrono with `forwardDate: true` should always return future times, but check:

```typescript
const parsed = reminderService.parseDateTime("3pm");
if (parsed < new Date()) {
  // This shouldn't happen with forwardDate: true
  // But you can add validation in the handler
}
```

### Issue: Ambiguous times

```
"Monday" → Next Monday (if today is Monday, it means next Monday)
"3pm"    → Today at 3pm if it's before 3pm, otherwise tomorrow at 3pm
```

### Issue: Invalid input

The fallback ensures you always get a valid Date:

```typescript
reminderService.parseDateTime("asdfgh");
// → 1 hour from now (with warning logged)
```

## Migration Notes

### Before (Manual Parsing)

```typescript
// Lots of regex and manual date manipulation
// Limited to predefined patterns
// Easy to miss edge cases
```

### After (Chrono-Node)

```typescript
// One line: chrono.parseDate()
// Handles 100+ natural language patterns
// Battle-tested library
```

## Configuration

No configuration needed! Chrono-node works out of the box with sensible defaults:

- `forwardDate: true` → Always return future dates
- Default locale: English
- Default timezone: System timezone

## Resources

- [Chrono GitHub](https://github.com/wanasit/chrono)
- [Chrono Docs](https://github.com/wanasit/chrono#readme)
- [NPM Package](https://www.npmjs.com/package/chrono-node)

---

✅ **Your reminder bot now has production-grade time parsing without relying on GPT!**
