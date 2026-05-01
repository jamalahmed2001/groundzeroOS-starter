---
project: Video — Animated Short
phase_number: 4
phase_name: Scene Composition
status: backlog
profile: my-show
directive: scene-composer
blocked_by: [3]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O4 — Scene Composition

## Overview

Beat-by-beat shot list. Read O3's audio durations; total shot duration sums to audio total ±100ms. Each shot file in `Shots/` carries its beat, frame contents, camera move, location reference, character refs, and negative prompt stack.

## Tasks

- [ ] Read O3 audio outputs — extract per-segment durations.
- [ ] Read the Show Bible — characters' verbatim descriptions, locations, eye-line maps.
- [ ] Apply the [[08 - System/Agent Directives/scene-composer.md|scene-composer]] directive.
- [ ] For each script segment, decide shot count, shot durations summing to segment duration ±100ms.
- [ ] Write one file per shot in `Shots/p<part>-s<seq>.md` per the scene-composer directive's output shape.
- [ ] Every shot has: beat, frame contents (≤3 elements), one camera move, location verbatim from Bible, characters in frame with verbatim descriptions, negative prompt stack.
- [ ] Update episode note's `## Scene Composition` section with shot index.

## Acceptance Criteria

- [ ] `Shots/` folder exists with one MD per shot.
- [ ] Sum of shot durations = audio duration ±100ms.
- [ ] No shot has more than 3 load-bearing visual elements.
- [ ] No shot has more than one camera move.
- [ ] All character / location descriptions are verbatim from the Bible (not paraphrased).

## Human Requirements

<!-- None — phase completed successfully -->
