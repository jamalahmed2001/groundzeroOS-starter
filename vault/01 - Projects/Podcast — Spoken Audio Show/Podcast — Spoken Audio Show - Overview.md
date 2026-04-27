---
project: Podcast — Spoken Audio Show
type: overview
profile: audio-production
status: active
voice_profile: Voices/host.md
voice_target_lufs: -16
locale: <UK | US | global>
content_pillars:
  - <pillar 1>
  - <pillar 2>
charity_partner: <name or null>
tags:
  - onyx-project
  - starter
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Podcast — Spoken Audio Show - Phases Hub
---
## 🔗 Navigation

**UP:** [[Podcast — Spoken Audio Show - Phases Hub|Phases Hub]]

# Podcast — Spoken Audio Show — Overview

## What this starter is

A 7-phase scaffold for a spoken-audio podcast — research-driven, single-host or single-narrator, distributed via RSS to Spotify / Apple / etc. Built fresh from the universal directives in `08 - System/Agent Directives/` — not a lift of a specific show. Fork, fill in the host's voice + content pillars + locale, and run.

Demonstrates: `audio-production` profile, `research-brief-writer` discipline, avatar-diversity-across-episodes, no-invented-specifics, verifiable-contact-details-only, dated-citation discipline, pronunciation-dictionary discipline.

## How to fork this starter

1. Copy this folder, rename to your show's title.
2. Fill in `Voices/host.md` — host voice profile + DNA (or replace `host.md` with multiple voices for multi-host).
3. Edit this Overview's frontmatter:
   - `voice_profile:` path to the primary voice
   - `voice_target_lufs:` -16 for Apple Podcasts spec, -14 for Spotify
   - `locale:` UK / US / global — drives source priority in the research phase
   - `content_pillars:` 2-4 themes the show returns to
   - `charity_partner:` if the show signposts a charity in the CTA
4. Read `Podcast — Spoken Audio Show - Voice Guide.md` and fill it in — what the host sounds like in writing.
5. Optional: pre-fill `pronunciation.json` with terms the TTS provider mispronounces.
6. Copy the example episode skeleton `Episodes/E01 - Example Episode/` for your first real episode.
7. `onyx atomise` → `onyx run`.

## Goal

A single shipped podcast episode that:
- Answers a clear question for a specific imagined listener
- Cites every load-bearing claim
- Doesn't fabricate weekdays, locations, or contact details
- Is mastered to platform spec
- Lives in your podcast RSS feed, distributed to streaming platforms
- Has a description that's accurate (no over-promising, no fabricated guests)

## Why now

(Filled in by you when you fork. The show's editorial pulse — what's worth talking about now, this season, this week.)

## Scope

**In scope:**
- One episode of one show.
- Research-driven content (the show pulls from real sources, not pure opinion).
- One voice (host) — see Multi-host below for variations.

**Out of scope:**
- Live-recorded multi-host roundtables (the audio-production phase here assumes TTS or single-take recording, not interview editing).
- Video-podcast / YouTube-ready video production (use the Video — Animated Short starter alongside if needed).
- Cross-platform metadata fan-out beyond the RSS feed (use the publishing profile for that).

## Multi-host variation

If the show has 2+ regular voices: declare each in `Voices/`, pick the primary in `voice_profile:`, and have the script-writer phase tag lines per speaker. The audio-producer synthesises each voice separately and concats; the mastering pass is shared.

## Success criteria

- [ ] Voice Guide exists and is read by every script phase.
- [ ] Pronunciation dictionary applied before TTS.
- [ ] Final mp3 mastered to `voice_target_lufs`.
- [ ] RSS feed regenerated with the new episode (`rss-publish`).
- [ ] Episode listed on Spotify for Creators (`spotify-creators`).
- [ ] Description includes any required disclaimer (no medical / legal advice if relevant pillars).

## Skills the project expects

- `pubmed-search` / `rss-fetch` / `web-fetch` / `web-search` — research
- `elevenlabs-tts` — host / narrator voice
- `audio-master` — per-segment master + concat + final mix
- `suno-generate` — optional music bed
- `rss-publish` — RSS feed regen
- `spotify-creators` — Spotify for Creators upload
- `whisper-groq` — transcription for show notes / captions if needed
- `comment-safety-filter` — for engagement triage
