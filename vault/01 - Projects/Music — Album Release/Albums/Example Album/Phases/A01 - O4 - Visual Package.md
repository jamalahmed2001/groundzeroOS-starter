---
project: Music — Album Release
album_id: A01
phase_number: 4
phase_name: Visual Package
status: backlog
profile: audio-production
directive: creative-director
blocked_by: [3]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Music — Album Release - Phases Hub
---
## 🔗 Navigation

**UP:** [[Music — Album Release - Phases Hub|Phases Hub]]

# A01 O4 — Visual Package

## Overview

Cover art + (optional) per-track visualisers + (optional) launch-day social tiles. Honour the Style Guide's visual constants.

## Tasks

- [ ] Apply [[08 - System/Agent Directives/creative-director.md|creative-director]] for the cover-art brief.
- [ ] Generate cover art (3000×3000 px, 1:1) — via `fal` text-to-image (Flux / Imagen / Ideogram), iterating until it matches the Style Guide.
- [ ] Optionally: per-track visualisers (animated stills via `fal` + ffmpeg).
- [ ] Optionally: launch-day social tiles (1:1, 9:16, 16:9 variants) for rollout.
- [ ] Resize via `image-resize` to distributor specs.
- [ ] Save to `output/visual/A01/`.

## Acceptance Criteria

- [ ] Cover art at 3000×3000 px, 1:1 ratio, JPEG ≤ 10 MB.
- [ ] Cover art honours Style Guide visual constants (palette, typography, forbidden patterns).
- [ ] Optional artefacts (visualisers, social tiles) match aspect-ratio specs.

## Human Requirements

<!-- None — phase completed successfully -->
