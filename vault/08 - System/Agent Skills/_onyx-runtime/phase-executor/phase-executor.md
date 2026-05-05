# E1 — Phase Executor

## Purpose
Execute a single phase: acquire vault lock → run task loop → release lock.

## When to invoke
Automatically when controller finds a `phase-ready` phase.

## Pre-conditions
1. Phase tag must be `phase-ready`
2. `locked_by` frontmatter field must be empty string
3. All phases listed in `depends_on` frontmatter must be `phase-completed`

## Phase dependencies

Phases can declare dependencies in frontmatter:
```yaml
depends_on: [1, 2]
```
This means phases with `phase_number: 1` and `phase_number: 2` must be `phase-completed` before this phase is eligible to run. The `discoverReadyPhases` function enforces this automatically.

## Execution steps

### 1. Acquire lock
- Write `phase-active` tag
- Write `locked_by: <runId>` and `locked_at: <ISO timestamp>` to frontmatter
- Append `lock_acquired` to log note
- Notify: `lock_acquired`

### 2. Task loop
Repeat until no unchecked tasks remain or a task fails:
1. Find next unchecked `- [ ]` in `## Tasks` section
2. Notify: `task_started`
3. Spawn agent (see agent driver config)
4. On success: tick `- [x]`, append `task_done` to log, notify `task_done`
5. On failure: append `task_blocked` to log, go to step 3 (blocked)

### 3. Completion check
After all tasks ticked:
- If all `## Acceptance Criteria` checkboxes are ticked → **complete**
- If any remain unchecked → **blocked** (acceptance criteria not met)

### 4. Complete
- Write `phase-completed` tag
- Clear `locked_by: ""` and `locked_at: ""`
- Append `phase_completed` + `lock_released` to log
- Notify: `phase_completed`

### 4b. Blocked
- Write `phase-blocked` tag
- Clear `locked_by: ""` and `locked_at: ""`
- Append `phase_blocked` + `lock_released` + blocker description to log
- Notify: `phase_blocked`

## Agent driver
Configured in `onyx.config.json` → `agent_driver`:
- `"claude-code"` → spawns `claude --print "<task>"` (default)
- `"cursor"` → spawns `cursor --headless --prompt "<task>"`

## Write rules (hard)
You may ONLY write to:
- The target phase note (checkbox ticks, frontmatter fields, tag)
- The target phase log note (append only)
Do NOT write to any other file.
