---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: pubmed-search
source_skill_path: ~/clawd/skills/pubmed-search/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# pubmed-search

> Search PubMed via NCBI E-utilities (esearch + efetch). Deduplicates PMIDs across multiple queries. Returns a normalised article list.

## When a directive should call this

- Any research-stage phase that needs biomedical literature (RCTs, cohort studies, case series)
- Replacing inline `curl https://eutils...` snippets in `clinical-researcher`-style directives with a consistent, JSON-output skill call
- Building evidence for a health/biotech project

## When NOT to call this

- Full-text retrieval — this returns abstracts only. Use Unpaywall + a PDF fetcher for full text.
- Non-biomedical literature — use `rss-fetch` or a future academic-search skill

## How to call it

```bash
~/clawd/skills/pubmed-search/bin/pubmed-search \
  --query "dialysis elderly outcomes" \
  --query "kidney transplant immunosuppression" \
  --max 20 \
  --output results.json
```

Output JSON includes `{title, url, content (abstract), source: "pubmed", pmid}` per article.

## Credentials

Optional. Set `PUBMED_API_KEY` env var or pass `--api-key` to bump the NCBI rate limit from 3/s to 10/s.

## Currently used by

| Project | Directive | What it queries |
|---|---|---|
| Example Podcast | research phases | Condition-specific evidence (dialysis, transplant, etc) |
| Any biomedical project | `clinical-researcher` | Evidence for clinical questions |

## See also

- [[rss-fetch - Skill Overview|rss-fetch]] — companion for blog/news feeds
