---
title: heal-stale-locks
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/healer/staleLocks.ts
lines_replaced: 138
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-stale-locks

> **Validated 2026-04-24** by [[08 - System/Operations/_agent-native-validation.md|heal probe case P1]]. The TS implementation has a schema bug (silently drops phases whose `locked_at:` is parsed as a YAML date). This skill specifies the correct behaviour that the agent produces naturally.

## Purpose
Clear locks on `status: active` phases where either (a) `locked_at` is older than the configured threshold, or (b) `locked_at` is missing. Reset the phase to `ready`.

## Inputs
- `vault_path: string`
- `projects_glob: string` — default `"01 - Projects/**"` or whatever config specifies
- `threshold_ms: int` — default 300000 (5 minutes)
- `now_iso: string` — current time, ISO 8601 UTC (allows deterministic testing)

## Outputs
- `cleared: ClearedLock[]` — `{ phase_path: string, was_locked_by: string, age_ms: int, reason: "stale_age" | "missing_locked_at" }[]`
- `skipped: SkippedLock[]` — `{ phase_path: string, reason: "recent_log_activity" | "within_threshold" }[]`

## Algorithm

### 1. Enumerate active phases
Use Glob to find every file under `<vault_path>/<projects_glob>/*/Phases/*.md`. For each file, use Read to parse frontmatter. Filter to files where `status: active` OR `tags:` contains `phase-active`.

If no active phases → return empty `cleared: []` and `skipped: []`.

### 2. For each active phase, evaluate the lock

For each active phase file:

```
lockedAt  = frontmatter.locked_at   # may be missing, may be a string, may be YAML-parsed as a Date
lockedBy  = frontmatter.locked_by   # may be missing; null-coalesce to "unknown"
projectId = frontmatter.project_id OR frontmatter.project OR ""
```

**Normalise `lockedAt` to a millisecond epoch:**
- If the value is missing or an empty string → treat as missing (goto branch 2a).
- If the value is a string → parse as ISO 8601. If parse fails → treat as missing.
- If the value is a Date-like object (YAML sometimes parses bare ISO strings as timestamps) → extract epoch ms directly.
- Any other type (number, object) → treat as missing.

*(This branch is what the TS implementation gets wrong — it rejects non-string values instead of coercing. Corrected here.)*

### 2a. Branch: lockedAt is missing or unparseable

Action: clear the lock immediately (phase is `active` but has no verifiable lock time — assume crashed).

Proceed to Step 3 with:
- `reason = "missing_locked_at"`
- `age_ms = null`

### 2b. Branch: lockedAt is present and parseable

```
age_ms = parseInt(now_iso_as_ms) - locked_at_ms
```

- If `age_ms < threshold_ms` → not stale. Record in `skipped` with reason `within_threshold`. Go to next phase.
- Else → check recent log activity (Step 2c).

### 2c. Sub-check: recent log activity

The lock might be stale by wall-clock time but the owning agent could still be writing to the log. Check:

- Derive log path: `<bundle>/Logs/L<phase_number> - <phase_title>.md` (see [[08 - System/Operations/_tools.md|tool catalog]] for canonical path computation; for now, match on filename prefix).
- If log file doesn't exist → proceed to Step 3 with reason `stale_age`.
- Else use Bash `stat -c '%Y' <log_path>` (or equivalent Read + mtime) to get log mtime in epoch seconds.
- If `now_ms - (log_mtime_ms)` < `threshold_ms` → log was recently touched. Record in `skipped` with reason `recent_log_activity`. Go to next phase.
- Else → proceed to Step 3 with reason `stale_age`.

### 3. Apply the clear

Use Edit on the phase file to perform these frontmatter changes atomically (single Edit call):

- `status:` → `ready`
- `state:` → `ready`
- `tags:` → remove any `phase-*` tag, append `phase-ready`
- Delete keys: `locked_by`, `locked_at`, `lock_pid`, `lock_hostname`, `lock_ttl_ms`
- Bump `updated:` to `now_iso`

### 4. Append log entry

Use Edit on the log file (if it exists, else skip) to append under `## Log`:

```
- [<now_iso>] **stale_lock_cleared** (run: healer)
  detail: locked_by=<was_locked_by> | age=<age_minutes>min | threshold=<threshold_minutes>min | reason=<reason>
```

If the log file doesn't exist, do **not** create one — that's a separate scaffolding operation.

### 5. Append ExecLog line

Call `tools/write-exec-log.sh`:
```
--vault <vault_path> \
--project <projectId> \
--phase <phase_number> \
--status HEAL \
--duration-sec 0 \
--summary "stale-locks:cleared path=<relative_phase_path> was_locked_by=<was_locked_by> reason=<reason>"
```

### 6. Record in output
Push onto `cleared`:
```
{ phase_path, was_locked_by, age_ms, reason }
```

## Invariants
- Never clear a lock that's within `threshold_ms` AND has recent log activity.
- Never clear lock fields without also setting `status: ready` and updating `tags` in the same write.
- Always bump `updated:` on every modified phase file (Master Directive invariant 3).

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `edit_failed` | Edit call raises (permission, file locked) | Skip the phase, log to stderr, continue with the next one. Do not halt. |
| `log_append_failed` | Log file exists but Edit fails | Phase was cleared successfully; log the append failure separately. Do not revert the phase-clear. |
| `exec_log_failed` | `tools/write-exec-log.sh` non-zero exit | Skill still returns the cleared record. ExecLog miss is reported to stderr but does not block. |
| `unexpected_frontmatter_type` | YAML parse returns something not string/Date for `locked_at` | Treat as missing (branch 2a). |

## Examples

**Example 1 — missing locked_at (fixture P1, probe 2026-04-24):**

Input:
```yaml
status: active
tags: [phase-active]
locked_by: agent-run-xyz
locked_at: 2026-04-24T07:00:00Z   # unquoted, YAML parses as Date
```
(TS implementation's schema rejects this; this skill normalises and proceeds.)

After skill:
```yaml
status: ready
state: ready
tags: [onyx-phase, phase-ready]
updated: 2026-04-24T10:47:00Z
```
`locked_*` fields removed. ExecLog line appended.

**Example 2 — within threshold:**

Input: `locked_at: 2026-04-24T10:46:00Z`, now: `2026-04-24T10:47:30Z`, threshold: 300000ms.
- age_ms = 90000 (1.5 min) < 300000.
- Record as `skipped: { reason: "within_threshold" }`. No change.

**Example 3 — stale age with recent log activity:**

Input: `locked_at: 2026-04-24T10:00:00Z`, now: `2026-04-24T10:47:00Z`, threshold: 300000ms.
- age_ms = 2820000 (47 min) > 300000.
- Log file mtime: `2026-04-24T10:45:00Z` (2 min ago).
- age since last log = 120000 < threshold.
- Record as `skipped: { reason: "recent_log_activity" }`. No change.
