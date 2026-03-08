# Feature Spec: Daily AI News Audio Podcast

**Feature:** Daily AI News Audio Digest  
**Status:** Planned  
**Stack:** Node.js · Gemini 2.5 Flash · Google Cloud TTS (Journey voices) · ffmpeg · WhatsApp  
**Depends on:** Daily AI News Digest (text feature)  
**Author:** —  
**Last Updated:** March 2026

---

## 1. Overview

Extend the daily AI news digest to also produce a **2–5 minute audio podcast** sent as a WhatsApp voice message. Gemini 2.5 Flash selects and reads the top 3–5 articles, writes a two-host conversational script, and Google Cloud TTS renders it using Journey voices. The group receives a text digest first, followed immediately by the voice message.

---

## 2. Goals

- Produce a natural-sounding, 2–5 minute daily audio summary of AI news
- Ground the podcast in actual article content, not just headlines
- Keep everything within the existing Google Cloud account — no new vendors
- Handle real-world failures gracefully (paywalls, fetch errors, short days)

---

## 3. Out of Scope

- User-selectable voices or languages
- Episode storage or podcast RSS feed
- Transcripts sent to the group
- Variable scheduling per user
- Audio longer than 5 minutes

---

## 4. User Stories

| # | As a… | I want to… | So that… |
|---|--------|------------|----------|
| 1 | Group member | Hear a podcast-style audio digest each morning | I can catch up on AI news while commuting or without reading |
| 2 | Group member | The hosts discuss actual article content | The audio feels informed, not generic |
| 3 | Group member | Audio is consistently 2–5 minutes | It never overstays its welcome |
| 4 | Group member | Still receive the text digest even if audio fails | I'm never left with nothing |

---

## 5. Article Selection & Enrichment Flow

This is a two-step process — selection is cheap and fast, enrichment only happens for the chosen articles.

### Step 1 — Candidate Selection (title-based)
```
HN API top 30 stories
        ↓
Keyword filter → ~8 AI-relevant stories
        ↓
Gemini call #1 (fast): rank by newsworthiness → return top 3–5 story IDs
```

Gemini receives only titles, scores, and comment counts at this stage. No article content is fetched yet. This call is intentionally cheap.

### Step 2 — Content Enrichment (selected articles only)
```
Fetch full HTML of top 3–5 URLs in parallel
        ↓
Strip to plain text via cheerio
        ↓
Paywall check: if body < 200 chars → fetch top 5 HN comments as fallback
        ↓
Each article becomes: { title, url, body | hn_comments }
```

Only 3–5 HTTP fetches per day. Paywall fallback uses HN comments, which reliably summarise the article content.

### Step 3 — Generation
```
Gemini call #2: reads enriched articles → writes digest + podcast script in one call
```

Both the WhatsApp text digest and the podcast script are generated in the same Gemini call to avoid redundant API usage.

### Step 4 — Audio Rendering
```
Parse script into [{ speaker, text }] lines
        ↓
Google TTS: synthesise each line with assigned Journey voice
        ↓
ffmpeg: concatenate segments into single .mp3
```

### Step 5 — Delivery
```
Send text digest to WhatsApp group
        ↓  (immediately after)
Send .mp3 as WhatsApp voice message
        ↓
Delete local .mp3 and temp files
```

---

## 6. Functional Requirements

### 6.1 Article Selection
- Gemini must select **3–5 stories** from the 8 filtered candidates
- Selection is based on: novelty, significance, discussion quality (HN score + comments)
- If fewer than 3 AI stories pass the keyword filter on a given day, proceed with 2 (see §6.4)

### 6.2 Content Enrichment
- Fetch article HTML and strip to plain text using `cheerio`
- If fetched body is fewer than 200 characters, treat as paywalled
- Paywalled articles fall back to the top 5 HN comments for that story
- If both the fetch and HN comments fail, drop that article and promote the next candidate

### 6.3 Script Generation
- Gemini writes a dialogue between two named hosts: **Alex** and **Sam**
- Format: strictly alternating `ALEX: ...` / `SAM: ...` lines
- Target word counts by story count:

| Stories found | Target words | Target duration |
|--------------|--------------|-----------------|
| 2 | 280–350 | ~2 min |
| 3 | 420–490 | ~3 min |
| 4 | 490–630 | ~3.5–4.5 min |
| 5 | 560–700 | ~4–5 min |

- **Default (3 stories): 560 words → ~4 minutes**
- Script must open with a one-line welcome and close with a punchy takeaway line
- No filler phrases: "Great question", "Absolutely", "That's so interesting"

### 6.4 Word Count Validation
- After generation, count words in the script
- If outside the valid range for the story count → retry Gemini once with a corrective instruction:
  - Too short: "Expand each story with more context and discussion"
  - Too long: "Cut filler, be more concise, target X words"
- If second attempt also fails validation → use it anyway and log a warning

### 6.5 Audio Rendering
- Use **Google Cloud TTS Journey voices** (highest quality, designed for long-form)
  - Alex → `en-US-Journey-D` (male)
  - Sam → `en-US-Journey-F` (female)
- Speaking rate: `1.05` (slightly faster for podcast feel)
- Audio encoding: `MP3`
- Segments generated sequentially per script line
- All segments concatenated via ffmpeg into a single `daily_news.mp3`
- Temp files deleted after successful merge

### 6.6 Fallback: Fewer Than 3 Articles
- If only 2 articles pass enrichment → generate a shorter script (~300 words, ~2 min)
- If only 1 article passes → skip audio entirely, send text digest only, log warning
- Never send an audio clip shorter than 90 seconds

### 6.7 Delivery Order
1. Send text digest (WhatsApp formatted markdown)
2. Send `.mp3` as WhatsApp voice message (`sendAudioAsVoice: true`)
3. Both always sent in this order — text first, audio second

### 6.8 Error Isolation
- Audio pipeline failure must **never block** the text digest from sending
- If audio generation fails at any step, log the error and skip audio silently
- No error messages posted to the WhatsApp group under any circumstance

---

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| End-to-end latency | Digest + audio delivered within 90s of cron trigger |
| Audio duration | 2–5 minutes (hard bounds) |
| Google TTS cost | ~3,000 chars/day → well within 1M free tier |
| Gemini token cost | ~3,000 tokens/day total (both calls) → negligible on Flash |
| Storage | Temp audio files deleted after send; no persistent audio storage |
| Node.js version | ≥ 18 (native fetch required) |

---

## 8. New Files

```
src/services/audioService.js     ← TTS synthesis, ffmpeg merge, temp file management
```

---

## 9. Modified Files

```
src/services/newsService.js      ← add article HTML fetching + cheerio stripping + HN comment fallback
src/services/geminiService.js    ← add generatePodcastScript(); update generateNewsDigest() to accept enriched articles
src/services/scheduler.js        ← wire audio pipeline after text digest
src/whatsappClient.js            ← add sendGroupAudio()
```

---

## 10. New Dependencies

| Package | Purpose |
|---------|---------|
| `@google-cloud/text-to-speech` | Google TTS API client |
| `fluent-ffmpeg` | ffmpeg wrapper for segment merging |
| `@ffmpeg-installer/ffmpeg` | Bundles ffmpeg binary (no system install needed) |
| `cheerio` | HTML parsing and body text extraction |

---

## 11. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | — | Shared with Gemini — must have TTS API enabled |
| `NEWS_CRON_SCHEDULE` | No | `0 8 * * *` | Cron expression |
| `NEWS_TTS_SPEAKING_RATE` | No | `1.05` | Journey voice speaking rate |

---

## 12. Podcast Script Format

Gemini must output the script in this exact format — no deviations:

```
ALEX: Good morning! I'm Alex, joined as always by Sam, and today in AI...
SAM: We've got some big ones. Let's start with...
ALEX: ...
SAM: ...
ALEX: That wraps it up for today. The big takeaway: ...
SAM: See you tomorrow.
```

The parser splits on `ALEX:` / `SAM:` prefixes. Any line not matching this pattern is discarded.

---

## 13. Paywall Fallback Detail

```
Fetch article URL
        ↓
body.length < 200?
   YES → fetch HN item comments (top 5 by score)
         → join as fallback body text
         → flag source as 'hn_comments' in context sent to Gemini
   NO  → use article body directly
```

Gemini is informed via the prompt when a story is sourced from HN comments vs. the full article, so it can adjust confidence in its summary accordingly.

---

## 15. Rollout

1. Enable **Cloud Text-to-Speech API** in Google Cloud Console (same project as Gemini)
2. Install new npm dependencies
3. Deploy `audioService.js` and updated service files
4. Set env vars; verify `GOOGLE_APPLICATION_CREDENTIALS` has TTS scope
5. Run `/news` manually — confirm text digest arrives first, then audio
6. Check audio duration with ffprobe: must be 2–5 min
7. Monitor for 3 days; check logs for paywall fallback frequency
8. Consider feature stable after 5 consecutive successful runs
