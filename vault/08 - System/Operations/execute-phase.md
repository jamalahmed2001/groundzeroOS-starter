---
title: execute-phase
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/executor/runPhase.ts + src/executor/selectTask.ts
lines_replaced: 833
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 5
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: execute-phase

> The hot path. Acquire lock → load context → task loop (select-next → execute → tick → log) → complete or block. Everything inlined except lock lifecycle (shared with atomise + heal) and the task's own work (delegated to native tools + profile whitelist).

## Preconditions
- Phase `status:` is `ready` (or `active` if healer cleared a stale lock in step 1 of this iteration).
- Phase frontmatter is schema-valid (fields parseable; `project_id` / `project` present).
- At least one unchecked `- [ ]` task exists somewhere in the phase body.
- All `depends_on:` phase IDs are `completed`.
- For profiles with required fields (engineering: `repo_path`, `test_command`): those fields are set and (for paths) exist on disk.

## Invocation context
- From [[08 - System/Operations/route.md|route]] on `status: ready` or `active`.
- Explicit: `onyx run --phase <n>` (after migration, a directive loader).

## Read order
Canonical load order (Master Directive §8):
1. Phase file — full content.
2. Project Overview.md — identity, profile, required fields.
3. Profile from `08 - System/Profiles/<profile>.md` — `allowed_shell`, `denied_shell`, acceptance-gate patterns.
4. Directive (if phase declares one) — bundle-local wins over system-global.
5. Project Knowledge.md — prior learnings.
6. Any `[[wikilink]]` target in phase body that hasn't been read.
7. Profile's declared context doc (Repo Context for engineering, Source Context for research, etc.).
8. Skills declared in phase `skills:` field.

## Procedure

### Step 1 — Backup + acquire
1. Snapshot the phase file + log file to `<bundle>/_backups/<phase>-<runId>.md` (pre-execution state for potential rollback).
2. Invoke [[08 - System/Agent Skills/_onyx-runtime/lock-lifecycle/lock-lifecycle.md|lock-lifecycle]] `acquire` with `phase_path`, `run_id`, target tag `phase-active`.
   - If acquire returns `already_locked` (fresh lock) → return `lock_contention`; do not proceed.
   - If `schema_invalid` → emit errors; return `error`.
   - If `ok` → proceed.
3. Notify: event `lock_acquired`, project, phase. Append `lock_acquired` to phase log.

### Step 2 — Preflight
Before spawning any sub-agent work, verify:
1. **Tasks exist.** Body contains at least one line matching `^\s*-\s*\[\s*[x ]?\s*\]`. If not → phase is not atomised. Release lock with tag `phase-blocked`; populate Human Requirements: `"No task checkboxes found — atomise this phase first: onyx atomise \"<project>\" <phase_number>"`. Call [[08 - System/Operations/surface-blocker.md|surface-blocker]] and return `blocked`.
2. **Required fields.** For each field in `profile.required_fields`: resolve from Overview frontmatter (fallback to phase frontmatter). If missing or (for paths) non-existent → blocked with specific message.
3. **Dependencies met.** For each ID in `depends_on`, verify the referenced phase has `state: completed` or `phase-completed` tag. Missing deps → warnings (not fatal); unmet deps → warnings logged but phase still runs (operator override).

If any fatal preflight issue → write HR, release lock (`phase-blocked`), notify, return `blocked`.

### Step 3 — Task selection (inline algorithm)
Called every iteration of the task loop. Reads the current phase content fresh each time.

```
Input: phase body (freshly read)
Output: one unchecked task line (with any multi-line continuation body), OR null if no tasks left
```

**Priority 1 — the agent-writable plan block.** Between the markers `<!-- AGENT_WRITABLE_START:phase-plan -->` and `<!-- AGENT_WRITABLE_END:phase-plan -->`, find the first line matching `^\s*[-*]\s*\[\s\]`. If found:
- Collect its continuation: subsequent lines that are indented, non-blank, not another checkbox, not a heading, not a comment — join into one multi-line task string.
- Return if the task has meaningful content beyond the bare checkbox.

**Priority 2 — the `## Tasks` section.** Walk the body:
- Normalise headings by stripping leading emoji + whitespace + lowercasing.
- Enter "tasks section" when heading matches `tasks`.
- Leave when heading matches any of: `acceptance criteria`, `blockers`, `log`, `notes`, `learnings`.
- H3/H4 subheadings inside `## Tasks` do not exit the section.
- Return the first `^\s*[-*]\s*\[\s\]` line (with continuation collected).

**Priority 3 — fallback (only if no `## Tasks` heading exists).** Scan whole body for any unchecked checkbox outside skip sections. Return the first.

**None found** → return `null` (all tasks done).

### Step 4 — Task loop

Set counters: `tasksCompleted = 0`, `consecutiveFailures = 0`, `taskAttempt = 1`, `completedTasksList = []`.

Enter the loop:

```
while true:
  if shutdown_requested: write_checkpoint(); break
  task = select_next_task(fresh_read(phase_path))  # Step 3 inline
  if task == null: break
  
  # Execute the task
  outcome = execute_task(task, context)             # see below
  
  if outcome.success:
    tick_checkbox(phase_path, task)
    append_log(phase_path, run_id, 'task_done', task_summary)
    refresh_lock(phase_path, run_id)                # lock-lifecycle refresh
    tasksCompleted += 1
    completedTasksList.append(task_summary)
    consecutiveFailures = 0
    taskAttempt += 1
    continue
  
  # Failure
  append_log(phase_path, run_id, 'task_failed', outcome.reason)
  consecutiveFailures += 1
  
  if consecutiveFailures >= 3:
    # Phase-fatal blocker
    blockers.append(f"Task stuck after 3 consecutive failures: {task}")
    break
  
  # Mark the task as blocked but continue with remaining tasks
  mark_task_blocked(phase_path, task, outcome.reason)
  taskAttempt += 1
```

### Step 5 — Execute a single task

For each task string:

1. **Check for a shell fast-path.** If the task contains a single backticked command (regex `\`([^`]+)\``) AND that command's first token is in `profile.allowed_shell` AND not in `profile.denied_shell` AND doesn't match a destructive pattern → run it directly via Bash, capture stdout/stderr, check exit code. Timeout 60s. Return success/failure based on exit code.

2. **Otherwise, delegate to a sub-agent via the native Task/Agent tool.** Build a prompt containing:
   - The task text (parent + sub-task lines).
   - The profile's directive context (what role, what constraints).
   - The project's Knowledge.md (recent learnings).
   - Repo context if engineering profile (repo tree + relevant file reads).
   - Master Directive invariant 16 (shell whitelist — the sub-agent must respect it too).

   Invoke Task tool. Wait up to 600s (10 min). Capture output + `files_changed` (via `git diff --name-only HEAD` in the repo cwd).

3. **Classify the result.**
   - Exit 0 + meaningful output → success.
   - Exit non-zero or timeout → failure; record the error message as `reason`.
   - Agent returns "blocked" indicator (e.g. says it needs human input) → failure with reason `agent_requested_block`.

### Step 6 — After loop exits

**Case A: all tasks ticked + acceptance criteria met.**

Acceptance-met check:
- For every `- [ ]` checkbox in `## Acceptance Criteria` and `## Verification` (excluding `### Human` sub-section under Verification): all must be ticked.
- If neither section exists → acceptance is vacuously met.

If met:
1. Invoke [[08 - System/Operations/consolidate.md|consolidate]] inline (synchronously) — extracts learnings, writes to Knowledge.md, optionally propagates cross-project.
2. Invoke [[08 - System/Agent Skills/_onyx-runtime/lock-lifecycle/lock-lifecycle.md|lock-lifecycle]] `release` with target tag `phase-completed`.
3. Transition `active → completed`. Bump `updated:`. Write `state: completed`, `status: completed`, swap `phase-active` → `phase-completed` in tags.
4. If engineering profile: tag the repo: Bash `git -C <repo_path> tag -a "onyx/<project>/P<N>-complete" -m "Phase <label> complete"` (subject to allowed_shell).
5. Notify: event `phase_completed`.
6. ExecLog: `COMPLETED <duration> tasks=<N>`.
7. Return `completed`.

**Case B: tasks done but acceptance unmet, OR 3 consecutive failures, OR explicit block.**

1. Populate `## Human Requirements` if not already set — describe what acceptance is unmet or which task kept failing.
2. Release lock with `phase-blocked`.
3. Transition `active → blocked`.
4. Call [[08 - System/Operations/surface-blocker.md|surface-blocker]] inline.
5. Notify: event `phase_blocked`.
6. ExecLog: `BLOCKED <duration> tasksCompleted=<N>`.
7. Return `blocked`.

**Case C: shutdown_requested.**

1. Write continue-checkpoint file at `<bundle>/_checkpoints/<phase>-continue.md` describing completed tasks + next task.
2. Release lock WITHOUT changing `status:` (stays `active` so next iteration resumes — unless shutdown is fatal).
3. Return `interrupted`.

## Post-conditions & transitions
- Success: `ready/active → completed`. Knowledge.md consolidated. Repo tagged (engineering).
- Blocker: `active → blocked`. Human Requirements populated. Notification sent.
- Interrupt: no status change. Checkpoint written.

## Error handling
- **RECOVERABLE:** single task failure (retry via task-loop's blocked-but-continue path). Agent timeout (one retry at task level). Shell-exec non-zero on an isolated task (mark that task blocked, continue).
- **BLOCKING:** 3 consecutive task failures; acceptance criteria unmet after all tasks ticked; explicit block signal from a sub-agent.
- **INTEGRITY:** schema-invalid phase frontmatter (detected by lock-lifecycle at acquire); acceptance check crashes because `## Acceptance Criteria` is malformed.

## Skills invoked
- [[08 - System/Agent Skills/_onyx-runtime/lock-lifecycle/lock-lifecycle.md|lock-lifecycle]] — acquire / refresh / release.

Everything else inlined per "minimal code" preference:
- Task selection (Step 3) — was `select-next-task`, now inline.
- Task loop (Step 4) — was `phase-task-loop`, now inline.
- Sub-agent delegation (Step 5.2) — uses native Task/Agent tool, no wrapper skill.

## Tools invoked
- `tools/write-exec-log.sh` — at every task event + final completion/block.

## Native primitives relied on
- **Read** — every file in §Read order, fresh phase reads each loop iteration.
- **Edit** — tick checkboxes, update frontmatter, populate Human Requirements, bump `updated:`.
- **Bash** (via profile whitelist) — shell fast-path for backticked tasks; `git tag` on phase complete.
- **Task / Agent tool** — sub-agent delegation when the task isn't a simple shell command.
- **Grep / Glob** — context loading, file existence checks.

## Acceptance (self-check before exit)
- Every task in `## Tasks` / plan block is either `- [x]` (done), `- [!]` (blocked with reason), or the phase transitioned to `blocked` before exhausting them.
- If `completed`: every `## Acceptance Criteria` + `## Verification` (excluding `### Human`) item is ticked.
- `lock_*` frontmatter fields cleared.
- `updated:` current.
- Log file has at least the events: `lock_acquired`, one per task, `phase_completed` or `phase_blocked`, `lock_released`.

## ExecLog entry format
Per task and final outcome:
```
<ISO> | <project> | <phase> | <STATUS> | <duration-sec> | <summary>
```
Where `STATUS` is one of `ACQUIRE`, `RELEASE`, `COMPLETED`, `BLOCKED`, `INTEGRITY_ERROR`, `ABANDONED`, `CONTINUING`.

## Shadow-mode comparison criteria

Biggest and hottest operation — needs the strictest shadow mode.

For each phase shadow-executed by both TS + directive:
- **Behaviour divergence gates deletion.** Any of these is red:
  - Different completion status (one completes, other blocks).
  - File-change set differs by more than a whitespace/comment diff.
  - Tasks ticked in different order (loop is deterministic in both; drift is a bug).
  - Acceptance-met check produces different verdicts on the same AC content.
  - Lock acquire/release ordering differs.
- **Acceptable divergences:**
  - Exact `updated:` timestamps (ISO precision).
  - Log message wording inside log file (semantic match OK).
  - `git tag` message text (both must tag, content may differ in wording).

Two weeks of real-vault shadow-mode zero-diff-on-fatal-bucket = green for `src/executor/` deletion.
