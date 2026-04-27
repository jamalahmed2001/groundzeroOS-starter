---
title: heal-frontmatter-drift
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/healer/drift.ts (the non-nav-block portion)
lines_replaced: 200
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-frontmatter-drift

> **Validated 2026-04-24** by [[08 - System/Operations/_agent-native-validation.md|heal probe case P2]]. Six sub-rules, each a small deterministic check. Validated semantic equivalence to `src/healer/drift.ts`; cosmetic differences only (YAML formatting).

## Purpose
Align every phase file's `status:`, `state:`, and `tags:` to a single canonical value, resolving drift that accumulates when the vault is edited by hand or by a misbehaving agent.

## Inputs
- `vault_path: string`
- `projects_glob: string`
- `now_iso: string`

## Outputs
- `fixes: FrontmatterFix[]` — `{ phase_path: string, rule: string, before: any, after: any }[]`
- `detections: Detection[]` — `{ phase_path: string, issue: string }[]` (detect-only issues; no auto-fix)

## Canonical values

The six valid phase states (Master Directive §4.1):
```
PHASE_STATES = [backlog, planning, ready, active, blocked, completed]
```

Tag ↔ state mapping:
```
phase-backlog    ↔ backlog
phase-planning   ↔ planning
phase-ready      ↔ ready
phase-active     ↔ active
phase-blocked    ↔ blocked
phase-completed  ↔ completed
```

**Tag wins during migration.** If any field conflicts with the canonical tag, the tag is authoritative and the other fields are rewritten.

## Algorithm

For every phase file found via Glob `<vault_path>/<projects_glob>/*/Phases/*.md`, perform the six rules in order. Each rule either emits a fix, a detection, or a skip. After all rules run, issue a single Edit call if any fix applied.

### Rule 1 — Tag uniqueness
**Check:** count phase-* tags in `tags:`.
- Zero → detection `missing_phase_tag` (no auto-fix; needs human).
- One → proceed to Rule 2.
- More than one → **Fix:** keep the first, drop the rest. Record `rule: tag_uniqueness`.

### Rule 2 — `state:` presence
After Rule 1, derive `canonical_state` from the (now single) phase tag. Then:
- If `state:` is missing / null / empty string → **Fix:** set `state: <canonical_state>`. Record `rule: state_missing`.
- If `state:` exists but is not in `PHASE_STATES` → **Fix:** overwrite with `canonical_state`. Record `rule: state_invalid`.

### Rule 3 — `state:` ↔ tag alignment
If `state` value ≠ `canonical_state`:
- **Fix:** overwrite `state: <canonical_state>`. Record `rule: state_tag_mismatch` with `before`/`after`.

### Rule 4 — `status:` ↔ tag alignment
Same as Rule 3, for `status:` field.
- If `status:` ≠ `canonical_state`: **Fix:** overwrite `status: <canonical_state>`. Record `rule: status_tag_mismatch`.

### Rule 5 — Orphan lock fields
If `canonical_state` ≠ `active` AND any of `locked_by`, `locked_at`, `lock_pid`, `lock_hostname`, `lock_ttl_ms` is present and non-empty:
- **Fix:** delete all five keys. Record `rule: orphan_lock_cleared`.

### Rule 6 — `replan_count` reset
If `canonical_state` == `ready` AND `replan_count:` > 0:
- **Fix:** set `replan_count: 0`. Record `rule: replan_count_reset`.

### Detect-only rules

After the 6 fix rules, also emit detections (no auto-fix, logged to ExecLog):

- `missing_tasks_section` — body has no `## Tasks` heading.
- `missing_acceptance_section` — body has no `## Acceptance Criteria` heading.

Both indicate plan incompleteness; only a human (or atomise operation) should populate these.

### Write pass

If any fix emitted, issue a single Edit on the frontmatter block with all changes + bump `updated: <now_iso>`. If no fixes emitted but detections exist, don't touch the file.

### ExecLog

For each applied fix, call `tools/write-exec-log.sh` with status `HEAL`, summary `frontmatter-drift:<rule> path=<relative>`.

## Invariants
- Tag wins in every conflict. Never rewrite the tag based on status/state.
- All fixes for a single phase file land in a single Edit call (atomic, one write).
- Detections do not mutate the file.
- `updated:` is bumped if and only if at least one fix applied.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `no_phase_tag` | Rule 1 finds zero phase tags | Detection only: `missing_phase_tag`. No fix (human review). Skip remaining rules for this file. |
| `edit_failed` | Edit raises | Record all intended fixes with `applied: false`. Continue with next phase file. |
| `exec_log_failed` | write-exec-log non-zero | Continue; ExecLog miss is a second-order issue. |
| `unexpected_frontmatter_shape` | YAML frontmatter not parseable | Skip file, emit detection `unparseable_frontmatter`. |

## Examples

**Example 1 — the probe fixture P2 (2026-04-24):**

Input:
```yaml
status: active
state: blocked
tags: [onyx-phase, phase-ready]
```

Processing:
- Rule 1: one phase tag (`phase-ready`) → canonical_state = `ready`. OK.
- Rule 2: state present (`blocked`) and valid. OK.
- Rule 3: state `blocked` ≠ canonical `ready` → **Fix** `state: ready`. Record.
- Rule 4: status `active` ≠ canonical `ready` → **Fix** `status: ready`. Record.
- Rule 5: canonical != active AND no lock fields → OK.
- Rule 6: canonical == ready AND replan_count absent → OK.

Write:
```yaml
status: ready
state: ready
tags: [onyx-phase, phase-ready]
updated: 2026-04-24T10:47:00Z
```

**Example 2 — multiple phase tags:**

Input: `tags: [phase-ready, phase-active, phase-blocked]`

Processing:
- Rule 1: 3 phase tags → **Fix**: keep first (`phase-ready`), drop others. canonical_state = `ready`.
- Rule 2–6 proceed against `canonical_state = ready`.

Write: `tags: [phase-ready]`, status/state aligned as applicable.

**Example 3 — orphan lock on completed phase:**

Input:
```yaml
status: completed
tags: [phase-completed]
locked_by: agent-run-abc
locked_at: 2026-04-20T10:00:00Z
lock_pid: 12345
```

Processing:
- Rules 1–4: all aligned. No fix.
- Rule 5: canonical `completed` != `active` AND lock fields present → **Fix**: delete all 5 lock keys.
- Rule 6: not applicable.

Write: lock fields removed, `updated:` bumped.
