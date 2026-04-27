<!--
TEMPLATE: Project Knowledge

Copy to: 01 - Projects/<Project Name>/<Project Name> - Knowledge.md

This is the per-project learning store. Phases and logs accumulate findings
here. `consolidate` runs at phase boundaries and proposes promotions to
Cross-Project Knowledge when something generalises.
-->
---
project: <Project Name>
type: project-knowledge
tags:
  - project-knowledge
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: <Project Name> - Overview
---
## 🔗 Navigation

**UP:** [[<Project Name> - Overview|Overview]]

# <Project Name> — Knowledge

> Learnings, gotchas, decisions, and references for this project. Append-only during phase execution; reorganised by `consolidate` on phase transitions.

---

## Decisions

| Date | Decision | Why | Reversible? |
|---|---|---|---|
| <YYYY-MM-DD> | <one-line decision> | <one-line reason> | <yes / no — if no, list constraints> |

## Gotchas

<Things that surprised you. Each as: what you expected → what happened → what you do now.>

## Patterns that worked

<Approaches the agent or you tried that paid off. Worth repeating.>

## Patterns that didn't

<Approaches that didn't pay off. Worth not repeating. Include the failure mode so it's recognisable.>

## Domain notes

<Subject-matter knowledge that's reusable across phases. APIs, data schemas, conventions, edge cases discovered while reading code or docs.>

## References

<External links worth keeping near the project — docs, RFCs, papers, dashboards, runbooks.>

---

> **Promotion candidates** — when a learning here applies to *more than this project*, mark it with `[promotion-candidate]` and `consolidate` will surface it to Cross-Project Knowledge.
