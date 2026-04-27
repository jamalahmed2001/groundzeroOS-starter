---
project: Music — Album Release
album_id: A01
phase_number: 2
phase_name: Generate + Curate
status: backlog
profile: audio-production
directive: general
blocked_by: [1.5]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Music — Album Release - Phases Hub
---
## 🔗 Navigation

**UP:** [[Music — Album Release - Phases Hub|Phases Hub]]

# A01 O2 — Generate + Curate

## Overview

Generate candidates per track via `suno` / `suno-generate`. Curate down to one keeper per track. Keepers must (a) honour the track's style prompt, (b) sing the lyrics audibly, (c) sound like the album, not like a different album.

## Tasks

- [ ] For each track in the tracklist, generate 2-4 candidates via `suno` (browser mode preferred — keeps the workspace consistent).
- [ ] Listen / preview each candidate. Reject any that drift from the style prompt or mangle the lyrics.
- [ ] Pick one keeper per track. Save to `output/raw/A01/T<NN>.mp3`.
- [ ] Update each track's note (`Tracks/T<NN> - <title>.md`) with the keeper's generation prompt + Suno track ID.
- [ ] Mark the track row in the album's `## Tracklist` as `generated`.

## Acceptance Criteria

- [ ] One keeper per track at `output/raw/A01/`.
- [ ] All keepers honour the Style Guide's per-track variation rule (no two sound interchangeable).
- [ ] Lyrics are audibly the lyrics from O1.5 (not Suno's hallucinated version).

## Human Requirements

<!-- None — phase completed successfully -->
