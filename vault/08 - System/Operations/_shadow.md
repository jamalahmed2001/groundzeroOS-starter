---
title: _shadow (meta-directive)
tags:
  - system
  - operation
  - onyx
  - shadow-mode
type: operation-directive
version: 1.0
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: _shadow (meta — how operations graduate)

> Shadow mode is the bridge between a `draft` operation directive and an `active` one. It runs the TS source path *and* the directive path against the same input, snapshots both, and classifies divergence. After 7 consecutive `GREEN` shadow runs across distinct phases, the directive's `status:` graduates from `draft` → `active` and its `replaces:` TS source is eligible for deletion.

This is not itself an operation in the routing sense — Master Directive §5 never dispatches to it. It's the protocol every operation passes through on its way from "prose in a markdown file" to "deleted-the-old-code reality".

---

## When to run a shadow comparison

- A directive's `status:` is `draft` and you want to graduate it.
- You changed a draft directive's procedure and want to verify the change still matches TS behaviour.
- You suspect the TS path has a behaviour the directive doesn't capture (or vice versa) and you want a forcing function to surface the difference.

If `status:` is `stub`, the directive isn't ready for shadow yet — its procedure section is incomplete. Finish the directive first.

If `status:` is `active`, shadow is unnecessary; the TS source has been deleted.

---

## The harness

Three scripts under `tools/`:

| Script | Job |
|---|---|
| `shadow-snapshot.sh <phase> <out-dir>` | Capture a phase + bundle's mutable markdown state to `<out-dir>` (skips media). |
| `shadow-diff.sh <ts-snap> <directive-snap> [--operation <op>]` | Classify every diff line as `GREEN` (timestamps, run-ids, log wording), `YELLOW` (review-worthy non-fatal), or `RED` (fatal — different status, checkboxes, acceptance ticks, content). Exit 0 on green, 1 on red. |
| `shadow-run.sh <operation> <phase-path>` | Orchestrate: snapshot pre → run TS → snapshot → restore → operator runs directive in a fresh agent → snapshot → diff → append result to `08 - System/Shadow Logs/<operation>.md`. |

The harness is plumbing. Directive execution stays in the LLM; the harness handles snapshotting, restoring, diffing, and logging so the operator can compare cleanly without polluting the vault.

---

## Procedure (for one shadow run)

```
operator: tools/shadow-run.sh atomise "01 - Projects/Demo/Phases/P1.md"
  ├─ snapshot pre-state to /tmp/shadow/<id>/pre/
  ├─ run TS path (e.g. `onyx atomise "Demo" 1`) → snapshot to /ts-end/
  ├─ restore pre-state to vault
  ├─ prompt operator to run the directive in Claude/Cursor/etc.
  ├─ wait for ENTER
  ├─ snapshot directive-end state to /directive-end/
  ├─ shadow-diff ts-end vs directive-end (per `_shadow` rules)
  ├─ append result row to `08 - System/Shadow Logs/<op>.md`
  └─ restore TS-end state to the vault (canonical post-op shape)
```

---

## Diff classification rules (canonical)

The harness reads these patterns from the script directly. They are documented here so directive authors can predict what will show up GREEN vs RED when they tweak procedures.

### GREEN — semantically equivalent, ignore

- `updated: <ISO>` frontmatter timestamps
- `lock_acquired_at:` / `lock_run_id:` / `lock_pid:` (per-run identifiers)
- `consolidated_at:` (per-run timestamp)
- ExecLog ISO timestamps that bracket every entry

### YELLOW — non-fatal, review-worthy

- Log message wording changes
- Phase summary phrasing
- Body-text additions that don't change checkboxes or status

A run with only YELLOW diffs is GREEN-with-asterisk. The operator skims the YELLOW lines and either accepts (counts toward graduation) or pushes back to the directive to tighten phrasing.

### RED — fatal, blocks graduation

- `status:` or `state:` value differs (one completes, other blocks — the canonical disqualifier)
- `- [ ]` vs `- [x]` checkbox differs (different tasks ticked or different acceptance verdict)
- `## Acceptance Criteria` content differs
- `## Human Requirements` differs (one populates a blocker, the other doesn't)
- `tags:` differ (different routing tag)
- File presence differs (one creates a file the other doesn't)
- Body content differs beyond GREEN/YELLOW patterns

A single RED run blocks graduation. The directive author either tightens the procedure to match TS, or argues the TS behaviour is wrong and the directive is the new ground truth (rare — usually means a TS bug being fixed).

---

## Graduation criteria

An operation directive may move `status: draft → active` when:

1. **Seven consecutive GREEN runs** across **distinct phases** (different bundles, different profiles when the operation is profile-aware) appear in `08 - System/Shadow Logs/<op>.md`.
2. **At least one run** under each profile the operation supports (engineering, content, audio-production, video-production, research, etc. — whichever the operation routes for).
3. **Any RED run** since the last graduation attempt resets the streak.

Once active:

- Update the directive's frontmatter: `status: active` and bump `version:`.
- Delete the `replaces:` TS source(s) listed in the directive frontmatter.
- Update Operations Hub's table to remove the `(draft)` annotation.
- Note the deletion in the relevant Decomposition Plan stage.

---

## What the harness does not do

- It doesn't run the directive itself. The operator runs the directive in their preferred agent runtime so the harness stays runtime-agnostic.
- It doesn't compare media outputs. Audio, video, and image diffs need perceptual hashing / visual review and don't fit the line-diff classifier.
- It doesn't backport. If the directive is wrong, the author fixes the directive — the harness only surfaces the diff, never auto-edits.

---

## Skills invoked
None — the meta-directive runs as three shell scripts.

## Tools invoked
- `tools/shadow-snapshot.sh`
- `tools/shadow-diff.sh`
- `tools/shadow-run.sh`

## Native primitives relied on
- **Bash** — the three scripts.
- **Read** / **Edit** — the operator running the directive in their agent uses these as normal.

## Acceptance (self-check after a shadow run)
- A row was appended to `08 - System/Shadow Logs/<op>.md`.
- The vault is in the TS-end state (not pre, not directive-end) — operator's working state matches what `onyx run` would have left.
- The full diff is at `/tmp/shadow/<run-id>/diff.txt` if anyone wants to re-examine.
