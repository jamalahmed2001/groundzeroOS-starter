---
title: monthly-rollup
tags: [skill, onyx-runtime, planner, knowledge]
type: skill
replaces: src/cli/monthly-consolidate.ts (the rollup portion; CLI wrapper stays thin)
lines_replaced: 280
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: monthly-rollup

> Turn a month's worth of daily notes into a single Monthly Overview — a human-readable review that makes it safe to archive or delete the dailies.

## Purpose
Each day produces a `Daily - YYYY-MM-DD.md` note. Over a month, that's 28–31 files, most of which stop being useful after a week. This skill synthesises the month into one Monthly Overview file — themes, decisions, wins, gotchas, open threads — so the dailies become archivable without information loss.

## Inputs
- `vault_path: string`
- `month: string` — `YYYY-MM` format. If null, default to the previous calendar month.
- `prune: bool` — if true, move source dailies to `09 - Archive/Daily Archive (Legacy)/` after producing the Overview.

## Outputs
- `overview_path: string` — path of the written Monthly Overview file
- `daily_count: int` — number of daily notes consolidated
- `pruned_count: int` — number of dailies archived (0 if `prune=false`)

## Algorithm

### Step 1 — Resolve month
If `month` arg not provided, compute previous calendar month from current UTC time: e.g. on `2026-04-24` without arg → `2026-03`. Format: `YYYY-MM`.

Label for the overview title: formatted as "March 2026" (en-GB, UTC).

### Step 2 — Locate daily files
Primary location: `<vault>/04 - Planning/Daily - <YYYY-MM>-*.md`.
Legacy fallback: `<vault>/09 - Archive/Daily Archive (Legacy)/Daily - <YYYY-MM>-*.md`.

Use Glob. If primary is empty, fall back to legacy. Sort by filename.

If zero files found → log `monthly-rollup: no dailies for <month>` and return early with `daily_count: 0`.

### Step 3 — Clean each daily
For each file:
1. Strip YAML frontmatter.
2. Remove noise blocks by regex:
   - `## Prayer Times` … until next `## ` or EOF.
   - `## Schedule (mode: ...` … until next `## ` or EOF.
   - `## Project Time Budgets` … until next `## ` or EOF.
3. Remove stray `UP: ...` lines.
4. Trim.

Result: the signal-only content of each daily.

### Step 4 — Chunk + summarise
Dailies individually can be 2–10KB; a month's worth is 50–250KB. Chunk into groups small enough to fit the LLM context:

1. Group dailies into chunks of ~8–10 files OR ~20KB, whichever smaller.
2. For each chunk, call the LLM with this prompt:
   ```
   You are reviewing a portion of daily notes from <month label>.
   Summarise this chunk into:
   - Themes (recurring topics or projects)
   - Decisions (any locked choices; format: "Chose X over Y because Z")
   - Wins (shipped things, breakthroughs)
   - Gotchas (blockers, failed attempts, surprises)
   - Open threads (started but unresolved)
   
   Concrete and specific — no vague prose. Bullet points. Skip empty sections.
   
   Dailies (chronological):
   <chunk content>
   ```
3. Collect per-chunk summaries.

### Step 5 — Final rollup
Send the collected chunk summaries back to the LLM:
```
Produce a single Monthly Overview for <month label> from these chunk summaries.

Format:
# <Month Label> — Monthly Overview

> One-sentence executive summary.

## Themes
- ...

## Decisions
- ...

## Wins
- ...

## Gotchas
- ...

## Open threads
- ...

## Projects touched
Bullet list of project names that appeared this month.

Rules:
- Deduplicate across chunks — if a theme appears in multiple chunks, one bullet.
- Preserve concrete specifics (dates, numbers, named tools).
- No references to individual daily notes — this is a standalone document.
- Skip a section entirely if genuinely empty.

<chunk summaries>
```

### Step 6 — Write the Monthly Overview
Path: `<vault>/09 - Archive/<Month Label> - Monthly Overview.md`.

Frontmatter:
```yaml
---
title: <Month Label> - Monthly Overview
type: monthly-overview
month: <YYYY-MM>
tags:
  - monthly-overview
  - status-active
up: Monthly Overviews Hub
created: <now ISO>
updated: <now ISO>
daily_count: <N>
---
```

Body: the LLM output from Step 5.

### Step 7 — Prune (optional)
If `prune=true`:
1. Ensure target dir exists: `<vault>/09 - Archive/Daily Archive (Legacy)/`.
2. Move each source daily there via Bash `mv`.
3. Count moves.

If `prune=false`: leave dailies in place.

### Step 8 — Log
Call `tools/write-exec-log.sh`:
```
--status CONSOLIDATE
--project -
--phase -
--summary "monthly-rollup month=<YYYY-MM> dailies=<N> pruned=<M>"
```

### Step 9 — Return
Return `{ overview_path, daily_count, pruned_count }`.

## Invariants

- Never delete a daily note (archive only — `mv`, never `rm`).
- Monthly Overview is written once per month — if the target already exists, append `-v2`, `-v3`, etc. or ask human before overwriting.
- `created:` and `updated:` both set to the run time (Monthly Overview is a fresh document).
- Prune is opt-in — default is non-destructive.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `no_dailies` | Zero daily files found for the month | Log and exit; no overview written. |
| `llm_timeout` | Chunk or rollup call times out | Retry once; if still fails, write partial Overview with best-available chunk summaries + warning comment. |
| `prune_move_failed` | `mv` of a daily fails (permissions) | Skip that file; continue; report in `pruned_count` as less than `daily_count`. |
| `target_exists` | Monthly Overview already exists at target | Append `-v2` suffix; do not overwrite. |

## Examples

**Example 1 — typical end-of-month run:**

Input: `month=null` (defaults to prev month), `prune=true`, run on 2026-05-02.

Finds 29 daily files under `04 - Planning/` matching `Daily - 2026-04-*.md`. Chunks into 3 groups. Produces per-chunk summaries, then the final rollup. Writes `09 - Archive/April 2026 - Monthly Overview.md`. Moves all 29 dailies to legacy archive.

Returns: `{ overview_path: ".../April 2026 - Monthly Overview.md", daily_count: 29, pruned_count: 29 }`.

**Example 2 — explicit month, dry-run mode:**

Input: `month="2026-03"`, `prune=false`.

Consolidates March 2026 dailies, writes overview, leaves dailies in place. Useful for reviewing the overview quality before pruning.

**Example 3 — no dailies:**

Input: `month="2026-06"` (a month that hasn't happened).

Glob returns empty. Log `monthly-rollup: no dailies for 2026-06`. Return `{ daily_count: 0 }`. No file written.
