---
project: Video — Animated Short
phase_number: 3
phase_name: Audio
status: backlog
profile: video-production
directive: audio-producer
blocked_by: [2]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O3 — Audio

## Overview

Synthesise narrator and character voices, master each segment, concat, optionally mix in a music bed. **This phase sets `target_duration_s` for every downstream phase** — see [[08 - System/Principles/audio-first-pipeline.md|audio-first-pipeline]].

## Tasks

- [ ] Read `## Script` (must have `Safety flags: none`).
- [ ] Read the Voice Profile(s) referenced.
- [ ] Apply the [[08 - System/Agent Directives/audio-producer.md|audio-producer]] directive.
- [ ] Sanitise each segment (strip stage directions, source citations, segment labels, markdown emphasis).
- [ ] Apply pronunciation dictionary (if any).
- [ ] TTS each segment via `elevenlabs-tts`.
- [ ] Master each segment via `audio-master master` (LUFS target from project frontmatter).
- [ ] Concat via `audio-master concat` (600ms gaps default).
- [ ] If music bed: generate via `suno-generate`, sidechain-duck under voice via ffmpeg.
- [ ] Final loudnorm pass.
- [ ] Update `## Audio outputs` in the episode note with file path + duration.
- [ ] **Set `target_duration_s` in episode frontmatter** — the audio's actual duration becomes the canonical target for downstream phases.

## Acceptance Criteria

- [ ] Final mp3 exists at `output/audio/E01/full.mp3`.
- [ ] Loudness ≤ project's `lufs_target` (verify with ffprobe).
- [ ] No leaked stage directions in any segment (manual listen-through of one segment to confirm).
- [ ] `target_duration_s` in episode frontmatter matches the audio's actual length.

## Human Requirements

<!-- None — phase completed successfully -->
