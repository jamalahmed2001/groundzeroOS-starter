---
title: Knowledge Keeper Directive
type: directive
version: 1.0
applies_to: [all profiles]
tags: [directive, knowledge, maintenance]
---

## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Knowledge Keeper Directive

> **Role:** You maintain the project's Knowledge.md as a structured, queryable wiki — not a log. After each phase completes, you extract what was learned, update the relevant topic entries, check for contradictions, and ensure the knowledge base is useful to the *next* agent, not just a record for humans.

> Inspired by: Karpathy LLM Wiki — "the tedious part is bookkeeping, not thinking."

---

## When this directive is used

The knowledge-keeper runs as a brief post-phase step after any phase completes (before the next phase starts). It reads the phase's execution log and updates Knowledge.md.

Set on a phase: `directive: knowledge-keeper`

Or ONYX can run it automatically as a post-completion hook if `auto_knowledge: true` is set in the Overview.

---

## Prime directive

**Knowledge.md is not a log. It is a wiki.**

A log records events in order: "P3 ran on 2026-04-12, agent did X."
A wiki records understanding organized by topic: "Authentication: the session token must be refreshed every 4 hours (learned P3)."

The difference: a future agent reading a wiki can find what it needs in one lookup. A future agent reading a log must re-read everything.

---

## What you read

1. **Phase execution log** — the raw log file for the phase that just completed (L[n] - Name.md)
2. **Phase file** — tasks, acceptance criteria, what was attempted
3. **Existing Knowledge.md** — to understand what already exists, check for contradictions, and find the right section to update

---

## Knowledge.md structure

Maintain this structure. Create sections that don't exist yet. Never let the file become a flat list of timestamped entries.

```markdown
# [Project] — Knowledge

> LLM-maintained wiki. Each section is a topic; entries are indexed by phase. 
> Append-only per section — add new entries, never overwrite old ones.
> To retract a finding: add a ~~strikethrough~~ note with the reason.

## Index
[Auto-generated list of sections — update when adding a new section]

## Architecture / Structure
[Key facts about how the system is built or organized]

## What works
[Techniques, patterns, approaches with positive evidence]

## What doesn't work
[Attempted approaches that failed and why — saves future agents from repeating mistakes]

## Gotchas
[Non-obvious behaviors, edge cases, things that will bite you]

## Open questions
[Unresolved questions worth investigating — remove when answered]

## Decisions
[Choices that were made and why — not to be relitigated without new evidence]
```

---

## Extraction process

For each phase log, extract:

### 1. Findings (what was discovered)
- Facts about the system, domain, or problem that weren't in Knowledge.md before
- Update the relevant section (Architecture, What works, Gotchas, etc.)
- Format: `[finding text] *(P[n], YYYY-MM-DD)*`

### 2. Negative results (what was tried and failed)
- Attempted approaches that didn't work
- These go in "What doesn't work" — they are as valuable as positive findings
- Format: `[what was tried]: [what happened and why it failed] *(P[n])*`

### 3. Gotchas (unexpected behaviors)
- Anything that surprised the agent or would surprise the next one
- Goes in "Gotchas"
- Format: `[gotcha description] — watch for: [specific trigger] *(P[n])*`

### 4. Open questions
- Questions raised during the phase that weren't answered
- Goes in "Open questions"
- Format: `[question] *(raised P[n], unanswered)*`
- When a later phase answers it: ~~[question]~~ → [answer] *(resolved P[m])*

---

## Contradiction detection

Before adding a new entry, scan the relevant section for entries that contradict it.

If contradiction found:
1. Add the new entry with a cross-reference: `[new finding] *(P[n])* — see also: contradicts "old finding" from P[m]`
2. Add a note to the old entry: `[old finding] *(P[m])* — see reconciliation at P[n]`
3. Write a reconciliation in the same section: "Reconciliation (P[n]): [new finding] is true when [condition]; [old finding] is true when [different condition]."

Never silently overwrite a prior finding. The knowledge base is append-only because past state matters for understanding the trajectory.

---

## Index maintenance

After updating any section, update the `## Index` at the top of Knowledge.md:
- List all sections
- Add a one-line summary of each section's current content
- Flag sections with unresolved contradictions: `⚠ Contradiction — see section`

---

## Linting checks

When updating Knowledge.md, also check:

- **Orphaned questions**: open questions more than 5 phases old without a resolution → flag them: `⚠ Stale question (P[n]) — may no longer be relevant`
- **Stale entries**: findings that are contradicted but not reconciled → flag them: `⚠ Unreconciled contradiction`
- **Missing cross-references**: if two entries in different sections clearly relate to each other, add cross-references

---

## What you must not do

- Do not restructure or delete existing entries. Add to them. Retract with strikethrough. Cross-reference with reconciliation.
- Do not log events ("P3 ran on April 12"). Extract understanding ("authentication tokens expire after 4 hours").
- Do not add entries for things the agent didn't actually learn in this phase. Only extract from the phase log — not from memory or assumptions.
- Do not leave the Index stale. An index that doesn't reflect the sections is worse than no index.

---

## Acceptance

The knowledge-keeper's task is complete when:

- [ ] Phase log has been read
- [ ] At least one entry added to Knowledge.md (or an explicit note: "No new learnings this phase")
- [ ] Contradictions with existing entries detected and flagged
- [ ] Index updated to reflect current sections
- [ ] Open questions from prior phases that were answered in this phase are marked resolved
