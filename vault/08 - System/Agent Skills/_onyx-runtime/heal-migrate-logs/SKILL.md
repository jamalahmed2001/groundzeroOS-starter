---
title: heal-migrate-logs
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/healer/migrateLogs.ts
lines_replaced: 172
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-migrate-logs

> Consolidate legacy log-filename variants into the canonical `L<N> - <Phase Name>.md` format, patch link references.

## Purpose
Three generations of log-filename conventions have existed in this vault. This skill migrates any surviving legacy name into the canonical form and updates references in phase notes and Agent Log Hubs.

## Inputs
- `vault_path: string`
- `projects_glob: string`

## Outputs
- `migrated: MigrationRecord[]` — `{ phase_path, log_from, log_to, reason }[]`
- `stale_deleted: string[]` — log paths removed
- `links_patched: LinkPatchRecord[]` — `{ path, count_patched }[]`
- `errors: ErrorRecord[]`

## Canonical format
Logs live at `<project>/Logs/L<N> - <phase_name>.md`, where:
- `<N>` = the phase's `phase_number` frontmatter value.
- `<phase_name>` = the phase's `phase_name` frontmatter value, passed through `safe-file-segment` sanitisation (drop leading/trailing whitespace, replace `/:\*?"<>|` with `-`).

## Legacy variants (that this skill migrates)
All of these may still exist in older bundles. For each phase_number `N` and phase_name `name`, canonical filename is `L<N> - <name>.md`; the following are the legacy variants:

| Legacy form | Example |
|---|---|
| `L<N>.md` | `L3.md` — the short-lived "bare number" experiment |
| `L<N> - P<N> - <name>.md` | `L3 - P3 - Ship X.md` — earliest "P-redundant" form |
| `L<N> - <phase-filename>.md` | `L3 - P3 - Ship X.md` — when the phase file's basename was stored here |
| `L<N> - Phase <N> - <name>.md` | `L3 - Phase 3 - Ship X.md` — explicit "Phase" prefix era |

## Algorithm

### Step 1 — Enumerate phases
Glob `<vault_path>/<projects_glob>/*/Phases/*.md`. For each phase:
- Parse frontmatter. Skip if `phase_number` missing or not numeric.
- Resolve `phases_dir` = parent of phase file, `bundle_dir` = parent of `phases_dir`, `logs_dir` = `<bundle_dir>/Logs`.
- Read `phase_name` from frontmatter.
- Compute `canonical_filename` per §Canonical format.
- Compute `canonical_path` = `<logs_dir>/<canonical_filename>`.

### Step 2 — Rename legacy candidate if canonical doesn't exist
If `canonical_path` does not exist, check each legacy variant in order:
1. `<logs_dir>/L<N>.md`
2. `<logs_dir>/L<N> - P<N> - <phase_name>.md`
3. `<logs_dir>/L<N> - <phase-file-basename>`
4. `<logs_dir>/L<N> - Phase <N> - <phase_name>.md`

First existing match → Bash `mv <legacy> <canonical_path>`. Record in `migrated` with `reason: renamed_from_legacy`. Bump canonical file's `updated:` frontmatter.

If none exist and `canonical_path` also doesn't exist → no log for this phase. **Do not create one** — log files should be produced by executor, not by heal.

### Step 3 — Delete stale duplicates
In `<logs_dir>`, Glob `L<N> - *.md`. For each match that is NOT the `canonical_filename`:
- Bash `rm <stale_path>`
- Append to `stale_deleted`.
- Record in `migrated` with `reason: deleted_stale`.

Also: if `<logs_dir>/L<N>.md` (bare) exists AND `canonical_path` exists → delete the bare.

**Safety rails:**
- Never delete `canonical_filename` itself (the name-match logic excludes it).
- Never delete a log that lives outside the expected `<bundle_dir>/Logs/`.
- Never delete files whose content hasn't been inspected — if content appears to contain work-in-progress (heuristic: `phase:` frontmatter refers to a different phase), skip and emit error.

### Step 4 — Patch phase note link references
Open the phase file. Find every wikilink matching `[[L<N>]]` or `[[L<N> - <anything>]]` (optionally with alias `[[...|alias]]`). Replace each with `[[L<N> - <phase_name>|<preserved-alias>]]` (or no alias if none existed).

Regex: `\[\[L<N>(?:\s+-[^\]|]+)?(\|[^\]]+)?\]\]` — match any variant, preserve alias suffix.

Write back to phase file if any replacement happened. Bump `updated:`. Record in `links_patched`.

### Step 5 — Patch Agent Log Hub links
Once per bundle (dedupe by `bundle_dir`):
- Compute `hub_path` = `<bundle_dir>/<Project> - Agent Log Hub.md` where `<Project>` comes from the phase's `project` frontmatter (or the bundle folder name as fallback).
- If hub file exists, build a `phase_num → phase_name` map for all phases in that bundle.
- Scan hub body for patterns `[[L<N>...|<alias>]]` — replace with canonical format using the map.
- Write back if any replacement happened. Bump `updated:`.

### Step 6 — Log
For each action, call `tools/write-exec-log.sh`:
```
--status HEAL --summary "migrate-logs:<action> path=<relative>"
```

Where `<action>` is `renamed` / `deleted_stale` / `links_patched` / `hub_patched`.

## Invariants

- Never delete a log that doesn't match `L<N> - *.md` pattern (only operates on files we know are logs).
- Never rename to a path that already exists — if `canonical_path` exists and a legacy also exists, the legacy is deleted as stale (Step 3), not overwritten.
- Always bump `updated:` on any modified file.
- One log per phase. If multiple legacy variants exist for the same `N`, the highest-priority-order one becomes canonical and the rest are stale.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `rename_failed` | `mv` fails (permissions, source gone) | Record in `errors`; continue with next phase. |
| `canonical_exists_with_legacy` | Both canonical AND a legacy form exist, and their contents differ non-trivially | Skip deletion of the legacy, emit detection for human review. |
| `ambiguous_log_match` | Multiple legacy variants exist for the same `N` but neither is canonical | Rename the first (priority order); delete the rest as stale. |
| `invalid_phase_number` | `phase_number` frontmatter missing or non-numeric | Skip; emit `errors`. |
| `bundle_without_logs_dir` | Phase exists but `<bundle>/Logs/` doesn't | Skip (nothing to migrate); no error. |

## Examples

**Example 1 — legacy variant renamed:**

Bundle `AmazonPipe/`:
- `Phases/P3 - Opt Engine.md` with `phase_number: 3`, `phase_name: "Optimization Engine for Experiments"`.
- `Logs/L3 - Phase 3 - Optimization Engine for Experiments.md` (legacy form #4).
- No canonical.

Canonical: `Logs/L3 - Optimization Engine for Experiments.md`.

After skill:
- Renamed: `Logs/L3 - Phase 3 - ...` → `Logs/L3 - Optimization Engine for Experiments.md`.
- `updated:` bumped.
- Phase body wikilinks `[[L3]]` / `[[L3 - Phase 3 - Optimization Engine for Experiments]]` rewritten to `[[L3 - Optimization Engine for Experiments]]`.

**Example 2 — stale duplicate deleted:**

Bundle `Almani/`:
- Canonical `Logs/L2 - Launch Readiness Validation.md` (exists).
- Stale `Logs/L2 - P2 - Launch Readiness Validation.md` (legacy #2).

After skill:
- Canonical untouched.
- Stale deleted.
- Phase body links rewritten if they referenced the legacy form.

**Example 3 — no canonical, no legacy:**

Bundle `Clutr/` has `Phases/P01.md` but `Logs/` is empty (phase never executed).

After skill: no action. No log created. Heal doesn't fabricate execution records.
