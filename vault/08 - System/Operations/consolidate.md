---
title: consolidate
tags:
  - system
  - operation
  - onyx
  - consolidate
type: operation-directive
version: 1.0
created: 2026-04-24
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: consolidate

> **One operation. One principle.** Take a folder (or set) of children, produce **one parent node that contains everything important from them**, archive the children. The model is the consolidated AI Sentiment Analysis pt3 node — that shape, but the agent reads the actual content and picks the right form for each section (prose for narrative, tables for structured rows, lists for sets, verbatim `<details>` for full-fidelity preservation).
>
> **Context orchestration is the central principle.** Read every child in full. Distil to a denser form. Never lose a fact, decision, gotcha, or path. Don't consolidate something that shouldn't be — gates first, work second.

## When to invoke

A consolidation is right whenever:

- A bundle of work has reached a stop state (project shipped, episode rendered, album distributed, experiment closed, show retired).
- A folder of atomic-unit children has produced its outputs and the parent is the canonical reference (per-shot files under a shipped episode, per-track files under a distributed album, per-iteration files under a closed research project).
- A working space has accumulated dozens of files that, taken together, are one thing — and continuing to leave them as separate graph nodes adds noise without adding navigation value.

The trigger is **one of**:
- Parent node frontmatter has `consolidation_state: complete` (explicit).
- Parent's `status:` is in the shipped-set: `complete | shipped | rendered | delivered | mastered | distributed | produced | closed | abandoned`.
- Manual invocation with `--force` (last resort, surfaced in ExecLog).

If neither holds, **don't consolidate** — it's still active work.

## Inputs

- `parent_target: string` — where the consolidated content lands. Two cases:
  - **Existing file** (e.g. shipped episode `E01 - The Night the Rift Opened.md`): augment in place. The episode keeps its identity; the consolidated content goes into its body.
  - **New path** (e.g. `Example Show - Consolidated.md` beside an abandoned bundle folder): create a fresh consolidated node.
- `children: folder | string[]` — the folder of children OR an explicit list of files. The folder gets walked; explicit lists let the caller include sources from multiple folders (e.g. `Shows/Example Show/` + `Episodes/Example Show/`).
- `archive_dir: string` — where children move on apply. Default: `<parent-folder>/_archive/<consolidation_date>/<children-folder-basename>/`.
- `dry_run: bool` — default `true`. Always dry-run first. Apply only after the human reviews the plan.
- `force: bool` — default `false`. Bypass the trigger check. Used when frontmatter is stale but the human knows the work is done (e.g. AI Sentiment pt3 had `status: active` Overview but the user said "it's shipped").

## Output

A single parent node containing **everything important from the children**, structured intuitively. The agent reads each child in full and composes section by section. Sections present when their data is present, omitted when it's not — same template adapts to engineering bundles, content episodes, music albums, research projects, abandoned concepts.

### Section template (inspired by AI Sentiment Analysis pt3, refined)

```markdown
## Overview

A faithful 2–4 paragraph synthesis: what this work was, why it happened, what shape it took. Pull from the parent's existing Overview body, the children's introductions, the Knowledge.md if present. Concrete-over-abstract.

## Final state

What now exists in the world that didn't before. Bullet list:
- Deployed services / repo paths / Linear tickets (engineering)
- Published outputs / distributor URLs / file paths (content)
- Final write-ups / decisions recorded (research)
- Result / measurement (personal protocol)

## Children

The agent picks the right shape based on what the children look like:

- **Narrative children** (phases with rich body content, drafts with iterations) → per-child paragraphs naming what it built / what it tried / what landed.
- **Structured children** (shots with frontmatter rows, takes with metadata) → table with one row per child, columns mapped from frontmatter.
- **Mixed** (some narrative, some structured) → table for the structured, prose for the narrative.
- **Many tiny** (50+ shot files, 12 takes per track) → table primary, prose summary at the top noting volume + pattern.
- **Few rich** (8 phases each with a 200-line plan + log) → per-child paragraphs primary, key decisions extracted.

In all cases: a `<details>`-collapsed verbatim block beneath each child summary linking to the archived original, OR (for tabular children) a single `<details>` block listing all archives.

## Activity timeline

If the bundle has logs (`type: project-log` or `type: log`) — a per-log distillation in chronological order. 5-bullet summary of meaningful events; original log body verbatim under `<details>`. Skip Linear-uplink chatter; surface real milestones.

## Knowledge

Verbatim copy of any `Knowledge.md` body if present. Already curated (phase-level consolidates feed it). If absent, agent extracts learnings/decisions/gotchas from the children's bodies and presents them organised.

## Decisions / Gotchas

Auto-collected from children frontmatter (`decisions:` / `gotchas:` lists if present) + Knowledge.md sections of those names + agent-extracted from log bodies. Deduped, chronological.

## References

External wikilinks (pointing OUTSIDE the bundle) pulled from Overview + Knowledge bodies. Useful for research bundles where the cross-references are half the value.

## Source manifest

| # | Path | Kind | Bytes | sha256 (8) |

Every child gets one row. Full hashes preserved in frontmatter `consolidated_from_sha:`. **Mandatory** — this is the audit trail.

## Archive

One-line restoration commands. `_archive/<date>/` has every child verbatim.
```

**The agent omits sections silently when their data isn't present.** A research bundle without phases skips `## Children` (or repurposes it for free-form notes). A media bundle without phase logs skips `## Activity timeline`. A consolidation of just shots into an episode adds `## Shots` table only — the episode body's existing sections stay untouched.

## Procedure

### Step 0 — Pre-flight gates

1. Validate `parent_target` resolution and `children` are accessible.
2. Check parent's `status:` (or `consolidation_state:`) against the trigger conditions. If neither holds AND `force=false` → halt with `not_ready`.
3. Walk children. Any child with `status: active | blocked | regen-pending | required` → halt with `children_in_flight: [paths]` UNLESS parent is in shipped-set (parent wins; child statuses are stale, not authoritative).
4. Check idempotency markers on parent:
   - `consolidation_state: applied` (whole-bundle consolidation)
   - `<atom>s_absorbed_count: <N>` (per-atom-kind absorption)
   - If a marker matches the children scope → halt as `already_consolidated`.
5. If any child lacks a kind tag → halt with `unclassified_sources` (run [[heal-kind-tag]] first).
6. Capture `now_iso` for the run.

### Step 1 — Read every child in full

Not just frontmatter. The full body. The agent will pick what's load-bearing per section. Frontmatter alone misses the decisions, the false starts, the unique phrasings worth preserving verbatim.

For each child, build a record: `{ path, rel_path, bytes, sha256, frontmatter, body, kind_tag }`.

### Step 2 — Compose the body, agent-driven

Apply the **8 general principles** (verbatim — these don't change by tier or atom kind):

1. **Concrete over abstract.** "Implemented thumbs API in `feedbackRouter.ts` via `creatorProcedure`" beats "added feedback".
2. **What changed in the world.** Each summary names what now exists.
3. **Why, not what, when relevant.** Decisions worth preserving include the *reason*.
4. **Failure teaches.** Capture gotchas, blockers, retries, false starts.
5. **Faithful, not promotional.** If a phase shipped 60% of intent, say so. If a track was abandoned, say so.
6. **The future-reader test.** Imagine the reader 18 months later trying to remember.
7. **Direct quotes for unique voice.** Quote specific phrases verbatim — don't paraphrase.
8. **Cross-link sparingly.** External wikilinks belong in `# References`, not buried mid-prose.

For each section in the template above, the agent:
- Decides whether the section applies (data present in children?).
- Picks the right shape (prose / table / list / mixed).
- Composes the content following the principles.
- Embeds verbatim `<details>` blocks for full-fidelity preservation alongside summaries.

### Step 3 — Coverage check

`coverage_ratio = composed_body_bytes / consolidatable_source_bytes` where `consolidatable_source_bytes` excludes hubs (nav-only), `directive` files, `context-only` files.

Floor: **0.20**. Below → halt as `coverage_below_threshold`. The verbatim `<details>` blocks under summaries keep ratios well above floor in practice.

Additional integrity check: every child appears in the source manifest with its sha256. If any child is in the discovered list but missing from the composed manifest → halt as `manifest_dropped_source`.

### Step 4 — Dry-run report

Always returned before any writes. Plan format:

```
=== consolidate DRY RUN ===
Parent target:   <path>  (existing|new)
Children:        <N> files / <bytes> total
By kind:         { onyx-phase: 8, project-log: 8, onyx-shot: 30, ... }
Estimated body:  ~<bytes> (sections: Overview, Final state, Phases, Activity timeline, Knowledge, Decisions, Source manifest, Archive)
Coverage ratio:  <pct>%  (floor 20%)
Archive dir:     <path>
Wikilink rewrite scope: ~<estimate>
Detections:      [...]
Disposition:     would proceed | would halt: <reason>
```

Halt for human review unless `--auto` was passed (only set after a clean dry-run was approved).

### Step 5 — Apply (only when `dry_run: false`)

Five passes, in order. **Never delete; always `git mv` to `_archive/`.**

**Pass A — Write target.**
- Existing file: insert/merge composed sections into parent body. Bump `updated:`. Add idempotency markers.
- New file: write fresh consolidated node with frontmatter + body + nav block + sections.

**Pass B — Verify.**
1. Re-read target. Frontmatter parses. Manifest length matches child count.
2. Spot-check first 3 children's sha256 by re-hashing source files (still in place pre-archive).
3. Coverage recomputed from written body ≥ floor.
- Failure → halt; target retained for inspection; **sources NOT archived**.

**Pass C — Archive children.**
- `mkdir -p <archive_dir>`.
- Move children in dependency order: leaves first, hubs next, parent (if it's an Overview being absorbed) last.
- `git mv <source> <archive_dir>/<rel>` — fall back to plain `mv` if not in a git repo.
- After all moves, `rmdir` empty source folders.

**Pass D — Vault-wide wikilink rewrite.**
- Walk every `.md` in the vault (skip `_archive/`, `.git/`, `.obsidian/`, `.trash/`, target itself).
- For each archived child basename, rewrite `[[<basename>]]`, `[[<basename>|alias]]`, `[[<basename>.md]]`, `[[<basename>\|alias]]` (table-pipe escape) → `[[<target-basename>#<section>]]`. Preserve aliases; preserve table-pipe escape.
- Section anchor mapping by source kind:

| Source kind | Anchor |
|---|---|
| onyx-phase / onyx-operative | `Children` (prose paragraph in Children section) |
| project-log | `Activity timeline` |
| project-knowledge | `Knowledge` |
| onyx-shot / onyx-take / onyx-beat / onyx-iteration | `Children` (table row) |
| pipeline-artefact / onyx-asset | `Final state` |
| Overview | (no anchor — root link to consolidated node) |

**Pass E — ExecLog (one event per consolidation).**

```
<iso> CONSOLIDATE parent="<rel>" children=<N> bytes=<total> kept=<consolidated_body_bytes> coverage=<pct>% archived_to="<rel>" wikilinks_rewritten=<K>
```

Per-source archive lines NOT emitted — the source manifest in the parent body IS the audit trail.

### Step 6 — Post-verify (light)

1. Run [[heal-fractal-links]] scoped to the parent's folder. Expect zero new dangling refs.
2. Run [[heal-kind-tag]] on the target. Expect canonical kind tag.
3. If either fails → record `verify_failed_post_apply`. **No automatic rollback** — sources are in `_archive/`; restore via `git mv` if needed.

## Invariants — the "no context lost" guarantees

- **Idempotent.** Re-running on the same inputs is a no-op (idempotency markers short-circuit Pass A).
- **Never hard-deletes.** All children `git mv` to `_archive/`. Reversible at all times.
- **Never auto-rolls-back.** Verify failures halt and surface; the human chooses whether to restore.
- **Children verified before archive.** SHA spot-check in Pass B happens BEFORE Pass C moves any file.
- **Wikilinks preserved.** Pass D ensures every link that pointed at a child now redirects to the parent + section anchor.
- **Aliases preserved.** Even when rewriting, `[[Old|alias]]` becomes `[[New#anchor|alias]]`.
- **No silent drops.** Every child is in the manifest with its sha256, OR in the body, OR in a `<details>`-collapsed verbatim block. Always findable.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `not_ready` | Parent status doesn't match trigger conditions, no `--force` | Halt; surface what would unlock it. |
| `children_in_flight` | Children have in-progress status AND parent isn't shipped | Halt with offending paths. |
| `unclassified_sources` | A child lacks a kind tag | Halt; recommend [[heal-kind-tag]] first. |
| `already_consolidated` | Idempotency marker present | Exit cleanly. |
| `coverage_below_threshold` | Composed body < 20% of source bytes | Halt; surface ratio. Caller may adjust principles or skip. |
| `manifest_dropped_source` | Child discovered but missing from composed manifest | Halt; bug in composition. |
| `verify_failed` | Pass B mismatch | Halt; target retained, sources NOT archived. |
| `archive_move_partial` | >10% of `git mv` calls fail | Halt before Pass D. |
| `verify_failed_post_apply` | Step 6 heal detects new issues | Surface; no auto-rollback. |

## Discovery (for routine scans)

The weekly routine needs to find candidates without manual nomination. Discovery rules — pure-read, no writes:

1. Glob every parent file across `02 - <workplace>/**`, `03 - Ventures/**`, `10 - OpenClaw/**`, `01 - Life/**`. Parent files are: `*Overview.md`, `* - Show Bible.md`, `*Bible.md`, `Episodes/*/E\d+ *.md`, `Albums/*/* - T\d+ *.md`.
2. For each parent, check trigger conditions (status / consolidation_state).
3. Locate associated children:
   - Sibling folders matching `<parent-id> - *` (e.g. `E01 - shots/`, `E01 - storyboards/`)
   - Sub-folder matching `<parent-id>/*/` (e.g. `E03/shots/`, `E03/reviews/`)
   - For Overview-style parents: the entire bundle folder is the children scope.
4. Skip if children are empty (no .md), if idempotency markers are present, if pre-flight gates fail.
5. Rank by readiness (more children = higher priority).

The weekly routine globs once, then invokes `consolidate` per candidate parent + children pairing.

## What this operation does NOT do

- **Hard-delete** anything. Always `_archive/<date>/`.
- **Run on still-active work.** The trigger gate is hard.
- **Generate creative content.** Composition surfaces what's actually in the children; never embellishes.
- **Cross domains.** One parent + its children. Cross-bundle consolidation is a separate human decision.
- **Routinely process unmarked bundles.** No `--force` in the weekly scan.

## Native primitives

- **Glob** — children, vault wikilink scan.
- **Read** — every child in full.
- **Write** — target node creation OR insert into existing parent.
- **Edit** — wikilink rewrites.
- **Bash `git mv` / `mv` / `mkdir -p` / `rmdir`** — archive moves.
- **`sha256sum`** — verification.

## Examples

### Example 1 — Engineering project shipped (AI Sentiment Analysis pt3)

- `parent_target = <workplace> Core/AI Sentiment Analysis pt3 - Consolidated.md` (new path)
- `children = AI Sentiment Analysis pt3/` (entire bundle: Overview, Knowledge, Kanban, 8 phases, 8 logs, 2 hubs)
- Result: agent-composed prose node with Overview / Final state / Children (per-phase paragraphs) / Activity timeline (per-log) / Knowledge / Decisions / Source manifest / Archive sections. 47 KB consolidated node from 110 KB of sources.

### Example 2 — Cartoon episode shipped (E01 Example Show)

- `parent_target = E01 - The Night the Rift Opened.md` (existing file — augment)
- `children = E01 - shots/` (30 shot files)
- Result: episode body gains a `## Children` section as a 30-row table (shot, status, scene intent, narrator, duration, Veo model, keyframe, audio, verdict). Existing episode body untouched. 30 shots archived. Episode grew 290%.

### Example 3 — Show retired (Example Show)

- `parent_target = My Show/Example Show - Consolidated.md` (new path)
- `children = [Shows/Example Show/, Episodes/Example Show/]` (cross-folder list — show bible + 4 episode drafts + hub)
- Result: agent-composed prose node — tells the story of the abandoned concept, preserves the 5 mandatory legal gates, catalogs the 4 E01 attempts, names what carried forward to The Example Show. 12 KB from 139 KB of sources.

### Example 4 — Suno album distributed (hypothetical)

- `parent_target = My Album/Albums/Late Check-In - Consolidated.md` (new path)
- `children = Late Check-In/` (album Overview + 9 tracks + per-track takes folders if present)
- Result: agent-composed node — album narrative, per-track lyrics + Suno generation prompts, mix decisions, distributor IDs, cover art reference. Sub-bundles (per-track takes) consolidate first (bottom-up) then folded into the album consolidation.

### Example 5 — Phase-level (legacy tier-1 use)

- `parent_target = AI Sentiment Analysis pt3 - Knowledge.md` (existing)
- `children = [single phase file + its log]`
- Result: Knowledge.md gains a dated entry block under `## Learnings` / `## Decisions` / `## Gotchas`. No archival (phase files stay; this is a knowledge merge, not a bundle collapse).

The same operation handles all five cases. The agent reads the children, sees what's there, composes the right shape, archives where appropriate.

## Migration / rollout

- v1.0 (this version, 2026-04-27): unifies the previously-separate `consolidate-bundle` and `consolidate-children` operations into one. The previous tier/mode distinctions were artificial — the operation is the same regardless. Both `consolidate-bundle.md` and `consolidate-children.md` are retained as **redirects** for any wikilinks pointing at them.
- Existing applied artefacts (AI Sentiment pt3, Example Show, E01 + E02 shot tables) work unchanged — same idempotency markers, same archive paths.
- The weekly scan routine now invokes `consolidate` per candidate (no tier branching).
