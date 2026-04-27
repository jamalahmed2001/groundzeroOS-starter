---
project: Video — Animated Short
phase_number: 6
phase_name: Render
status: backlog
profile: video-production
directive: general
blocked_by: [5]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O6 — Render

## Overview

Drive the video-gen model per shot. Each shot's keyframe + per-shot motion-only prompt + character / location verbatim descriptions + negative prompt stack go to the model (Veo, Kling, Sora, Runway — whichever the project config pins). Output is one mp4 per shot.

## Tasks

- [ ] For each shot in `Shots/`:
  - Read the shot's keyframe (`output/keyframes/E01/<shot-id>.png`)
  - Read the shot's beat, characters, location, camera move
  - Assemble the motion-only prompt (keyframe carries scene; prompt describes movement only)
  - Submit to `fal` with the project's chosen video-gen model
  - Download the output mp4 to `output/shots/E01/<shot-id>.mp4`
- [ ] Sanity-check each shot mp4: duration matches the shot's declared `duration_s`, character continuity holds, no on-screen text leaked from the model.
- [ ] If a shot fails QC: re-fire with a tightened prompt, or escalate to a more reliable model variant.

## Acceptance Criteria

- [ ] One mp4 per shot at `output/shots/E01/`.
- [ ] Each shot mp4 duration matches its declared duration ±100ms.
- [ ] No leaked text in any shot.
- [ ] No character drift visible across shots (QC reviewer's checklist).

## Human Requirements

<!-- None — phase completed successfully -->
