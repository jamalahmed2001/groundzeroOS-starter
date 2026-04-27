---
project: Research — Investigation
phase_number: 2
phase_name: Gather
status: backlog
profile: research
directive: general
blocked_by: [1]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Research — Investigation - Phases Hub
---
## 🔗 Navigation

**UP:** [[Research — Investigation - Phases Hub|Phases Hub]]

# P2 — Gather

## Overview

Fetch the sources. Tag each by quality, locale, and which sub-question it serves. Don't synthesise yet — that's P3. Resist the urge to draw conclusions while reading; just gather and tag.

## Tasks

- [ ] Read P1's scope decisions.
- [ ] Run search skills against each sub-question:
  - `pubmed-search` for biomedical / clinical
  - `rss-fetch` for current trade press
  - `web-fetch` for specific authoritative pages
  - `web-search` for general queries
  - `pdf-extract` for PDF-only sources
- [ ] For each fetched source, write a one-paragraph note in `Sources/<short-slug>.md`:
  - Citation (author / publisher / year / URL)
  - Quality tag (peer-reviewed / trade-press / blog / primary / official)
  - Which sub-question(s) it informs
  - Key findings (one sentence)
  - Whether it agrees or disagrees with prior sources you've read
- [ ] Confirm source count meets P1's target per sub-question. If not, expand search or revise scope (and document the revision).
- [ ] Honour `source_constraints` from the project Overview — drop or flag any source that doesn't meet the bar.

## Acceptance Criteria

- [ ] Source count meets P1's target (or scope was revised with documented reason).
- [ ] Every source has a one-paragraph note in `Sources/`.
- [ ] No source violates `source_constraints` without an explicit flag.
- [ ] No synthesis yet (one-paragraph notes are descriptive, not interpretive).

## Human Requirements

<!-- None — phase completed successfully -->
