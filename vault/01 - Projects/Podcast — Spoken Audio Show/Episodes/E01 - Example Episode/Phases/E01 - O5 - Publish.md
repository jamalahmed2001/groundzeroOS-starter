---
project: Podcast — Spoken Audio Show
phase_number: 5
phase_name: Publish
status: backlog
profile: publishing
directive: launch-ops
blocked_by: [4]
target_platforms: [rss, spotify-creators]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Podcast — Spoken Audio Show - Phases Hub
---
## 🔗 Navigation

**UP:** [[Podcast — Spoken Audio Show - Phases Hub|Phases Hub]]

# E01 O5 — Publish

## Overview

Regenerate the RSS feed with the new episode; upload to Spotify for Creators (which then fans out to Apple Podcasts, Amazon Music, etc. via canonical RSS); optionally cross-post to YouTube as audio-with-static-image.

## Tasks

- [ ] Apply [[08 - System/Agent Directives/launch-ops.md|launch-ops]].
- [ ] Apply [[08 - System/Agent Directives/metadata-curator.md|metadata-curator]] to write per-platform metadata into `## Metadata` if not already done.
- [ ] Upload the `release.mp3` to your podcast host (or directly to GitHub Releases / S3 / wherever the RSS feed serves from).
- [ ] Regenerate the RSS feed via `rss-publish` — feed.xml contains the new `<item>` for this episode.
- [ ] Push the feed.xml to the public host.
- [ ] Verify the feed validates (e.g. via Cast Feed Validator) and the new episode appears.
- [ ] Submit to / refresh on Spotify for Creators via `spotify-creators` (it pulls from the RSS).
- [ ] Update the episode note's `## Publish Ledger` with the live URLs.

## Acceptance Criteria

- [ ] RSS feed is live and validates.
- [ ] New `<item>` for this episode appears in the feed.
- [ ] Spotify for Creators shows the episode (may take ~1 hr after RSS update).
- [ ] No fabricated claims in the description.

## Human Requirements

<!-- None — phase completed successfully -->
