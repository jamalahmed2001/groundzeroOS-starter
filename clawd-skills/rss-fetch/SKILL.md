---
name: rss-fetch
description: Fetch one or more RSS 2.0 or Atom feeds in parallel and return a normalised list of items (title, URL, content, source, published). Use in research-stage directives that need to ingest blog/news feeds.
metadata:
  clawdbot:
    emoji: "📰"
    requires: ["node"]
    credentials: "none — reads public feeds"
---

# RSS Fetch

General-purpose RSS/Atom feed fetcher. Parses both RSS 2.0 and Atom; errors on individual feeds are collected into an `errors` array rather than failing the whole call.

## Install

```bash
cd ~/clawd/skills/rss-fetch
pnpm install
pnpm run build
```

## Usage

```bash
# One feed
rss-fetch --url "https://example.com/feed.xml" --output items.json

# Multiple feeds
rss-fetch \
  --url "https://nephjc.com/feed.rss" \
  --url "https://www.medscape.com/rss/nephrology" \
  --output items.json

# Feeds from a JSON file
rss-fetch --urls-file ./research/feeds.json --output items.json
```

Without `--output`, items are included inline in the stdout JSON. Output shape:

```json
{
  "ok": true,
  "feeds": 2,
  "count": 23,
  "errors": [],
  "items": [
    { "title": "…", "url": "https://…", "content": "…", "source": "https://feed.xml", "published": "2026-04-10T00:00:00.000Z" }
  ]
}
```

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--url <url>` | — | Repeatable. At least one required. |
| `--urls-file <path>` | — | JSON array of URLs. Additive with `--url`. |
| `--output <path>` | — | Write items to this file |
| `--timeout-ms <n>` | `15000` | Per-feed timeout |

## Error classification

| `error` | Meaning |
|---|---|
| `config` | Missing URLs / bad args |
| `unknown` | Unexpected error reading inputs/outputs |

Individual feed failures (HTTP errors, timeouts, malformed XML) are surfaced in the top-level `errors` array and do not abort the call.

## Callers

- Universal research phases ingesting blog/news feeds
- ManiPlus research phases — replace per-project `rss-fetcher.ts`
- Any trend-watching directive (marketing-strategist, journalist)

## See also

- `pubmed-search` — companion skill for peer-reviewed biomedical literature
- Vault Overview: `08 - System/Agent Skills/rss-fetch - Skill Overview.md`
