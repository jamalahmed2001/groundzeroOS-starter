---
title: heal-kind-tag
tags:
  - skill
  - onyx-runtime
  - heal
type: skill
version: 0.1
created: 2026-04-27
updated: 2026-04-27
status: active
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[Agent Skills Hub|Agent Skills Hub]]

# Skill: heal-kind-tag

> Classifies every markdown node in the vault with the **canonical structural-kind tag** from [[Tag Convention]] §1.1. Drives the colour-coded graph view: phases blue, operatives indigo, directives violet, hubs purple, shows pink, etc. Routine; runs every heal iteration.

## Purpose

Every node in the graph must declare what it *is* — phase, operative, directive, log, knowledge, hub, show, episode, track. Without a structural-kind tag, the graph collapses into one undifferentiated colour. This skill assigns the right tag based on file location + name pattern, deterministically, with zero LLM judgement.

## Inputs

- `vault_path: string`
- `scope_glob: string` — default `"{02 - <workplace>/**,03 - Ventures/**,10 - OpenClaw/**,01 - Life/**,08 - System/**}"`. Walks one folder tree at a time when scoped down.
- `dry_run: bool` — default `false`. Reports planned writes; no Edits.

## Outputs

- `applied: KindAssignment[]` — `{ path, derived_kind, derivation_rule }[]`
- `detections: Detection[]` — `{ path, reason }[]` — files where no rule fits or multiple fit
- `errors: ErrorRecord[]`

## Derivation rules (priority order)

For every `.md` file in scope (excluding `.git/`, `node_modules/`, `.obsidian/`, `.onyx-backups/`, `.trash/`, and any file carrying `context-only` tag), test rules **in this order** and apply the first match.

**Order rationale:** structural patterns (hubs, media-bundle children, directives) must match before generic patterns (phase, overview), or specific files get misclassified. Example: `My Show - Phases Hub.md` lives in `Phases/` — without hubs first, it would tag as `onyx-phase`. Same for show overviews in `Episodes/<show>/`.

| # | Match | Tag | Family |
|---|---|---|---|
| 1 | Filename matches `* Hub.md` AND folder is a top-level domain (`0X - <Domain>/`) | `hub-domain` | 4 |
| 2 | Filename matches `* Hub.md` AND parent folder is a known sub-domain group (e.g. `<workplace> Core/`, `<workplace> Experiments/`, `Automated Distribution Pipelines/`, `Personal/`, `Paid Projects/`) | `hub-subdomain` | 4 |
| 3 | Filename matches `* Hub.md` (any other location) | `hub-project` | 4 |
| 4 | Frontmatter `type: directive` OR file in `*/Directives/*.md` | `directive` | 2 |
| 5 | Frontmatter `type: artefact` OR file in `*/Outputs/*.md`, `*/Artefacts/*.md`, `*/Renders/*.md` | `pipeline-artefact` | 2 |
| 6 | File in `*/Albums/<album>/` AND filename matches `<album> - T\d+.*\.md` | `onyx-track` | 8 |
| 7 | File in `*/Albums/<album>/` AND filename matches `<album> - Overview.md` | `onyx-album` | 8 |
| 8 | File in `*/Episodes/<show>/` AND filename matches `E\d+.*\.md` | `onyx-episode` | 8 |
| 9 | File in `*/Episodes/<show>/` AND filename matches `<show> - Overview.md` OR `<show> - Bible.md` OR `<show> - Universe Bible.md` OR `<show> - Show Bible.md` | `onyx-show` | 8 |
| 10 | File in `*/Shows/<show>/` AND filename matches `<show> - Bible.md`, `<show> - Universe Bible.md`, or `<show> - Show Bible.md` (any of these acts as the show's Overview-equivalent) | `onyx-show` | 8 |
| 11 | File in `*/Phases/*.md` AND (filename matches `* - O\d+(\.\d+)?\s*-\s*.*\.md` OR frontmatter `phase_id` matches `^O\d+(\.\d+)?$` OR frontmatter `type: operative`) | `onyx-operative` | 2 |
| 12 | File in `*/Phases/*.md` (regular phase, did not match Rule 11; also filename does NOT end in ` Hub.md`) | `onyx-phase` | 2 |
| 13 | File in `*/Logs/` AND filename matches `L\d+ - *.md` | `project-log` | 2 |
| 14 | Filename matches `<X> - Knowledge.md` | `project-knowledge` | 2 |
| 15 | Filename matches `<X> - Kanban.md` | `project-kanban` | 2 |
| 16 | Filename matches `<X> - Decisions.md` OR `<X> - Docs.md` | `project-docs` | 2 |
| 17 | Filename matches `<X> - Overview.md` AND parent dir is a bundle root (contains 2+ sibling files matching `<X> - *.md`) AND parent dir is NOT one of `Episodes/`, `Albums/`, `Shows/` (those are media bundles, handled above) | `onyx-project` | 2 |
| 18 | Frontmatter has `type:` set to one of `convention`, `skill`, `operation-directive`, `profile`, `template`, `dashboard`, `index` | (derived: `convention` → no auto-tag; surface for human; `skill` → no auto-tag; `operation-directive` → no auto-tag) | — |
| 19 | None of the above | emit `detection: kind_unresolved` | — |

### Operative-pattern detection

Operatives are **reusable production stages**, distinct from project phases. They live in `Phases/` for now (legacy) but their identity is operative, not phase. The signature:

- Filename pattern: `<project_id> - O\d+(\.\d+)? - <name>.md` (e.g. `My Album - O1.5 - Lyrics.md`, `My Podcast - O2 - Write script.md`).
- Or frontmatter `phase_id:` matches `^O\d+(\.\d+)?$`.
- Or frontmatter `type: operative`.

When any of these match, the file gets `onyx-operative` (family 2) **instead of** `onyx-phase`. The two kinds are mutually exclusive.

## Algorithm

### Step 1 — Walk vault

Glob `<vault_path>/<scope_glob>` for every `.md`. Skip excluded directories. Skip files with `context-only` tag in frontmatter.

### Step 2 — Per-file classification

For each file:
1. Read frontmatter. If a family-2 OR family-8 kind tag is already present → skip (do not overwrite).
2. Otherwise, walk the rules table in order. First match wins.
3. Record the result in `applied` with the rule number that fired.
4. If no rule fires, record in `detections` with `kind_unresolved` and continue.

### Step 3 — Apply the tag

For each entry in `applied`:
- Read the file's frontmatter.
- Insert the derived tag into the `tags:` list, **at the position dictated by family order** (per [[Tag Convention]] §1 ordering rule).
  - Family 2 tags go after any family-1 (phase-state) tag.
  - Family 8 tags go after family 7 (craft) tags but before any extras.
- If `tags:` doesn't exist, create it.
- Bump `updated:` to the run's `now_iso`.
- Single Edit per file.

### Step 4 — Tag-order normalisation pass

After insertion, walk every modified file once more and re-sort its `tags:` list strictly by family order (1→8). Within the same family, preserve original ordering (stable sort). This is what enforces [[Tag Convention]] §1's "tags appear in frontmatter in family order" rule.

### Step 5 — Tag families lookup

For sorting in Step 4, classify each tag in the file's `tags:` list:

```
family 1: starts with "phase-"
family 2: in {onyx-phase, onyx-operative, onyx-project, directive, project-log, project-knowledge, project-kanban, project-docs, project-doc, project-overview, pipeline-artefact, context-only}
family 3: starts with "status-"
family 4: starts with "hub-"
family 5: in pipeline list (my-podcast, my-album, suno-library, my-show, hitpapers, gzos, …)
family 6: in venture list (fanvue, openclaw, personal, finance, legal)
family 7: tools (elevenlabs, ffmpeg, remotion, audio, video, cli, dashboard, obsidian, …)
family 8: in {onyx-show, onyx-episode, onyx-track, onyx-album, onyx-asset}
unknown: append after family 8 (preserve unrecognised tags but flag in detections)
```

### Step 6 — ExecLog

For each applied tag insertion:
```
<now_iso> HEAL kind-tag:<rule-N>:<derived-tag> path="<rel>"
```

For each detection:
```
<now_iso> HEAL kind-tag:detection:<reason> path="<rel>"
```

## Invariants

- **Never overwrites an existing kind tag.** If a file already has any family-2 or family-8 kind tag, skip the classification entirely. (Manual overrides are sacred.)
- **One Edit per file** — Step 3 insertion + Step 4 reorder coalesce into a single write.
- **`context-only` always wins.** A file with `context-only` is never reclassified — even when its location matches a rule.
- **Operative beats phase.** Rule 12 fires before Rule 13. A file matching the operative pattern never gets `onyx-phase`.
- **Family 2 and family 8 are mutually exclusive.** A track never gets `onyx-phase`; a phase never gets `onyx-track`.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `kind_unresolved` | No rule fired for this file | Detection only. Add to surfacing report. |
| `multiple_kinds_present` | File already has both family-2 AND family-8 tags | Detection. Halt classification for this file; require human disambiguation. |
| `edit_failed` | Frontmatter Edit raises | Skip; record. |

## Examples

### Example 1 — My Album O1.5 lyrics

- Path: `10 - OpenClaw/Automated Distribution Pipelines/My Album/Phases/My Album - O1.5 - Lyrics.md`
- Existing tags: `[onyx-phase, phase-backlog, suno-run, per-album]`
- **Already has `onyx-phase`** — but that's WRONG per the new convention (this is an operative). However, Rule "never overwrite" applies → skipped.
- **Detection emitted:** `tag_kind_mismatch` because filename pattern matches operative (Rule 12) but file already carries `onyx-phase`. Surface for human review.

### Example 2 — My Show E03 episode

- Path: `10 - OpenClaw/Automated Distribution Pipelines/My Show/Episodes/<Show>/E03 - <Title>.md`
- Existing tags: `[my-show, openclaw]` (no kind tag)
- Rule 10 fires: `*/Episodes/<show>/E\d+.*\.md` → `onyx-episode`
- Result: `tags: [my-show, openclaw, onyx-episode]` after insertion; reorder to `[onyx-episode, my-show, openclaw]` per family order (8 → 5 → 6 wait, family 8 goes LAST).

Actually correction — family order is 1→8 ascending, so 5 and 6 come BEFORE 8. Reorder to `[my-show (5), openclaw (6), onyx-episode (8)]`. Final tag list reads top-to-bottom in display order; family order means lower numbers appear first.

### Example 3 — Phases Hub

- Path: `10 - OpenClaw/Automated Distribution Pipelines/My Show/Phases/My Show - Phases Hub.md`
- Existing tags: `[hub, my-show]`
- Rule 16 fires: `* Hub.md`, not in domain or sub-domain root → `hub-project`
- Result: `tags: [hub, hub-project, my-show]` → reordered to `[hub-project (4), my-show (5)]` and the bare `hub` tag flagged in detections (unknown family).

### Example 4 — Operative-pattern conflict

- Path: `10 - OpenClaw/Automated Distribution Pipelines/My Podcast/Phases/My Podcast - O2 - Write script.md`
- Existing tags: (empty / no kind tag)
- Rule 12 fires (operative pattern: `<project_id> - O\d+ - <name>`): `onyx-operative`
- Result: `tags: [onyx-operative, …]`. The file's previous "missing_phase_tag" detection from earlier heal runs is now resolved.

## How to invoke (agent-directive)

Load this skill, [[Tag Convention]], and [[Project ID Convention]]. Prompt the agent:

```
Run heal-kind-tag, scope=<vault-glob>, dry_run=true. Surface plan. Pause.
```

After review:

```
Run heal-kind-tag, dry_run=false. Apply.
```

## Native primitives relied on

- **Glob** — vault walk.
- **Read** — frontmatter parse, filename pattern match.
- **Edit** — single-write tag insertion + reorder.

## Relationship

- Authoritative source for rule semantics: [[Tag Convention]] §1.1 (canonical kind tags) + §8 (invariants) + §9 (healer responsibilities).
- Invoked by [[08 - System/Operations/heal.md|heal]] as Step 2.5 (after frontmatter-drift, before fractal-links). Consumes `project_id` slugs validated by [[heal-project-id]] in Step 4 (note: the heal step ordering puts kind-tag before project-id, which is fine — kind tag derivation only needs `project_id` for the operative-pattern regex; falls back to bundle folder name if missing).
- Tag-order normalisation (Step 4 of the algorithm) replaces the deferred TODO in [[Tag Convention]] §1.
