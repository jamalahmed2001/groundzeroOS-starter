<!--
Style guide — the project's artistic and sonic constants.
Fill in before running any phase. The script-writer (lyrics) and the
mastering engineer both read this.

Reference: 08 - System/Templates/Album Template.md for the full shape.
-->
---
project: Music — Album Release
type: style-guide
status: draft
tags:
  - style-guide
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Music — Album Release - Overview
---
## 🔗 Navigation

**UP:** [[Music — Album Release - Overview|Overview]]

# Music — Album Release — Style Guide

## Artist persona

<one paragraph — the artist's voice, the audience, the lane in the genre landscape>

## Sonic palette (core)

The constants across every track on every album:

- **Genre lane:** <e.g. lo-fi acoustic with field-recording textures>
- **Tempo range:** <e.g. 70-95 BPM>
- **Key tendency:** <e.g. minor / modal>
- **Arrangement signature:** <e.g. solo voice + acoustic guitar + ambient bed>
- **Reference touchstones:** <2-3 artists / records that anchor the palette>

## Per-track variation rule

Within the core palette, each track varies in at least 2 of: tempo, instrumentation, vocal register, song form, lyric POV. **Never ship N tracks with identical Suno prompts** — the audience hears the sameness immediately.

## Lyric voice

- **POV:** <first-person / third-person / mixed>
- **Subject matter:** <recurring themes>
- **Forbidden patterns:** <code-switching / stunt writing / culture-stack signifiers — see [[08 - System/Principles/no-chained-identity-signifiers.md|no-chained-identity-signifiers]]>

## Mastering target

- **LUFS:** -14 (streaming) — overrides the project's default if different
- **True peak:** -1 dBTP
- **Sample rate / bit depth:** 44.1 kHz / 16-bit (streaming spec)

## Visual constants (cover art / track art)

- **Aspect ratio:** 1:1 (3000×3000 px for distributor specs)
- **Palette:** <colour palette across the album>
- **Type / wordmark:** <font, where the artist name sits, where the album title sits>
- **Forbidden:** <e.g. no AI-generated faces, no over-smoothed corporate aesthetic>

## Voices (if vocals)

| Voice | Used on | Provider settings |
|---|---|---|
| <voice ref> | <track numbers> | see `Voices/<ref>.md` |
