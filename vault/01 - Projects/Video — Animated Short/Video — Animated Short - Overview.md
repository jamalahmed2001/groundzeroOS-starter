---
project: Video — Animated Short
type: overview
profile: my-show
status: active
aspect_ratio: 16:9
target_duration_s: 60
render_engine: ffmpeg-only
voice_profile: Voices/narrator.md
lufs_target: -14
tags:
  - onyx-project
  - starter
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# Video — Animated Short — Overview

## What this starter is

A 9-phase scaffold for producing one episode of an animated short series, end-to-end: concept → script → scene composition → visual package → render → audio → export → launch → engagement.

This starter is **structural** — it ships the phase shape, the directives that run each phase, and the empty templates each phase fills in. It does **not** ship a specific show, characters, or episode content. Fork the starter, fill in your Show Bible, then run.

## How to fork this starter

1. Copy this folder, rename to your show's title.
2. Fill in `Video — Animated Short - Bible.md` (Show Bible — universe, characters, locations, tone, animation register). Every phase reads from the Bible. Don't run phase 1 until the Bible is solid.
3. Fill in voice profiles in `Voices/` for every character / narrator that speaks.
4. Optional: pre-render locked character PNGs into `Refs/<character-name>.png` — these are the canonical visual reference every per-shot prompt cites.
5. Edit this Overview's frontmatter:
   - `aspect_ratio:` 16:9 / 9:16 / 1:1 — drives every shot, render, and export
   - `target_duration_s:` typical episode length
   - `render_engine:` `remotion` / `ffmpeg-only` / `external`
   - `voice_profile:` path to the narrator voice (if any)
   - `lufs_target:` -14 (streaming) or -16 (Apple Podcasts equivalent)
6. Copy the example episode skeleton in `Episodes/Example Show/E01 - Example Episode/` to start your first real episode. Rename, fill in the concept brief, then `onyx atomise` → `onyx run`.

## Goal

A single shipped animated short episode that:
- Honours its Show Bible (characters consistent, tone correct)
- Times the visuals to the audio, not the other way around
- Renders in the declared aspect ratio with no on-screen text from the model (overlays go via post-render ffmpeg)
- Is loudness-conformant for the target platform
- Has metadata + thumbnail + captions ready for distribution

## Why now

(Filled in by you when you fork. Your show's premise; the audience you're talking to; what makes this episode worth making this week.)

## Scope

**In scope:**
- One episode of one show.
- The shipping aspect ratio declared in frontmatter.
- One narrator voice + ≤ 5 character voices (if applicable).

**Out of scope:**
- Multi-aspect-ratio export (do that as a follow-up phase if you need it).
- Cross-platform metadata curation (the publishing profile owns that — fork a `Video — Multi-platform Launch` project to fan out one episode to multiple platforms).
- Season-arc planning (start a separate research / planning project for that).

## Success criteria

- [ ] Show Bible exists and is read by every phase.
- [ ] Episode passes per-phase QC (no character drift, audio-first timing honoured).
- [ ] Final render exists at `Episodes/<show>/E01 - <Title>/output/final.mp4`.
- [ ] Loudness target met (verify with `audio-master`).
- [ ] Captions burned in (if shipping short-form vertical).
- [ ] Metadata curated for at least one target platform.

## Skills the project expects

- `nano-banana-compose` — multi-ref keyframe composition (character + location → per-shot keyframe)
- `fal` — video-gen models (Veo / Kling / Sora / Runway)
- `elevenlabs-tts` — narrator + character voices
- `audio-master` — per-segment loudness conformance + final mix
- `suno-generate` — music beds
- `subtitle-burner` — burned-in captions for short-form export
- `whisper-groq` — transcription for caption alignment
