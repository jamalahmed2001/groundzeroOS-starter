---
project: Podcast — Spoken Audio Show
phase_number: 4
phase_name: Render
status: backlog
profile: audio-production
directive: general
blocked_by: [3]
tags: [project-phase, phase-backlog]
created: 2026-04-27T00:00:00Z
up: Podcast — Spoken Audio Show - Phases Hub
---
## 🔗 Navigation

**UP:** [[Podcast — Spoken Audio Show - Phases Hub|Phases Hub]]

# E01 O4 — Render

## Overview

Final render: chapter markers, ID3 tags, optional cover art. The audio is already mastered (O3); this phase wraps it for distribution.

## Tasks

- [ ] Add ID3 tags via ffmpeg or `audio-master`: title, artist (host name), album (show name), track number, year, genre, comment (description), cover art.
- [ ] Optional: chapter markers (FFmpeg metadata or chap-level ID3) — useful on long-form episodes.
- [ ] Confirm sample rate / bitrate match RSS spec (44.1 kHz / 128 kbps stereo or 192 kbps mono is common).
- [ ] Output to `output/audio/E01/release.mp3` — this is the file the RSS feed serves.

## Acceptance Criteria

- [ ] `release.mp3` exists with all ID3 fields populated.
- [ ] Cover art embedded (or absent on purpose with reason in episode note).
- [ ] Bitrate / sample rate match RSS spec.

## Human Requirements

<!-- None — phase completed successfully -->
