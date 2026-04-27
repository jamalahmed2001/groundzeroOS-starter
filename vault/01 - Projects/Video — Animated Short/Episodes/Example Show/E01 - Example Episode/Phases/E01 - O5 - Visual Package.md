---
project: Video — Animated Short
phase_number: 5
phase_name: Visual Package
status: backlog
profile: video-production
directive: general
blocked_by: [4]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O5 — Visual Package

## Overview

Per-shot keyframe composition. For each shot in `Shots/`, compose a keyframe by combining locked character refs + location ref using `nano-banana-compose`. The keyframe is the visual seed the video-gen model uses in O6.

## Tasks

- [ ] For each shot in `Shots/`, read its character / location refs from the Bible.
- [ ] Use `bin/bible-to-prompt` to assemble the canonical prompt from the Bible MD(s).
- [ ] Use `bin/nano-compose` to combine refs into a per-shot keyframe at the project's `aspect_ratio`.
- [ ] For continuous-cut shots, set `continuity_seed_from: <prior-shot-id>` and use the prior shot's last frame as an additional ref.
- [ ] Output keyframes to `output/keyframes/E01/<shot-id>.png`.
- [ ] Run a quick sanity pass: each keyframe matches the shot's beat, characters look correct (no drift), location lighting matches Bible default.

## Acceptance Criteria

- [ ] One keyframe per shot at `output/keyframes/E01/`.
- [ ] All keyframes are exactly the project's `aspect_ratio`.
- [ ] No on-screen text in any keyframe (text overlays go in O7).
- [ ] No character drift visible (per QC reviewer's checklist).

## Human Requirements

<!-- None — phase completed successfully -->
