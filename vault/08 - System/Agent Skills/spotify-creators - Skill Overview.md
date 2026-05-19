---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: spotify-creators
source_skill_path: ~/clawd/skills/spotify-creators/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# spotify-creators

> Upload/list podcast episodes on Spotify for Creators (formerly Anchor / Spotify for Podcasters). Spotify has no public upload API — this drives the `creators.spotify.com` UI under the user's signed-in account via browser-automate CDP.

## When a directive should call this

- Per-episode podcast upload where Spotify for Creators is the canonical RSS host (it generates the feed all other directories auto-ingest)
- Listing existing shows/episodes for analytics or audit

## When NOT to call this

- Podcast is self-hosted or lives on another host (Transistor/Buzzsprout/Libsyn) → use their own feed, point Spotify at it once
- Bulk historical backfill — one-at-a-time uploads only

## How to call it

```bash
spotify-creators show-list

spotify-creators episode-list --show-id <id> [--limit 50] [--output ep.json]

spotify-creators episode-upload \
  --show-id <id> \
  --audio ./full.mp3 \
  --title "Episode 8 — Becoming the Mentor" \
  --description-file ./description.md \
  --art ./thumb.jpg \
  --publish-date 2026-04-22 \
  --season 1 --episode 8 \
  --episode-type full
```

`--schedule` to schedule-publish · `--draft` to save unpublished · `--explicit` · `--dry-run`

## Prerequisites

- Signed in to `creators.spotify.com` in daily Chrome (daemon inherits)
- `browser-automate daemon` running (auto-starts)

## Output

Stdout JSON. `episode-upload` returns `{ ok, state: "published|scheduled|draft", episodeUrl, episodeId }`.

On failure, error screenshots at `/tmp/browser-automate/spotify-creators-*/<timestamp>/error-*.png`.

See `~/clawd/skills/spotify-creators/SKILL.md` for full reference.
