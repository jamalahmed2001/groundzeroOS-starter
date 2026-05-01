---
project: Video — Animated Short
phase_number: 7
phase_name: Export
status: backlog
profile: my-show
directive: audio-producer
blocked_by: [6]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O7 — Export

## Overview

Stitch shot mp4s together, layer the audio, burn captions if shipping short-form, run final loudnorm, export. The final mp4 is what ships.

## Tasks

- [ ] Concat shot mp4s in order via ffmpeg (with optional crossfades per the project's style).
- [ ] Layer the O3 audio over the concat'd video (replace any model-generated audio — see [[08 - System/Principles/audio-first-pipeline.md|audio-first-pipeline]]).
- [ ] If shipping vertical short-form: run `subtitle-burner` with the script segments + audio paths to burn-in captions.
- [ ] If overlaying brand text / lower-thirds / end card: use ffmpeg drawtext / overlay (model never produces these).
- [ ] Final loudnorm pass via `audio-master master` on the muxed file at the project's `lufs_target`.
- [ ] Export to `output/video/E01/final.mp4`.
- [ ] Update episode note's `## Video outputs` section.

## Acceptance Criteria

- [ ] Final mp4 exists at the declared output path.
- [ ] Total duration matches `target_duration_s` ±2%.
- [ ] Loudness ≤ project's `lufs_target`.
- [ ] If captions: burned in and readable.
- [ ] No leaked model-generated audio (silence on the video track at concat is fine; we replace with O3).

## Human Requirements

<!-- None — phase completed successfully -->
