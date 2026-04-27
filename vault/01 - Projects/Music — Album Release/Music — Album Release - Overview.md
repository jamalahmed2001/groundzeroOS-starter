---
project: Music — Album Release
type: overview
profile: audio-production
status: active
voice_target_lufs: -14
music_style_guide: Music — Album Release - Style Guide.md
artist_name: <Your Artist Name>
distributor: <your music distributor — TuneCore / Amuse / DistroKid / etc.>
tags:
  - onyx-project
  - starter
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Music — Album Release - Phases Hub
---
## 🔗 Navigation

**UP:** [[Music — Album Release - Phases Hub|Phases Hub]]

# Music — Album Release — Overview

## What this starter is

An 11-phase scaffold for releasing one music album end-to-end: concept → lyrics → generate + curate → master → visual package → metadata → rollout + pre-save → playlist pitching → launch day → post-release engagement → analytics + next-album brief.

**Structural only.** Ships the phase shape and directives. Doesn't ship a specific artist persona, real album titles, or actual track audio. Fork it; fill in your style guide and artist persona; run.

## How to fork this starter

1. Copy this folder, rename to your album / artist project.
2. Fill in `Music — Album Release - Style Guide.md` — the sonic palette across the album, the variations per track, the references.
3. Edit this Overview's frontmatter:
   - `artist_name:` your artist persona's name
   - `distributor:` your chosen music distributor
   - `voice_target_lufs:` -14 (streaming default) — leave as-is unless you have a reason
4. Copy the example album skeleton in `Albums/Example Album/` for your first real album.
5. `onyx atomise` → `onyx run`.

## Goal

A released album that:
- Is sonically coherent across tracks (single core palette) but varied within (per-track variation)
- Honours the style guide on every track
- Is mastered to streaming spec (-14 LUFS, -1 dBTP)
- Has metadata, ISRCs (if needed), cover art, and pre-save campaign live before release day
- Lands on the distributor's wizard at the review step (operator clicks Confirm — never auto-submit)
- Is supported through launch day social rollout + post-release engagement

## Why now

(Filled in by you when you fork. Why this album now? What's the artistic reason for shipping it this season?)

## Scope

**In scope:**
- One album (or EP) under one artist persona.
- One distributor (the one declared in `distributor:`).
- A defined release date with pre-save lead time (≥ 4 weeks for editorial / pre-save eligibility on most platforms).

**Out of scope:**
- Multi-distributor parallel releases.
- Multi-artist comp / split releases (separate project).
- Live show / tour planning (separate project).
- Music video production (use the Video — Animated Short starter alongside if needed).

## Success criteria

- [ ] All tracks generated, curated, and mastered to LUFS target.
- [ ] Cover art final (per `Music — Album Release - Style Guide.md`'s visual section).
- [ ] Metadata complete on the distributor's wizard.
- [ ] Pre-save campaign live ≥ 2 weeks before release.
- [ ] Distributor wizard left at review step for operator confirm (never auto-submitted).
- [ ] Launch-day social rollout scheduled.
- [ ] Post-release engagement triage active for ≥ 1 week after release.

## Skills the project expects

- `suno` and / or `suno-generate` — track generation
- `audio-master` — per-track mastering + concat
- `music-distro` — distributor wizard automation (always stops at review)
- `spotify-creators` (if podcast-side reference) — for any spoken-track album
- `image-resize` — cover art resizing for distributor specs
- `analytics-pull` (if applicable) — post-release streams / saves
