---
name: pubmed-search
description: Search PubMed via NCBI E-utilities (esearch + efetch) and return a normalised list of articles with title, URL, abstract, and PMID. Use in research-stage directives that need biomedical literature — clinical-researcher, universal-researcher, any health/biotech project.
metadata:
  clawdbot:
    emoji: "🩺"
    requires: ["node"]
    credentials: "optional — PUBMED_API_KEY env var or --api-key flag bumps NCBI rate limit from 3/s to 10/s"
---

# PubMed Search

General-purpose PubMed search. Deduplicates PMIDs across multiple queries in a single call.

## Install

```bash
cd ~/clawd/skills/pubmed-search
pnpm install
pnpm run build
```

## Usage

```bash
# One query
pubmed-search --query "dialysis elderly outcomes" --max 20 --output results.json

# Multiple queries (dedup across queries)
pubmed-search --query "dialysis" --query "kidney transplant" --output results.json

# Queries from a JSON file
pubmed-search --queries-file ./research/queries.json --output results.json
```

Without `--output`, articles are included inline in the stdout JSON. Output shape:

```json
{
  "ok": true,
  "queries": 2,
  "count": 14,
  "articles": [
    { "title": "…", "url": "https://pubmed.ncbi.nlm.nih.gov/12345678/", "content": "Abstract…", "source": "pubmed", "pmid": "12345678" }
  ]
}
```

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--query <term>` | — | Repeatable. At least one required. |
| `--queries-file <path>` | — | JSON array of query strings. Additive with `--query`. |
| `--max <n>` | `10` | Per-query cap |
| `--api-key <key>` | `$PUBMED_API_KEY` | Optional NCBI API key |
| `--output <path>` | — | Write articles to this file |

## Error classification

| `error` | Meaning |
|---|---|
| `config` | Missing queries / bad args |
| `rate_limit` | 429 from NCBI — back off and retry |
| `auth` | 401/403 — check API key |
| `upstream` | 5xx |
| `timeout` | Request exceeded the per-query timeout |

## Callers

- Universal research phases needing peer-reviewed biomedical evidence
- `clinical-researcher` directive — replace inline `curl` snippets with this skill
- My Podcast research phases — replace per-project `pubmed-fetcher.ts`

## See also

- `rss-fetch` — companion skill for blog/news feed research
- Vault Overview: `08 - System/Agent Skills/pubmed-search - Skill Overview.md`
