---
name: audit-trail
description: Append events to <vault>/.onyx-audit/audit.jsonl, list events, recover PID-orphaned locks. Replaces src/audit/recover.ts + src/audit/trail.ts (66 LOC).
metadata:
  clawdbot:
    emoji: "📜"
    requires: ["bash", "jq", "find", "awk"]
---

# audit-trail

Tiny audit-log skill for ONYX. Three verbs: `append`, `list`, `recover`.

## Audit format

`<vault>/.onyx-audit/audit.jsonl` — one JSON object per line. Required keys: `ts`, `event`, `phaseNotePath`. Optional: `projectId`, `pid`, `detail`.

## Verbs

### append

```
audit-trail append --vault <path> --event <name> --phase <phase-path> \
                   [--project <id>] [--pid <int>] [--detail "<text>"]
```

Appends one JSON line. `ts` is set to current UTC `YYYY-MM-DDTHH:MM:SSZ`. Echoes the appended line on stdout.

### list

```
audit-trail list --vault <path> [--project <id>]
```

Prints every event line, optionally filtered to one project. Empty file or no `--project` matches → empty output, exit 0.

### recover

```
audit-trail recover --vault <path> --projects-glob "01 - Projects/**"
```

Walks every phase file matching the glob that contains `phase-active`. For each, reads `lock_pid` from frontmatter. If the PID is **not running** (`kill -0` fails):
1. Swap `phase-active` tag → `phase-ready` in frontmatter `tags[]`.
2. Clear `locked_by`, `locked_at`, `lock_pid`, `lock_run_id`, `lock_acquired_at`.
3. Set `status: ready`, `state: ready`.
4. Append a `lock_force_cleared` event to the audit log.
5. Print `recovered: <phase> (PID <pid> gone)`.

Reports the count: `[audit-trail] cleared <N> orphaned lock(s)`.

## When to use

- Inside `execute-phase` — after a transition (lock acquire, complete, block), call `append` so the audit trail captures every state change.
- Inside `heal` Step 1 — call `recover` to pick up locks left behind by crashed agent processes.
- Inside `explain` / `next` — call `list` to read recent activity.

## Why bash, not TS

The original TS was thin wrapper over `fs.appendFileSync` and `process.kill(pid, 0)`. Both have direct shell equivalents (`>>` for append, `kill -0 <pid>` for liveness probe). 66 LOC of TS becomes ~80 LOC of bash with no behaviour loss.

## Forbidden patterns

- **Never** synchronously read the entire jsonl into memory for `list` — the file grows monotonically. Use `jq -c` streaming or `cat`/`grep`.
- **Never** edit historical audit entries. Append-only is the contract.
- **Never** auto-recover a lock whose PID is **still running**. The `kill -0` check must succeed (return 0) to skip — the recovery only triggers on `kill -0` failure.
