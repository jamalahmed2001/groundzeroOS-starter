---
tool: rss-publish
type: npm
repo: ~/projects/your-podcast-repo
script: publish:rss
free: true
open_source: true
tags: [tool, distribution, npm]
up: "[[Skills Hub]]"
---

# rss-publish

> Add a new episode entry to the project RSS feed XML file.

## Invocation

```bash
cd ~/projects/your-podcast-repo
npm run publish:rss -- --episode <episode-id>
```

## Inputs

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--episode` | string | yes | Episode ID — reads metadata from `output/scripts/<id>.json` |

## Outputs

Updates `vault/feed.xml` with the new episode entry. Prints the feed path on success.

## Notes

- Feed file is created if it doesn't exist
- Idempotent — re-running with the same episode ID updates the entry rather than duplicating it
- Host the feed XML at a public URL for podcast directories (Spotify, Apple Podcasts)
