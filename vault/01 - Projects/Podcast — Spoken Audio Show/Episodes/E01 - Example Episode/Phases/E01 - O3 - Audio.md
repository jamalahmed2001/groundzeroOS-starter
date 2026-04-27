---
project: Podcast — Spoken Audio Show
phase_number: 3
phase_name: Audio
status: backlog
profile: audio-production
directive: audio-producer
blocked_by: [2]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Podcast — Spoken Audio Show - Phases Hub
---
## 🔗 Navigation

**UP:** [[Podcast — Spoken Audio Show - Phases Hub|Phases Hub]]

# E01 O3 — Audio

## Overview

Synthesise the host voice (or layer multiple voices for multi-host shows), master each segment, concat, optionally mix in a music bed.

## Tasks

- [ ] Read `## Script` (must have `Safety flags: none`).
- [ ] Apply [[08 - System/Agent Directives/audio-producer.md|audio-producer]].
- [ ] Sanitise each segment per [[08 - System/Principles/narrator-no-stage-directions.md|narrator-no-stage-directions]].
- [ ] Apply pronunciation dictionary.
- [ ] TTS each segment via `elevenlabs-tts` using the host voice profile.
- [ ] Master each segment via `audio-master master` at the project's `voice_target_lufs`.
- [ ] Concat via `audio-master concat` (600ms gaps).
- [ ] Optional: generate music bed via `suno-generate` and sidechain-duck under voice via ffmpeg.
- [ ] Final loudnorm pass on the muxed file.
- [ ] Update `## Audio outputs` with file path + duration.

## Acceptance Criteria

- [ ] Final mp3 exists at `output/audio/E01/full.mp3`.
- [ ] Loudness ≤ project's `voice_target_lufs` (verify with ffprobe).
- [ ] No leaked stage directions in any segment (listen-check one segment).

## Human Requirements

<!-- None — phase completed successfully -->
