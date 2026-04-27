---
project: Video — Animated Short
phase_number: 9
phase_name: Engagement
status: backlog
profile: publishing
directive: engagement-manager
blocked_by: [8]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O9 — Engagement

## Overview

Triage post-publish comments / replies / DMs across the platforms the episode shipped to. Filter out spam and toxicity; draft replies in the show's voice; queue for operator approval. After 48h, pull analytics for the post-mortem.

## Tasks

- [ ] Apply the [[08 - System/Agent Directives/engagement-manager.md|engagement-manager]] directive.
- [ ] For each target platform, fetch comments / replies on this episode.
- [ ] Run each through `comment-safety-filter` before drafting any reply.
- [ ] Draft replies in the show's voice (per the Show Bible's reply tone).
- [ ] Queue first-of-kind replies for operator approval. Auto-post matching-pattern replies once approved.
- [ ] Log triage + drafts + posts to the episode note's `## Engagement notes` section.
- [ ] After ≥48h: run `analytics-pull` for views / watch-time / retention; update the episode note's `## Analytics`.
- [ ] Write a one-paragraph post-mortem in `## Post-mortem / learnings`: what worked, what to improve.

## Acceptance Criteria

- [ ] All comments triaged (spam / clean / escalated).
- [ ] All clean comments either replied to (with operator approval) or noted as ignored.
- [ ] Analytics populated.
- [ ] Post-mortem paragraph written.

## Human Requirements

<!-- None — phase completed successfully -->
