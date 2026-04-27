---
title: logs
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/logs.ts
lines_replaced: 62
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

# Operation: logs

> Read-only. Print a phase's execution log to stdout. Either by phase identifier (name or number) or `--recent` (most-recently-modified log across the vault).

## Preconditions
- A vault exists with at least one phase.

## Invocation context
- Operator: `onyx logs <phase-name-or-number>` or `onyx logs --recent`.
- Agent-driven: rarely — agents typically read the log file directly.

## Read order
1. Phase frontmatter (to derive log path).
2. The log file at `<bundle>/Logs/L<N> - P<N> - <phase_name>.md`.

## Procedure

### Step 1 — Validate args
- No arg → print usage and exit:
  ```
  Usage: onyx logs <phase-name-or-number>
         onyx logs --recent   (show last active log)
  ```

### Step 2 — Branch

**Branch A — `--recent`:**
1. Glob all phases.
2. For each, derive the log path: `<bundle>/Logs/L<phase_number> - P<phase_number> - <phase_name>.md`.
3. Filter to log files that exist on disk.
4. Sort by mtime descending.
5. Take the first.
6. If none exist → `No logs found.` and exit.
7. Print `\n=== <phase_name> ===\n\n<log file content>`.

**Branch B — phase identifier:**
1. Glob all phases.
2. Match: `phase_name` contains arg case-insensitively OR `phase_number == arg`.
3. If no match → `No phase found matching "<arg>"` and exit.
4. Derive log path (same formula as Branch A).
5. If log doesn't exist → `No log found at: <path>` and exit.
6. Print `\n=== Log: <phase_name> ===\n\n<log file content>`.

## Post-conditions
- No file modified.
- Stdout has the log file's full content with a header.

## Skills invoked
None.

## Tools invoked
None.

## Native primitives relied on
- **Glob** — phase discovery.
- **Read** — phase frontmatter, log file content.
- **Bash** (optional) — `stat -c%Y` for mtime sort in `--recent` branch.

## Acceptance (self-check)
- Log file content printed verbatim with the `=== ... ===` header.
- No vault writes.

## Shadow-mode comparison criteria
**RED:** different log selected for `--recent`, different log file path derived, missing log content from output, exit code mismatch.
**YELLOW:** wording of "No logs found" / "No phase found".
**GREEN:** byte-equal output for the same input.

Three GREEN runs → graduate, delete `src/cli/logs.ts`.

## Forbidden patterns
- **Never** truncate the log content.
- **Never** modify the log file (this op is read-only).
- **Never** confuse `--recent` with `--latest` or `--all`. The flag is exact.
