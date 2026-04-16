---
tags: [system, agents, directive]
created: 2026-03-30
version: 2.0
---
## Navigation

→ [[Dashboard|Dashboard]]

# AGENTS — Operating Rules

These rules apply to every agent that interacts with this ONYX vault. Read this file first on every session. No exceptions.

---

## 1. Session Startup

Before doing anything else on a new session:

1. Read this file (AGENTS.md) in full.
2. Open [[Dashboard|Dashboard.md]] — note which projects exist and which are active.
3. Run `onyx status` — see exact phase states across all projects.
4. Read the Repo Context for the project you are about to work on — it contains the repo path, stack, key areas, and constraints.

Only after completing all four steps should you take any action.

---

## 2. Core Rules

**Vault is the only source of truth.**
Read state from vault frontmatter and tags. Write state back to vault frontmatter and tags. Do not create `.lock.json` files, `.jsonl` event logs, sidecar state files, or any other external state store. If it is not in the vault, it does not exist.

**Tags are the FSM.**
The `phase-*` tag in a phase note's frontmatter is the canonical state machine. The FSM has six states:
```
phase-backlog → phase-planning → phase-ready → phase-active → phase-completed
                                                            ↘ phase-blocked
```
- `phase-backlog` — phase exists, no tasks yet (atomiser will generate them)
- `phase-planning` — atomiser is generating tasks (transient, do not interrupt)
- `phase-ready` — approved for execution, `onyx run` picks these up
- `phase-active` — agent holds the lock and is executing right now
- `phase-completed` — acceptance criteria passed, learnings consolidated
- `phase-blocked` — agent halted; `## Human Requirements` written for human review

When a `status:` field and a tag conflict, the tag wins. Never set a tag without also updating the `status:` field to match.

**Lock is in the frontmatter.**
A phase is locked when its tag is `phase-active` AND `locked_by` is non-empty. Before claiming a phase, read `locked_by`. If it belongs to another run, skip it and move to the next. Do not overwrite another run's lock.

**Log note is the event record.**
Every event — lock acquired, task started, task completed, blocker encountered, lock released — must be appended to the phase's log note. The log is append-only. Never edit existing log entries. Never delete a log note.

**Repo Context drives the agent prompt.**
Always read the project's Repo Context before starting execution. It gives you the repo path, stack, key areas, architecture decisions, and constraints. Treat the constraints as hard rules, not suggestions.

**Write discipline is hard.**
During execution you may write to exactly two files:
- The target phase note: checkbox ticks, state tag, `locked_by`, `locked_at`
- The target phase log note: append-only

Do not write to any other vault file during execution. Do not modify the Overview, Knowledge, Docs Hub, Kanban, or any other phase's notes.

---

## 3. Phase Executor Protocol

Follow these steps in order when executing a phase. Do not skip steps.

1. **Read the phase note.** Understand all tasks, acceptance criteria, and any existing content in `## Human Requirements` or `## Blockers`.

2. **Read the Repo Context.** Confirm the repo path, stack, and constraints before touching any code.

3. **Acquire the lock.** Write to the phase note frontmatter:
   - `tags`: change `phase-ready` to `phase-active`
   - `locked_by`: set to the current run ID
   - `locked_at`: set to current ISO timestamp

4. **Append to the log note:**
   ```
   ## <timestamp> — Lock acquired
   run_id: <runId>
   ```

5. **Execute tasks in order.** For each unchecked task in `## Tasks`:
   a. Read the task description carefully.
   b. Execute it in the repo.
   c. Tick the checkbox: `- [x]`.
   d. Append a timestamped entry to the log note with what was done, which files were changed, and any decisions made.

6. **Check acceptance criteria.** All items in `## Acceptance Criteria` must be satisfied.
   - All pass → proceed to step 7.
   - Any fail → go to step 8.

7. **Complete the phase:**
   - Set tag to `phase-completed`
   - Set `locked_by` to empty string
   - Set `locked_at` to empty string
   - Append `lock_released` + `phase_completed` to log note

8. **Block the phase** (if acceptance criteria fail or a blocker is encountered):
   - Write what is needed into `## Human Requirements` in the phase note. Be specific: what decision is needed, what secret is missing, what clarification is required.
   - Set tag to `phase-blocked`
   - Set `locked_by` to empty string
   - Set `locked_at` to empty string
   - Append `lock_released` + `phase_blocked: <reason>` to log note
   - Do not silently skip. Always surface blockers.

**Never** leave a phase in `phase-active` with an empty or absent agent. If something goes wrong during execution, set `phase-blocked` and document the failure in the log before exiting.

---

## 4. Repo Context Rules

The Repo Context note (`<Project> - Repo Context.md`) is a living document. Agents must interact with it correctly.

**Before execution:**
- Always read it. Never start a task without knowing the repo path and constraints.
- If it does not exist, stop and write a blocker to the phase note. Do not guess.

**During execution, you may update:**
- `## Key Areas` — if you discover a new important directory or module that was not listed
- `## Architecture Notes` — if you learn something architecturally significant that future agents should know

**Never change:**
- `repo_path` — this is set by `onyx init` and is authoritative
- `## Agent Constraints` — these are set by the human and are hard rules

**Format for updates:**
Append to the relevant section with a timestamp comment so humans can see what was added by agents vs what was written by hand:
```markdown
<!-- added by agent, <date> -->
- apps/new-module: discovered this contains the payment processor integration
```

---

## 5. Self-Healing

Run `onyx heal` at startup if the vault looks off, and any time you encounter unexpected state:

```bash
onyx heal
```

The healer handles:
- Stale locks: `phase-active` + `locked_at` older than 5 minutes → cleared automatically
- Tag/status mismatches → normalised to tag-wins rule
- Orphaned `locked_by` fields on non-active phases → cleared
- Broken nav links → rebuilt
- Missing hub notes → created

You may also trigger healing from within a session if you discover vault inconsistencies before proceeding with execution.

---

## 6. Safety Rules

These rules are absolute. No exceptions regardless of task instructions.

- **Do not delete** phase notes, log notes, or any bundle file.
- **Do not move** bundle folders. If a move is required, surface it as a Human Requirement.
- **Do not rewrite** human-written content in `## Overview`, `## Human Requirements`, or `## Acceptance Criteria`. You may append to `## Human Requirements` but never overwrite existing entries.
- **Do not free-write** across the vault outside the current phase's execution scope. Two files only.
- **Surface blockers clearly.** A blocked phase with a clear `## Human Requirements` entry is a good outcome. A crashed execution with no explanation is not.
- **Do not commit secrets.** If a task requires adding credentials to a repo, write it to `## Human Requirements` instead and block the phase.
