---
title: monthly-consolidate
tags:
  - system
  - operation
  - onyx
  - consolidate
type: operation-directive
replaces: src/cli/monthly-consolidate.ts
lines_replaced: 307
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

# Operation: monthly-consolidate

> Roll up a month's daily plans into a single human-readable monthly overview, optionally archive (or hard-delete) the source dailies. Different from [[08 - System/Operations/consolidate.md|consolidate]] (which folds project bundles); this op is scoped to `04 - Planning/Daily - YYYY-MM-DD.md` files only.
>
> The TS version made chunked OpenRouter calls (6 dailies per chunk → JSON summary → merge). The directive version uses the running agent directly: ingest all the dailies in one read, write the overview, no chunking needed.

## Preconditions
- A vault exists with `04 - Planning/` (or legacy `09 - Archive/Daily Archive (Legacy)/`) containing files matching `Daily - YYYY-MM-DD.md`.
- For the target month, at least one daily file exists.

## Invocation context
- Operator: `onyx monthly-consolidate [YYYY-MM] [--prune] [--delete-dailies] [--keep-noise]`.
- Scheduled: routine cron in [[reference_onyx_routines.md|onyx scheduled routines]] runs this at the start of each month for the previous month.

### Args
| Arg | Effect |
|---|---|
| `YYYY-MM` (positional) | Target month. Defaults to **previous calendar month**. |
| `--prune` | After writing the overview, **move** daily files into `09 - Archive/Daily Archive/<YYYY-MM>/`. Default: leave dailies in place. |
| `--delete-dailies` | Combined with `--prune`, **hard-delete** dailies instead of moving. Both flags required. |
| `--keep-noise` | Skip the noise-reduction pass. Default: strip Prayer Times, Schedule, and Project Time Budgets sections before passing to the agent. |

## Read order
1. This directive.
2. Every `Daily - <YYYY-MM>-*.md` file in `04 - Planning/` (or legacy archive if primary is empty).
3. (If exists) `09 - Archive/February 2026 - Monthly Overview.md` as a style reference.

## Procedure

### Step 1 — Resolve target month + locate dailies

Default month: previous calendar month in YYYY-MM (compute from current UTC date).

Glob:
```
<vault_root>/04 - Planning/Daily - <YYYY-MM>-*.md
```

If empty, fall back to:
```
<vault_root>/09 - Archive/Daily Archive (Legacy)/Daily - <YYYY-MM>-*.md
```

Sort alphabetically (= chronological for `Daily - YYYY-MM-DD` filenames).

If still empty → print `[onyx] No daily plans found for <YYYY-MM>` and exit cleanly.

### Step 2 — Strip noise (unless `--keep-noise`)

For each daily file, read it and remove:

- **Frontmatter block** — strip the leading `---` ... `---`.
- **Prayer Times section** — `## Prayer Times` heading and its body up to the next `##`.
- **Schedule (mode: …) section** — `## Schedule (mode: …` and its body.
- **Project Time Budgets section** — `## Project Time Budgets` and its body.
- **Stray `UP:` lines** — any line matching `^UP:\s.*$` (case-insensitive).

The remaining content is the day's actual log: notes, achievements, decisions, observations.

### Step 3 — Read all dailies (no chunking required)

The TS path chunked dailies in groups of 6 to fit within OpenRouter's prompt window. The agent running this directive can hold an entire month's dailies (~30 files × ~3KB after noise strip ≈ 90KB) in one read. Read them all.

If the month somehow has more than ~50 dailies (catch-up runs, legacy backfill), do one read per 30-day chunk and merge in step 5 — but for routine monthly operation, one read suffices.

### Step 4 — Compose the monthly overview

Read the **style reference** if it exists at `09 - Archive/February 2026 - Monthly Overview.md`. This anchors voice and section structure to a known good shape; use it for tone, not for content.

Write the overview body (markdown, no frontmatter — added in Step 5) with these **mandatory sections in this order**:

```markdown
## 📊 Monthly Summary

A 4-6 sentence narrative of the month. What did the operator actually
do? What shipped? What changed?

## 🎯 Key Achievements

Concrete things finished. Bullet list. 5-12 items. Not "made progress on X" —
"shipped X v2 with feature Y", "renamed Z, removed unused dep W".

## 🧠 Strategic Decisions

Decisions whose effect outlasts this month. Format each as:
- Chose <X> over <Y> because <Z>
3-8 items. Skip if no real decisions surfaced.

## 🔄 Recurring Patterns

Things that came up more than once across the dailies. "I keep <X>",
"<Y> always breaks the same way", etc. 0-5 items.

## 💡 Key Learnings

Insights worth remembering next month. Specific, not generic.
"<X> doesn't work because <Y>; do <Z> instead." 3-8 items.

## ⚠️ Gotchas

Specific failure modes encountered. Format: "<X> fails when <Y>;
the fix is <Z>." 0-5 items.

## Open loops / Next month handoff

Unfinished work that should carry forward. Be explicit:
- Pending: <thing>
- Blocked on: <person/decision/event>
- Needs: <missing input>
3-10 items.
```

**Critical constraints:**
- **No links back to the daily notes.** They will be archived/deleted; the overview must stand alone.
- **No frontmatter in the body.** Step 5 prepends it.
- **No title heading.** Step 5 prepends it.
- **No code fences wrapping the markdown.** Pure markdown.
- **Skim-ready.** The whole thing should fit in one screen; tight bullets, no padding.

### Step 5 — Wrap with frontmatter + nav + title

Compose the final file:

```markdown
---
tags: [monthly-review, consolidated]
graph_domain: review
created: <YYYY-MM-DD>
status: complete
project: Monthly Planning
---

# <Month YYYY> - Monthly Overview

## 🔗 Navigation

**UP:** [[04 - Planning/Monthly Overviews Hub.md|Monthly Overviews Hub]]

---

<body from Step 4>
```

`<Month YYYY>` is the long-form label, e.g. `April 2026`.

### Step 6 — Write to disk

Path: `<vault_root>/09 - Archive/<Month YYYY> - Monthly Overview.md`. Create the `09 - Archive/` directory if it doesn't exist.

Verify the file is **at least 2,000 bytes**. If it's smaller, abort the optional prune step (Step 8) — a tiny overview signals an LLM failure and we shouldn't delete daily evidence.

### Step 7 — Update the Monthly Overviews Hub

Path: `<vault_root>/04 - Planning/Monthly Overviews Hub.md`.

If it doesn't exist, skip this step (the hub is created elsewhere; this op doesn't bootstrap it).

If it exists, ensure a wikilink to the new overview is present. Look for `## Monthly Overviews` heading; insert `- [[09 - Archive/<Month YYYY> - Monthly Overview]]` immediately after the heading (chronological order — newest first).

### Step 8 — Prune dailies (only if `--prune` flag)

If the operator passed `--prune`:

- **`--delete-dailies` also passed:** hard-delete each `Daily - <YYYY-MM>-*.md` file from `04 - Planning/` (and legacy archive). Print `[onyx] DELETED <N> daily plans (<YYYY-MM>)`.
- **`--prune` alone:** move each daily into `09 - Archive/Daily Archive/<YYYY-MM>/<basename>`. Create the dir. If a target file already exists (collision), suffix the moved file with `.<unix-ms>`. Print `[onyx] MOVED <N> daily plans (<YYYY-MM>)`.

Skip pruning entirely if Step 6 wrote a small (< 2KB) overview — that's a guardrail against losing daily evidence after an LLM failure.

### Step 9 — Print + return

```
[onyx] ✅ Wrote: <path>
[onyx] (counters: <N> dailies summarised, <M> archived/deleted)
```

Print on stdout. Return `{ path, dailies_count, pruned_count }` for the caller's ExecLog.

## Post-conditions & transitions
- A `<Month YYYY> - Monthly Overview.md` exists in `09 - Archive/`.
- Monthly Overviews Hub gained a wikilink to it (if the hub exists).
- Optionally: dailies for that month moved to Daily Archive or hard-deleted.
- No phase status changes.

## Error handling
- **RECOVERABLE:** a daily file is malformed (e.g. broken frontmatter) → skip its content past the strip step but keep its filename in the daily list; the agent can still note `(file <X> unreadable)` in the overview if relevant.
- **BLOCKING:** zero dailies for the target month → exit with a clear message; do not write a stub overview.
- **GUARDRAIL:** overview file < 2KB → refuse to prune dailies. The dailies stay; the operator inspects the small overview and decides whether to retry.
- **NEVER COMBINE `--delete-dailies` with a < 2KB overview.** The guardrail catches this; even if `--delete-dailies` was passed, no deletes happen.

## Skills invoked
None — agent-native. The agent IS the LLM that summarises.

## Tools invoked
None irreducible. The directive uses native primitives.

## Native primitives relied on
- **Glob** — discover daily files.
- **Read** — every daily, the style reference, the existing hub.
- **Bash** — `mkdir -p` for archive directory, `mv` for prune, `rm` for delete, `stat -c%s` for the size guardrail.
- **Write** — the new overview.
- **Edit** — Monthly Overviews Hub link insertion.

## Acceptance (self-check before exit)
- The overview file exists at the expected path.
- It has all 7 mandatory sections.
- Frontmatter has `created`, `tags`, `status: complete`, `project: Monthly Planning`.
- Title + nav block present.
- File is ≥ 2KB.
- (If `--prune`) Daily Archive contains the moved files OR they're deleted.
- (If hub exists) Hub has a new wikilink to the overview.

## Shadow-mode comparison criteria

For each shadow run (`tools/shadow-run.sh monthly-consolidate "<Daily - YYYY-MM-01.md>"`):

- **RED:**
  - Different filename written (the path naming is deterministic from the month label).
  - Different mandatory sections present (all 7 must exist).
  - Different counts of dailies pruned/deleted.
  - Hub link missing when hub exists.
  - File written but < 2KB and pruning still happened (guardrail violation).
- **YELLOW:**
  - Wording of the body content (LLM output varies).
  - Order of bullets within a section.
  - Number of bullets per section (TS path's chunked-then-merged shape vs directive's single-pass shape may produce slightly different bullet counts).
- **GREEN:** all 7 sections present, file ≥ 2KB, frontmatter correct, hub updated, prune-guardrail respected.

Three GREEN runs across distinct months → graduate to `status: active`, delete `src/cli/monthly-consolidate.ts`.

## Forbidden patterns
- **Never write back-links to the daily notes** in the overview body. Dailies are leaf nodes; the overview replaces them in the graph.
- **Never wrap output in code fences.** The Step 4 output is pure markdown going straight into the file.
- **Never include YAML frontmatter inside the LLM-generated body.** Step 5 owns the frontmatter; the body is body-only.
- **Never prune without `--prune`.** The default is non-destructive — the operator opts into archive/delete explicitly.
- **Never bypass the 2KB size guardrail.** A small overview means the LLM call failed; deleting dailies in that state would lose data.
- **Never call OpenRouter directly.** The agent IS the LLM — read the dailies, write the overview, no separate model call.
