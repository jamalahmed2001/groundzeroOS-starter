---
project: Research — Investigation
type: overview
profile: research
status: active
research_question: <one-sentence question this investigation will answer>
source_constraints: peer-reviewed | trade-press | primary-only | locale-specific
output_format: report | brief | dashboard | memo
tags:
  - onyx-project
  - starter
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Research — Investigation - Phases Hub
---
## 🔗 Navigation

**UP:** [[Research — Investigation - Phases Hub|Phases Hub]]

# Research — Investigation — Overview

## What this starter is

The lightest pipeline in the kit. 5 phases — scope → gather → synthesise → write → review — for any investigation where the deliverable is a written output (research brief, market report, technical memo, regulatory analysis, literature review).

Demonstrates how ONYX runs on non-creative knowledge work: same loop, same operations, same QC discipline, different profile. Useful as a first-non-trivial pipeline because there's no rendering / publishing / external API toil — just reading, thinking, citing, writing.

## How to fork this starter

1. Copy this folder, rename it.
2. Edit this Overview's frontmatter:
   - `project:` your investigation's title.
   - `research_question:` one sentence — the investigation answers this.
   - `source_constraints:` the source quality bar (e.g. `peer-reviewed only` for clinical, `trade-press OK` for industry).
   - `output_format:` what the deliverable looks like.
3. Read Phase 1 (Scope). Fill in the unknowns.
4. `onyx atomise` → `onyx run`.

## Goal

Answer the research question with a written deliverable that:
- Cites every load-bearing claim
- Honours the declared source-constraint bar
- Names what the evidence does *not* yet show (gaps)
- Is short enough to be useful and long enough to be defensible

## Why now

(Filled in by you when you fork. Why is this question worth answering now? What decision rides on the answer?)

## Scope

**In scope:**
- The single research question stated above.
- The output format declared in frontmatter.

**Out of scope:**
- Auxiliary questions adjacent to the main one (start a new investigation if they matter).
- Original data collection (use existing sources; new instruments are a research project, not an investigation).
- Public publication / distribution (this pipeline produces the written work; publishing is a separate phase if required).

## Success criteria

- [ ] The deliverable answers the research question.
- [ ] Every load-bearing claim has an inline citation that resolves.
- [ ] Source constraints honoured (no peer-reviewed claims sourced from blog posts, etc.).
- [ ] Gaps in evidence are named explicitly.
- [ ] A reviewer (other than the author) has signed off (Phase 5).

## Skills the project expects

- `pubmed-search` — for biomedical / clinical investigations
- `rss-fetch` — for current trade-press / news scanning
- `web-fetch` — for specific authoritative pages
- `web-search` — when the above haven't surfaced what's needed
- `pdf-extract` — for PDF-only sources
- `notion-context` — if your prior work is in Notion
