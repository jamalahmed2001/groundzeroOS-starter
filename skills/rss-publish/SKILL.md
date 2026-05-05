---
name: rss-publish
description: Generate or update a podcast RSS 2.0 + iTunes feed from a channel config and a new episode item. Dedupes by guid, preserves existing items, newest-first ordering. Use from any podcast distribution directive.
metadata:
  clawdbot:
    emoji: "📡"
    requires: ["node"]
    credentials: "none — writes a local feed.xml file. Separate upload step publishes the feed to your host."
---

# RSS Publish

Generic podcast RSS feed generator. Every podcast distribution directive that needs to add an episode to a feed calls this skill.

## When to use

- You have produced an episode MP3 and its metadata (title, description, duration, audio URL) and need to add it to a `feed.xml` that hosts the podcast.
- You want to keep the existing items in the feed and add (or replace, by guid) a single new item.

## Not when

- You need to upload the feed to a host (Spotify for Podcasters, Transistor, Buzzsprout, your own CDN). This skill only writes the feed.xml — the caller is responsible for publishing it.

## Install

```bash
cd ~/clawd/skills/rss-publish
pnpm install
pnpm run build
```

## Usage

```bash
rss-publish \
  --channel /path/to/channel.json \
  --episode /path/to/episode.json \
  --audio /path/to/full.mp3 \
  --feed /path/to/existing-or-new/feed.xml \
  --output /path/to/write/feed.xml
```

- `--channel` — channel-level metadata (below)
- `--episode` — episode-level metadata (below)
- `--audio` — (optional) the local MP3; used to measure bytes if `audioBytes` isn't provided in `--episode`
- `--feed` — the existing feed XML to merge into. If the file doesn't exist, starts fresh.
- `--output` — where to write the updated feed. Defaults to the `--feed` path (in-place update).

### Channel JSON

```json
{
  "title": "Example Podcast Title",
  "link": "https://mani.plus",
  "description": "A British, heartfelt podcast about kidney disease, transplant, dialysis, and thriving beyond chronic illness.",
  "author": "Example Author",
  "email": "hello@mani.plus",
  "language": "en-GB",
  "category": "Health & Fitness",
  "imageUrl": "https://mani.plus/cover.png",
  "explicit": "false",
  "type": "episodic"
}
```

### Episode JSON

```json
{
  "episodeId": "2026-04-22-pregnancy-after-transplant",
  "title": "A New Beginning",
  "description": "Assalamu alaikum — this week we sit with a story about pregnancy after transplant ...",
  "audioUrl": "https://mani.plus/episodes/2026-04-22.mp3",
  "durationSeconds": 762,
  "pubDate": "2026-04-22T08:00:00Z",
  "episodeNumber": 8
}
```

Optional fields: `audioBytes`, `link`, `guid`, `imageUrl`, `season`.

## Output (stdout JSON)

```json
{
  "ok": true,
  "feed": "/path/to/feed.xml",
  "totalItems": 8,
  "newItem": { "episodeId": "...", "title": "...", "audioBytes": 6123456, "durationSeconds": 762 }
}
```

## Dedup rules

If an existing item in the feed has the same `guid` as the new item, the existing one is removed and the new one takes its place at the top. Order: newest first.

If no `guid` is provided in the episode JSON, `guid` defaults to the episode link (`{channel.link}/episodes/{episodeId}`).
