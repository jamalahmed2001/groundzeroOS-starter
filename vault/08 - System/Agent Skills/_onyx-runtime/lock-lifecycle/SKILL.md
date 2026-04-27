---
title: lock-lifecycle
tags: [skill, onyx-runtime, lock]
type: skill
replaces: src/lock/acquire.ts + src/lock/release.ts + refresh helper
lines_replaced: 160
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: lock-lifecycle

> Single source of truth for phase-lock ops: acquire, refresh, release. Shared by `execute-phase`, `atomise`, and `heal` — the three operations that need to mutate phase frontmatter's lock fields.

## Purpose
Every operation that mutates a phase's `status: active` needs locking. Concurrent agents must not grab the same phase. Crashed agents' locks need TTL expiry. Re-entrant calls from the same runId are allowed. Lock writes must be **single atomic frontmatter writes** — no partial states visible to other processes.

## Inputs / outputs per method

### acquire

**Inputs:**
- `phase_path: string`
- `run_id: string` — unique per agent invocation
- `ttl_ms: int` — default 1,800,000 (30 minutes)
- `current_pid: int` — `$(echo $$)` in Bash; os.pid() in TS
- `current_hostname: string` — `$(hostname)`

**Output:**
One of:
- `{ ok: true, run_id }`
- `{ ok: false, reason: "already_locked", locked_by, locked_at }`
- `{ ok: false, reason: "not_ready", current_tag }`
- `{ ok: false, reason: "schema_invalid", errors[] }`

### refresh

**Inputs:**
- `phase_path: string`
- `run_id: string`

**Output:** `{ ok: bool, reason?: string }`. Used mid-task-loop to extend the lock TTL without re-validating everything.

### release

**Inputs:**
- `phase_path: string`
- `run_id: string`
- `next_tag: "phase-ready" | "phase-active" | "phase-blocked" | "phase-completed"` — what `phase-*` tag (and matching `status`) the phase transitions to.

**Output:** `{ ok: bool, reason?: string }`.

## Algorithm — acquire

### Step 1 — Read + schema-validate
1. Read phase frontmatter.
2. If file doesn't exist → `{ ok: false, reason: "not_ready", current_tag: "missing" }`.
3. Schema-check: must have `project_id` (or `project`), `phase_number`, `phase_name`, `status` (one of the six valid states), plus profile `required_fields`. If any fail → `{ ok: false, reason: "schema_invalid", errors }`.

### Step 2 — Inspect existing lock
Read `locked_by`:
- Empty or missing → go to Step 4 (acquire fresh).
- Equals `run_id` → **re-entrant**: return `{ ok: true, run_id }` without writing. (Lets an operation re-call acquire harmlessly.)
- Otherwise → Step 3.

### Step 3 — TTL expiry check
- Read `locked_at` (ISO string) and `lock_ttl_ms` (default 1800000).
- Parse `locked_at` as epoch. Compute `elapsed_ms = now_ms - locked_at_ms`.
- If parse fails or `elapsed_ms > lock_ttl_ms` → **expired**. Clear `locked_by`, `locked_at`, `lock_pid`, `lock_hostname`, `lock_ttl_ms`. Set tag `phase-ready`. Append to audit log: `lock_expired agent=<locked_by> elapsed_min=<N>`. Fall through to Step 4.
- Else → `{ ok: false, reason: "already_locked", locked_by, locked_at }`.

### Step 4 — Lockable state check
- Derive `phase_tag` from `tags:` (first `phase-*` tag, else `null`).
- Must be `phase-ready` OR `phase-active`. If neither → `{ ok: false, reason: "not_ready", current_tag: <phase-tag-or-status> }`.

### Step 5 — Atomic lock write

Single frontmatter write updating ALL of these at once:
```yaml
state: active
status: active
tags: [...keep_non_phase_tags, phase-active]
locked_by: <run_id>
locked_at: <now ISO>
lock_pid: <current_pid>
lock_hostname: <current_hostname>
lock_ttl_ms: <ttl_ms>
updated: <now ISO>
```

### Step 6 — Read-back verify (race-condition guard)
Re-read the frontmatter. If `locked_by` no longer equals `run_id` → another agent won the race (their write followed ours). Return `{ ok: false, reason: "already_locked", locked_by: <whoever>, locked_at }`.

### Step 7 — Audit + return
Append to `00 - Dashboard/Audit.md` (or via `tools/write-exec-log.sh` with status `ACQUIRE`):
```
ACQUIRE <phase-relative-path> run=<run_id> pid=<current_pid> host=<current_hostname>
```
Return `{ ok: true, run_id }`.

## Algorithm — refresh

1. Read frontmatter.
2. Verify `locked_by == run_id`. If not → `{ ok: false, reason: "not_holder" }`.
3. Single atomic write: update `locked_at: <now ISO>` and `updated: <now ISO>`. Nothing else changes.
4. Return `{ ok: true }`.

**Purpose:** long-running phases call refresh every ~5 min so their lock doesn't hit TTL. Cheaper than full acquire.

## Algorithm — release

1. Read frontmatter.
2. If `locked_by != run_id` AND `locked_by` is non-empty → `{ ok: false, reason: "not_holder" }` (don't release a lock you don't own; heal's job via TTL).
3. Validate `next_tag` ∈ `{phase-ready, phase-active, phase-blocked, phase-completed}`.
4. Validate transition is legal per Master Directive §4.2 against the phase's current state.
5. Single atomic write:
   ```yaml
   state: <next_tag without "phase-" prefix>
   status: <same>
   tags: [...keep_non_phase_tags, <next_tag>]
   # Delete these keys:
   # locked_by, locked_at, lock_pid, lock_hostname, lock_ttl_ms
   updated: <now ISO>
   ```
6. Append to audit: `RELEASE <phase-relative-path> run=<run_id> next_tag=<tag>`.
7. Return `{ ok: true }`.

## Invariants

- **Single atomic write** for acquire and release. No sequence of `setPhaseTag` + `setLockFields` (that creates observable partial state).
- **Re-entrant acquire** is cheap and doesn't bump `locked_at`.
- **Release only by holder** — foreign release is a no-op (reason: `not_holder`). Healer handles stale locks.
- **TTL default 30 min.** Operations calling refresh every 5 min stay under the threshold indefinitely.
- **`updated:` bumped** on every actual write.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `schema_invalid` | Required fields missing | Return errors; do not attempt to lock. Caller should block the phase. |
| `not_ready` | Phase is `backlog`, `planning`, `blocked`, `completed` | Return with `current_tag`. Caller investigates. |
| `already_locked` | Fresh lock held by different runId, OR race-condition loss on read-back | Caller should pick a different phase. |
| `not_holder` | Release called but caller doesn't own the lock | Defensive no-op; log and return. |
| `invalid_transition` | `next_tag` doesn't match a legal transition from current state | Return error; caller should route through `planning` first. |
| `write_failed` | Edit on phase file raises | Retry once; if still fails, escalate to INTEGRITY. |

## Examples

**Example 1 — clean acquire:**

Input: phase is `phase-ready`, no lock fields set. `run_id = "agent-run-7f3a"`, `ttl_ms = 1800000`.

After acquire:
```yaml
status: active
state: active
tags: [onyx-phase, phase-active]
locked_by: agent-run-7f3a
locked_at: 2026-04-24T15:30:00Z
lock_pid: 28772
lock_hostname: dev-laptop
lock_ttl_ms: 1800000
updated: 2026-04-24T15:30:00Z
```

**Example 2 — re-entrant acquire:**

Input: phase already has `locked_by: agent-run-7f3a` from 5 min ago. Same `run_id` calls acquire again.

Output: `{ ok: true, run_id: "agent-run-7f3a" }`. **No write.** `locked_at` stays at the original timestamp.

**Example 3 — TTL-expired lock:**

Input: phase has `locked_by: abandoned-run`, `locked_at: 2026-04-24T14:00:00Z`, `lock_ttl_ms: 1800000`. Current time: `2026-04-24T15:30:00Z` (90 min elapsed).

Expired (90 > 30). Clear lock fields, set `phase-ready`, then proceed to acquire fresh with the new runId. Audit line: `lock_expired agent=abandoned-run elapsed_min=90`.

**Example 4 — race-condition loss:**

Two agents both see a `phase-ready` phase simultaneously. Both enter Step 5. Write A lands, then write B lands. Both read back. Only B's `locked_by` is there. Agent A sees `locked_by != run_id_A` in Step 6 → returns `already_locked`. Agent B returns `ok`.

Vault filesystem guarantees atomic writes; the last writer wins. Both agents see a consistent final state.

**Example 5 — release:**

Input: caller holds the lock; phase just completed. `next_tag = phase-completed`.

After release:
```yaml
status: completed
state: completed
tags: [onyx-phase, phase-completed]
updated: 2026-04-24T15:45:00Z
```
Lock fields removed. Audit line emitted.

## Relationship to heal-stale-locks

This skill's acquire handles TTL-expiry inline (Step 3) — clears and re-acquires in the same call. [[heal-stale-locks]] is complementary:
- **lock-lifecycle:acquire** handles expiry **on contention** (an agent tries to acquire and the existing lock is stale).
- **heal-stale-locks** handles expiry **periodically** (every heal run, whether anyone is trying to acquire or not).

Both paths produce the same end-state; heal-stale-locks catches locks no one is actively contending.
