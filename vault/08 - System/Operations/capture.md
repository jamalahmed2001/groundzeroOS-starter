---
title: capture
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/capture.ts
lines_replaced: 30
version: 0.1
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 7
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: capture

> Fire-and-forget thought capture. Append to `00 - Dashboard/Inbox.md` with a timestamp; triage happens at next plan run.

## Preconditions
- `vault_root` set; `00 - Dashboard/` directory either exists or can be created.

## Invocation context
- Operator: `onyx capture "<text>"` — usually mid-work, drop something for later.
- Agent-driven: when an unrelated task surfaces during execution that shouldn't derail the current phase.

## Read order
- None (write-only operation).

## Procedure

### Step 1 — Validate input
- If `<text>` empty/missing → print usage and exit cleanly:
  ```
  Usage: onyx capture "your thought or task"
         Saves to Obsidian Inbox for triage in next plan.
  ```

### Step 2 — Compose the entry
- Timestamp: `YYYY-MM-DD HH:MM` UTC (16-char ISO slice, space-separated).
- Entry line: `- [ ] <text> — _captured <timestamp>_\n`.

### Step 3 — Append or create
- Path: `<vault_root>/00 - Dashboard/Inbox.md`.
- If exists → **append** the entry line.
- If not → **create** with `# Inbox\n\n<entry>`.
- `mkdir -p` the parent directory if missing.

### Step 4 — Print
```
Captured: "<text>"
→ <inbox path>
```

## Post-conditions
- `Inbox.md` has one new line at the end.
- No other file modified.

## Skills invoked
None.

## Tools invoked
None.

## Native primitives relied on
- **Bash** — `mkdir -p`, append append.
- **Write** — the entry line.

## Acceptance (self-check)
- Last line of Inbox.md matches the entry line written.
- File mtime is current.

## Shadow-mode comparison criteria
**RED:** different file written to, missing timestamp, missing checkbox prefix.
**YELLOW:** none — this op is too mechanical to vary.
**GREEN:** byte-equal append.

One GREEN run → graduate (this op is trivially deterministic), delete `src/cli/capture.ts`.

## Forbidden patterns
- **Never** open a heavy editor; capture must be sub-second.
- **Never** lose existing Inbox content. Append, don't overwrite.
- **Never** skip the timestamp — without it the operator can't recover when an item dropped in.
