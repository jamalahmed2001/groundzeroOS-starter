---
project: Video — Animated Short
phase_number: 8
phase_name: Launch
status: backlog
profile: publishing
directive: launch-ops
blocked_by: [7]
target_platforms: [youtube]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Video — Animated Short - Phases Hub
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Phases Hub|Phases Hub]]

# E01 O8 — Launch

## Overview

Ship the final mp4 to the declared `target_platforms`. Sequential fan-out (one platform at a time). Never auto-submit paid actions.

## Tasks

- [ ] Generate metadata for each platform via the [[08 - System/Agent Directives/metadata-curator.md|metadata-curator]] directive (titles, descriptions, tags, thumbnails).
- [ ] Apply the [[08 - System/Agent Directives/launch-ops.md|launch-ops]] directive.
- [ ] For each platform in `target_platforms`, push via the matching skill (`youtube-publish`, `tiktok-publish`, `instagram-publish`).
- [ ] After each platform: verify the URL is live (don't trust the upload API's 200 — fetch the resource).
- [ ] Update the episode note's `## Publish Ledger` table.

## Acceptance Criteria

- [ ] Every target platform has a row in the publish ledger with URL + timestamp.
- [ ] Each URL has been fetched and confirmed live.
- [ ] No auto-submitted paid actions.

## Human Requirements

<!-- None — phase completed successfully -->
