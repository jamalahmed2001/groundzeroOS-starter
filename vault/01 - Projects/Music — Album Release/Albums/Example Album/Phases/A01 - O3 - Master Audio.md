---
project: Music — Album Release
album_id: A01
phase_number: 3
phase_name: Master Audio
status: backlog
profile: audio-production
directive: mastering-engineer
blocked_by: [2]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Music — Album Release - Phases Hub
---
## 🔗 Navigation

**UP:** [[Music — Album Release - Phases Hub|Phases Hub]]

# A01 O3 — Master Audio

## Overview

Master each curated keeper to streaming spec. Two-pass loudnorm. No creative processing — mastering is loudness conformance.

## Tasks

- [ ] Apply [[08 - System/Agent Directives/mastering-engineer.md|mastering-engineer]].
- [ ] For each track in `output/raw/A01/`, run `audio-master master` at the project's `voice_target_lufs` and -1 dBTP.
- [ ] Output to `output/mastered/A01/T<NN>.mp3` (or .wav for distributors that require lossless).
- [ ] Record per-track measurement values (input I, TP, LRA, target_offset) in the track note.
- [ ] Listen-check: confirm no track is noticeably louder or quieter than its neighbours.

## Acceptance Criteria

- [ ] Every track mastered at `output/mastered/A01/`.
- [ ] Every track within 0.5 LU of the project's LUFS target.
- [ ] No track exceeds -1 dBTP true peak.
- [ ] No creative processing applied (no compression beyond loudnorm, no EQ).

## Human Requirements

<!-- None — phase completed successfully -->
