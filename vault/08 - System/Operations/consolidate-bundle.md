---
title: consolidate-bundle (redirect)
tags:
  - system
  - operation
  - onyx
  - consolidate
  - redirect
type: operation-directive
version: 0.3
created: 2026-04-24
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: superseded
superseded_by: "[[consolidate]]"
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: consolidate-bundle (superseded)

> **Superseded 2026-04-27 by [[consolidate]] v1.0.** The "tier 2 vs tier 3" distinction was artificial — taking children → parent node + archive is the same operation regardless of whether the parent is new (was tier 2) or existing (was tier 3). Use [[consolidate]] instead.
>
> This file remains as a redirect to keep existing wikilinks resolvable.

## What changed

- **Tiers + modes deleted.** One operation handles new-parent and existing-parent cases, narrative children and structured children, by reading what's there and picking the right shape.
- **Idempotency markers unchanged.** `consolidation_state: applied` + `consolidated_from` + `consolidated_from_sha` still work — the new operation reads them as before.
- **Archived artefacts unaffected.** AI Sentiment Analysis pt3, Example Show (both consolidated under the previous version) need no migration.

See [[consolidate]] for the canonical procedure.
