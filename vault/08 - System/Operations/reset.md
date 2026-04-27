---
title: reset
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/reset.ts
lines_replaced: 50
version: 0.1
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 7
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: reset

> Set a `phase-blocked` / `phase-active` / `phase-planning` phase back to `phase-ready`. Clears `locked_by` / `locked_at`, resets `replan_count` to 0. Frontmatter writes only — no body changes, no LLM, no agent.

## Preconditions
- A vault exists with at least one resettable phase.

## Invocation context
- Operator: `onyx reset` (resets all `phase-blocked`) or `onyx reset <phase-name-or-number>` (one phase).
- Agent-driven: invoked after fixing a Human Requirements blocker.

## Read order
1. All phase notes under `projects_glob` (frontmatter only).

## Procedure

### Step 1 — Glob phases
`<vault>/<projects_glob>/Phases/*.md`. Read frontmatter for each.

### Step 2 — Pick candidates

The set of **resettable tags** is: `phase-blocked`, `phase-active`, `phase-planning`.

- **No arg** (default): every phase whose `tags[]` contains `phase-blocked`.
- **Arg supplied**: phases where (`phase_name` contains arg case-insensitively OR `phase_number == arg`) AND tags contain any resettable tag.

If candidates is empty:
- No arg → `No blocked phases found.`
- With arg → `No phase found matching "<arg>"`.
- Exit cleanly.

### Step 3 — Reset each candidate

For each candidate phase file:

1. **Clear lock fields** in frontmatter:
   - `locked_by: ""`
   - `locked_at: ""`
2. **Swap tag**: replace any of `phase-blocked` / `phase-active` / `phase-planning` with `phase-ready` in `tags[]`.
3. **Set state/status**: `state: ready`, `status: ready`.
4. **Reset `replan_count`** to 0 (if the field is present).
5. Bump `updated:` to current ISO timestamp.

### Step 4 — Print

For each reset phase:
```
  reset: [<project_id>] <phase_label> → phase-ready
```
Where `phase_label` is `phase_name` or the file basename.

## Post-conditions
- Each candidate phase has tag `phase-ready`, lock fields cleared, replan_count reset.
- No body content changed.
- Phase becomes immediately picked up by `onyx run` / `next`.

## Skills invoked
None.

## Tools invoked
None.

## Native primitives relied on
- **Glob** — phase discovery.
- **Read** — frontmatter parse.
- **Edit** — frontmatter writes (atomic per phase).

## Acceptance (self-check)
- Every candidate phase's tags now contain `phase-ready` and not the resettable tag.
- Lock fields are blank strings on each.
- `replan_count` is 0 on each (when present).
- Bodies unchanged.

## Shadow-mode comparison criteria
**RED:** different set of phases reset, different tag swap, lock fields not cleared, replan_count not reset.
**YELLOW:** wording of the print line.
**GREEN:** identical frontmatter shape after reset.

Three GREEN runs → graduate, delete `src/cli/reset.ts`.

## Forbidden patterns
- **Never** reset a `phase-completed` phase. Completed is terminal; the operator must explicitly clone or new-phase it to re-do work.
- **Never** modify body content. Reset is frontmatter-only.
- **Never** lose the `## Human Requirements` content — leave it in place for archival; the operator decides whether to clear it manually.
