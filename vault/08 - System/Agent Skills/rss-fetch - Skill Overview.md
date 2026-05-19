---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: rss-fetch
source_skill_path: ~/clawd/skills/rss-fetch/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# rss-fetch

> Fetch RSS 2.0 or Atom feeds in parallel and return a normalised item list. Per-feed failures surface in an errors array rather than aborting the whole call.

## When a directive should call this

- Any research-stage phase ingesting blog/news content
- Trend-watching directives (marketing-strategist, journalist)
- Replacing inline `curl` + XML parsing in project-specific code with a consistent skill call

## When NOT to call this

- Heavy HTML scraping of non-feed pages — use a web-scraping skill instead
- Authenticated/paywalled feeds — this skill is anonymous-only

## How to call it

```bash
~/clawd/skills/rss-fetch/bin/rss-fetch \
  --url "https://nephjc.com/feed.rss" \
  --url "https://www.medscape.com/rss/nephrology" \
  --output items.json
```

Output JSON includes `{title, url, content, source: <feed url>, published: <ISO>}` per item, plus `errors[]` for any feed that failed.

## Credentials

None — reads public feeds.

## Currently used by

| Project | Directive | What it ingests |
|---|---|---|
| Example Podcast | research phases | Medical blog feeds |
| Any media project | `marketing-strategist` / `journalist` | Trend + news feeds |

## See also

- [[pubmed-search - Skill Overview|pubmed-search]] — companion for peer-reviewed literature
