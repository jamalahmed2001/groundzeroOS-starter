---
title: plan
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/plan.ts
lines_replaced: 97
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

# Operation: plan (daily planning)

> Generate a daily plan in `04 - Planning/Daily - YYYY-MM-DD.md` using the [[08 - System/Agent Skills/plan-my-day - Skill Overview.md|plan-my-day]] skill, with `phase-ready` phases auto-injected as the work-task source.
>
> The TS path spawned a fresh `claude --print` subprocess with the skill prompt. The directive version invokes the running agent directly.

## Preconditions
- `plan-my-day` skill exists (Skill Overview at `08 - System/Agent Skills/`, implementation at `~/clawd/skills/plan-my-day/SKILL.md` or `<repo>/skills/plan-my-day/SKILL.md`).
- Vault has `04 - Planning/` directory (or it gets created).

## Invocation context
- Operator: `onyx plan` (today) or `onyx plan YYYY-MM-DD` (specific date).
- Scheduled: cron at the start of the workday, no args.

## Read order
1. `plan-my-day` skill body (the full skill instructions).
2. All phase notes with `phase-ready` tag.
3. (Skill itself reads inbox, prayer-times, project budgets, etc.)

## Procedure

### Step 1 — Resolve target date
- Default: `new Date().toISOString().slice(0, 10)`.
- If operator passed `YYYY-MM-DD`, validate format and use that.

### Step 2 — Load the skill body
- Try `~/clawd/skills/plan-my-day/SKILL.md` first.
- Fall back to `<repo>/skills/plan-my-day/SKILL.md`.
- If neither exists, exit with `[onyx plan] SKILL.md not found at <searched paths>`.

### Step 3 — Discover phase-ready phases
Glob phases with `tags` containing `phase-ready`. For each, capture:
- `project` (or `project_id`)
- `phase_number`
- `phase_name`
- First open task (first line matching `^\s*- \[ \]\s*` from body), trimmed.

### Step 4 — Build phase context block
If any ready phases exist, compose:

```markdown

---

## onyx Phase Context (auto-injected)

The following phases are currently **phase-ready** in the vault. Use these as the source of work tasks when building the plan — they replace reading Kanban files manually for these projects.

- [<project>] P<N> — <phase_name>
   First task: <first task line>
- [...]

---

```

### Step 5 — Run the plan skill
The directive runs in the agent. Compose the full prompt as `<skill body>\n\n<phase context block>\n\nRun this plan for date: <YYYY-MM-DD>`.

Then **execute the skill in-context**: read the skill, ingest the phase context, walk through the skill's procedure (which typically reads inbox, prayer times, time-blocks, writes a Daily plan note).

The skill writes the Daily plan to `<vault>/04 - Planning/Daily - <date>.md` per its own template.

### Step 6 — Print summary
```
[onyx plan] Generating daily plan for <date>...
  <N> ready phases injected as work context
  Plan written to: <vault>/04 - Planning/Daily - <date>.md
```

## Post-conditions
- A new `Daily - <date>.md` exists in `04 - Planning/`.
- No phase frontmatter modified.
- Inbox triage state, time blocks, etc. — handled by the skill's own logic.

## Skills invoked
- [[08 - System/Agent Skills/plan-my-day - Skill Overview.md|plan-my-day]] — the skill that produces the Daily plan note.

## Tools invoked
None irreducible (plan-my-day skill may invoke its own tools).

## Native primitives relied on
- **Read** — skill body, every phase frontmatter + first task line.
- **Glob** — phase discovery.
- **Write** — the Daily plan note (via the skill).

## Acceptance (self-check)
- `Daily - <date>.md` exists with content matching the plan-my-day skill's template.
- Operator's `[onyx plan]` summary printed.
- No phase frontmatter modified.

## Shadow-mode comparison criteria
**RED:** different file path written, missing required sections from plan-my-day skill, different phase count in injected context, different date.
**YELLOW:** prose content of the plan (running agent vs `claude --print` subprocess will produce subtly different output).
**GREEN:** structural match — same file written, same date, same number of injected phases.

Three GREEN runs → graduate, delete `src/cli/plan.ts`.

## Forbidden patterns
- **Never** spawn a separate `claude` subprocess. The agent IS the LLM.
- **Never** skip the phase-context injection — that's the whole point of the onyx wrapper around plan-my-day.
- **Never** write a Daily plan that doesn't follow the skill's section structure.
