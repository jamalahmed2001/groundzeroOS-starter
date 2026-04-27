---
title: heal-orphan-locks
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/audit/recover.ts (recoverOrphanedLocks)
lines_replaced: 40
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-orphan-locks

> Clear locks held by dead processes (orphaned after a crash). Complementary to [[heal-stale-locks]] — that one clears locks by age; this one clears them by PID liveness.

## Purpose
When an agent process crashes mid-execution, its `lock:` frontmatter persists with a live-looking timestamp and PID. Stale-lock clearing only fires after the timestamp threshold; that can be hours. This skill clears faster by checking if the recorded PID is still running on the recorded host.

## Inputs
- `vault_path: string`
- `projects_glob: string`
- `hostname: string` — `$(hostname)` of the machine running this skill

## Outputs
- `recovered: RecoverRecord[]` — `{ phase_path, pid, reason }[]`

## Algorithm

### Step 1 — Enumerate active phases
Glob `<vault_path>/<projects_glob>/*/Phases/*.md` and filter to phases whose `status: active` OR `tags:` contains `phase-active`.

### Step 2 — For each active phase, check the lock
For each:
- Read `lock_pid:` frontmatter. Must be an integer. If missing/non-numeric → skip.
- Read `lock_hostname:` frontmatter. Compare to current `hostname`.
  - If different: skip (can't check a PID on another machine; defer to stale-lock age check).
  - If missing: treat as "same host" (legacy locks didn't record hostname).
- Check if `lock_pid` is alive: Bash `kill -0 <pid> 2>/dev/null; echo $?`. Exit 0 = running; non-0 = not.

### Step 3 — Clear orphaned locks
If the PID is not running, the lock is orphaned (crashed agent):
- Use Edit on the phase frontmatter:
  - Delete keys: `locked_by`, `locked_at`, `lock_pid`, `lock_hostname`, `lock_ttl_ms`
  - Set `status: ready`, `state: ready`
  - Replace `phase-active` tag with `phase-ready` in `tags:`
  - Bump `updated:` to current ISO UTC
- Append to log file under `## Log` if log exists:
  ```
  - [<now>] **lock_force_cleared** (run: healer)
    detail: PID <N> on host <hostname> no longer running — lock cleared
  ```
- Append to ExecLog via `tools/write-exec-log.sh` with status `HEAL`, summary `orphan-locks:cleared path=<relative> pid=<N>`.

### Step 4 — Record
Push `{ phase_path, pid, reason: 'pid_dead' }` onto `recovered`.

## Relationship to heal-stale-locks

| | heal-stale-locks | heal-orphan-locks |
|---|---|---|
| **Trigger** | `locked_at` timestamp older than `stale_lock_threshold_ms` | PID not running on current host |
| **Speed** | Detects after threshold (default 5 min) | Detects immediately on next heal run |
| **Confidence** | Medium (timestamp could lie) | High (kill -0 is authoritative) |
| **Cross-host** | Yes | No (can't verify remote PIDs) |

Both skills run in heal; orphan-locks usually fires first. If a lock survives orphan-locks (cross-host or unclear PID), stale-locks mops up later.

## Invariants

- Never clear a lock held by a live PID (always check `kill -0` first).
- Cross-host locks are never cleared by this skill — defer to stale-lock age check.
- `updated:` bumped on every modified phase file.
- Log file append is best-effort; skill succeeds even if log append fails.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `kill_check_failed` | `kill -0` returned unexpected non-0/1 (e.g. permission denied for a PID owned by another user) | Emit detection `insufficient_permission_to_check_pid`; don't clear. |
| `hostname_mismatch` | `lock_hostname` differs from current `$(hostname)` | Skip; defer to stale-lock. |
| `lock_fields_partial` | `lock_pid` present but `lock_hostname` missing | Treat as same-host; continue. |
| `edit_failed` | Edit on phase frontmatter raises | Record in `errors`; continue with next phase. |

## Examples

**Example 1 — crashed agent:**

Input (phase P5):
```yaml
status: active
tags: [phase-active]
locked_by: agent-run-7f3a
locked_at: 2026-04-24T14:30:00Z
lock_pid: 28772
lock_hostname: dev-laptop
```

Current host: `dev-laptop`. `kill -0 28772` → exit 1 (process gone).

After skill:
```yaml
status: ready
state: ready
tags: [phase-ready]
updated: 2026-04-24T14:32:17Z
```
All lock fields removed. Log appended, ExecLog line emitted.

**Example 2 — live process, do nothing:**

Same fixture as above, but `kill -0 28772` → exit 0. Skip — do not clear. No output record.

**Example 3 — cross-host lock:**

```yaml
lock_pid: 2841
lock_hostname: ci-runner-02
```

Current host: `dev-laptop`. Hostnames differ → skip with `reason: hostname_mismatch`. Stale-locks handles it later if the agent never comes back.
