---
title: heal
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/healer/
lines_replaced: 882
version: 0.2
created: 2026-04-24
updated: 2026-04-27T10:09:17Z
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 3
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]
**Related:** [[08 - System/Operations/_template.md|Operation Template]] · [[08 - System/ONYX Master Directive.md|Master Directive §3 step 1]] · [[08 - System/Operations/_agent-native-validation.md|Validation Log — heal probe]]

# Operation: heal

> **Validated 2026-04-24** — [[08 - System/Operations/_agent-native-validation.md|heal probe]] showed native-primitive approach matches (and in one case exceeds) `src/healer/`. Status promoted from `stub` to `draft`. Shadow-mode week still required before `src/healer/` deletion.

## Preconditions
- Vault path is readable and writable.
- `stale_lock_threshold_ms` defined (default 5 minutes = 300000ms).

## Invocation context
- **Automatic:** Master Directive §3 step 1 — runs at the start of every iteration, before any work is selected.
- **Explicit:** `onyx heal` CLI (after migration, a thin directive-loader).

## Read order
1. `08 - System/Profiles/Profiles Hub.md` — for shell-policy if any remediation needs Bash.
2. [[08 - System/Conventions/Project ID Convention.md|Project ID Convention]] — slug contract used in Step 4. Hub naming downstream depends on this.
3. [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]] — hub-name derivation, used in Step 7.
4. Glob `<projects-glob>/*/Phases/*.md` — all phase files.
5. Glob `<projects-glob>/*/Logs/*.md` — all log files.
6. Glob `<projects-glob>/*/Overview.md` — for `project_id` lookup, validation, and uniqueness scan.
7. Glob `<vault>/**/*.md` ignoring `.git/`, `node_modules/`, `_Archive/` — for nav-dedup pass.

## Procedure

Run the six sub-checks in this order. Each is implemented by a dedicated skill; this operation is a checklist, not a body of logic. An order is prescribed because later checks depend on earlier ones (e.g. frontmatter drift fix should run before project_id backfill so we're operating on normalised frontmatter).

### Step 1 — Stale locks
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-stale-locks/heal-stale-locks.md|heal-stale-locks]].
- **Input:** vault path, stale-lock threshold (ms).
- **Effect:** phases with `status: active` and `locked_at:` older than threshold (or missing) are reset to `ready`. Lock fields cleared.
- **ExecLog:** one line per cleared lock.

### Step 2 — Frontmatter drift
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-frontmatter-drift/heal-frontmatter-drift.md|heal-frontmatter-drift]].
- **Input:** vault path.
- **Effect:** for every phase, verify the six invariants in the skill (tag-uniqueness, state presence, state ↔ tag alignment, status ↔ tag alignment, lock-field orphans, replan_count reset). Apply fixes.
- **ExecLog:** one line per applied fix.

### Step 2.5 — Kind-tag classification
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]].
- **Input:** vault path, scope glob.
- **Effect:** every markdown file lacking a structural-kind tag (family 2 or family 8 per [[08 - System/Conventions/Tag Convention.md|Tag Convention]] §1.1) gets one inserted, derived from file location + name pattern. Tag list is then re-ordered to family order 1→8.
- **Never overwrites** an existing kind tag — manual classifications are preserved.
- **Detect-only when ambiguous** (multiple rules match, or no rule fires).
- **ExecLog:** one line per applied tag; one line per detection.

### Step 3 — Log migration
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-migrate-logs/heal-migrate-logs.md|heal-migrate-logs]] *(stub)*.
- **Input:** vault path.
- **Effect:** move log files from legacy locations to canonical `<project>/Logs/L<N> - <phase-title>.md`. Update `phase:` frontmatter on each log to point at the current phase file.
- **ExecLog:** one line per migrated log.

### Step 4 — project_id validation + backfill
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-project-id/heal-project-id.md|heal-project-id]].
- **Input:** vault path, projects glob.
- **Contract:** authoritative rules in [[08 - System/Conventions/Project ID Convention.md|Project ID Convention]] §1 (presence, format, length, uniqueness).
- **Effects:**
  - **Uniqueness scan** — duplicate `project_id` across Overviews → `INTEGRITY: project_id_duplicate`, halt iteration.
  - **Format validation** — every Overview's `project_id` checked against the regex / length contract; failures emit `detection: project_id_invalid_format` (no auto-fix).
  - **Backfill** — child files (phases, logs, directives, profiles) missing `project_id` are filled from their bundle Overview *only when the Overview's value is itself valid*. Backfilling a malformed slug is forbidden (would just spread corruption).
  - **Hub-name coherence** — Overview slug vs hub filenames in the bundle compared; mismatch emits `detection: project_id_hub_mismatch`.
- **What this step does NOT do:** invent slugs, rename hubs, or rewrite wikilinks. Those are [[08 - System/Agent Skills/_onyx-runtime/heal-project-id-migrate/heal-project-id-migrate.md|heal-project-id-migrate]] (one-shot, explicit invocation).
- **ExecLog:** one line per backfill; one line per emitted detection (kind + path).

### Step 5 — Orphan-lock clearing
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-orphan-locks/heal-orphan-locks.md|heal-orphan-locks]] *(stub)*.
- **Input:** vault path.
- **Effect:** detect locks held by the current process (PID match) whose state doesn't match — artefact of a crashed agent process. Clear them.
- **ExecLog:** one line per recovered lock.

### Step 6 — Duplicate nav-block collapse
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-dup-nav/heal-dup-nav.md|heal-dup-nav]] *(stub)*.
- **Input:** vault path.
- **Effect:** for every markdown file in vault, if more than one `## 🔗 Navigation` block exists → keep the first, strip the rest. Within any single nav block, deduplicate wikilinks.
- **ExecLog:** one line per collapsed file.

### Step 7 — Fractal link integrity
Invoke [[08 - System/Agent Skills/_onyx-runtime/heal-fractal-links/heal-fractal-links.md|heal-fractal-links]].
- **Input:** vault path, projects glob.
- **Effect:** enforces the [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]]. Leaves don't link to grandparent. Hubs don't link sideways. `up:` frontmatter points at the correct parent hub. Missing Phases/Directives/Albums/Logs Hubs auto-created when a folder has > 2 markdown children pointing at a non-existent hub.
- **Auto-fixes (Rules 1–5):**
  - **Rule 1** (default-on): files lacking `up:` get one set, derived from folder location.
  - **Rule 2**: missing target hub → auto-create skeleton hub when threshold met.
  - **Rule 3**: `up:` pointing at wrong parent → re-pointed at correct hub.
  - **Rule 4**: nav block grandparent / sideways links → rewritten to UP-only pattern.
  - **Rule 5** (promoted from detect-only 2026-04-27): hub omits a folder child → child appended under `## Children` section in hub body.
- **Detections (no auto-fix):** circular `up:` chain (INTEGRITY); ambiguous hub membership; broken cross-domain wikilinks.
- **ExecLog:** one line per applied fix.

### Step 8 — Missing-section detection (detect-only)
No skill — this runs inline at the end. For every phase file, verify it contains `## Tasks` and `## Acceptance Criteria` headings. If either is missing, log a `drift:missing_section` entry to ExecLog. **Do not auto-fix.** Missing sections often indicate an in-progress plan or legacy phase; human review required.

## What heal does NOT do

- **Orphan-node scaffolding.** Creating new hub files or attaching isolated notes is not a heal action. It belongs to a separate `scaffold-hubs` operation (not yet written). Decision from [[08 - System/Operations/_agent-native-validation.md|heal probe 2026-04-24]].
- **Inventing or renaming `project_id` slugs.** Routine heal *validates* and *backfills* per [[08 - System/Conventions/Project ID Convention.md|Project ID Convention]], but never invents a slug for a bundle that lacks one and never renames an existing slug. Both belong to [[08 - System/Agent Skills/_onyx-runtime/heal-project-id-migrate/heal-project-id-migrate.md|heal-project-id-migrate]] — explicit, one-shot, gated by the human.
- **Deleting any file.** Heal never deletes; it only corrects in place.
- **Fixing broken wikilinks.** Detect, log, mark the source with `drift: broken-link` frontmatter. Repair is a separate operation.
- **Bulk frontmatter migrations** (e.g. renaming a field across the vault). Those are explicit phases, not heal.

## Post-conditions & transitions

- No phase `status:` transitions performed by the operation itself (though skills may transition individual phases, e.g. stale lock → ready).
- Every modified file has `updated:` frontmatter bumped to current ISO timestamp. (Master Directive invariant 3.)
- Every non-trivial action appended one line to `00 - Dashboard/ExecLog.md`. (Master Directive invariant 13.)

## Error handling

- **RECOVERABLE:** a single file write fails (e.g. permission error, disk full). Skip that file, continue with the rest. Log the error. Operation still returns success if at least 50% of attempted fixes applied.
- **BLOCKING:** none — heal cannot block; it either fixes, skips, or escalates to INTEGRITY.
- **INTEGRITY:** vault path unreadable; more than 50% of attempted fixes fail (suggests systemic permission issue); a fix would require deleting content. Halt the iteration, write full report, call `openclaw` with event `integrity_error`.

## Skills invoked

- [[08 - System/Agent Skills/_onyx-runtime/heal-stale-locks/heal-stale-locks.md|heal-stale-locks]] — full procedure
- [[08 - System/Agent Skills/_onyx-runtime/heal-frontmatter-drift/heal-frontmatter-drift.md|heal-frontmatter-drift]] — full procedure
- [[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]] — full procedure (canonical kind-tag classification + family-order normalisation)
- [[08 - System/Agent Skills/_onyx-runtime/heal-migrate-logs/heal-migrate-logs.md|heal-migrate-logs]] — full procedure
- [[08 - System/Agent Skills/_onyx-runtime/heal-project-id/heal-project-id.md|heal-project-id]] — full procedure (routine validate + backfill)
- [[08 - System/Agent Skills/_onyx-runtime/heal-orphan-locks/heal-orphan-locks.md|heal-orphan-locks]] — full procedure
- [[08 - System/Agent Skills/_onyx-runtime/heal-dup-nav/heal-dup-nav.md|heal-dup-nav]] — full procedure
- [[08 - System/Agent Skills/_onyx-runtime/heal-fractal-links/heal-fractal-links.md|heal-fractal-links]] — full procedure

## Skills NOT invoked routinely (one-shot, human-gated)

- [[08 - System/Agent Skills/_onyx-runtime/heal-project-id-migrate/heal-project-id-migrate.md|heal-project-id-migrate]] — slug rename + cascade. Triggered by `detection: project_id_*` from Step 4; run explicitly per bundle.

## Tools invoked

- `tools/write-exec-log.sh` — every applied fix appends one line (atomic concurrent append)

## Native primitives relied on

- **Glob** — find phase files, log files, overview files, all .md files. Exclusions: `.git/`, `node_modules/`, `_Archive/`.
- **Read** — phase frontmatter, log frontmatter, overview frontmatter, nav-block contents.
- **Edit** — clear lock fields, align status/state/tag, insert missing fields, dedupe nav wikilinks.
- **Write** — on rare full-file rewrites (nav-block collapse when Edit is impractical).
- **Grep** — for `[[wikilink]]` and `## 🔗 Navigation` block detection.
- **Bash `mv`** — log migration (rare; most log moves use Write+Read).

## Acceptance (self-check before exit)

Before returning success, the operation verifies:

1. Every phase's `status:` frontmatter matches its phase-tag (`phase-<status>`).
2. Every phase either has `state:` frontmatter or did before heal started (no new phases without it).
3. No phase has `status: active` with `locked_at:` older than the threshold.
4. Every phase has `project_id:` if its bundle has an Overview with one.
5. No file has more than one `## 🔗 Navigation` heading.
6. Every applied fix has a corresponding line in ExecLog.
7. `updated:` frontmatter was bumped on every modified file.

If any self-check fails, downgrade to INTEGRITY error, escalate.

## ExecLog entry format

One line per heal action:
```
<ISO-timestamp> | - | <phase-id-or-"-"> | HEAL | <duration-sec> | <check-name>:<action-type> path=<relative-path>
```

Example:
```
2026-04-24T10:47:12Z | - | P14 | HEAL | 0 | stale-locks:cleared path=my-podcast/Phases/P14 - Script.md
```

## Shadow-mode comparison criteria

Before deleting `src/healer/`:

1. Run TS healer against the production vault, snapshot vault state.
2. Reset vault to the same starting state.
3. Run agent-directive heal against the same vault, snapshot.
4. Diff the two snapshots. Acceptable differences (not failures):
   - Cosmetic frontmatter formatting (ISO millisecond precision, YAML list style).
   - Agent-bumped `updated:` timestamps on files the TS didn't touch (agent is more invariant-compliant; this is expected).
   - Missing TS orphan-node scaffolding (moved to separate operation).
5. Unacceptable differences that block deletion:
   - A fix applied by one implementation and not the other where both should fix.
   - A fix applied incorrectly by either side.
   - ExecLog entries missing for applied fixes.
6. A full week of zero semantic-divergent runs = green for deletion.

See [[08 - System/Operations/_agent-native-validation.md|heal probe entry]] for the first test run.
