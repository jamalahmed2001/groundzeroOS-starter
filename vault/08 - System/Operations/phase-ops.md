---
title: phase-ops
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/phase-ops.ts
lines_replaced: 354
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

# Operation: phase-ops (atomic phase management)

> Four atomic phase verbs in one directive. Each modifies a phase's state via frontmatter writes — no agent execution, no LLM, no big context loads. The smallest write operations in the suite.
>
> Verbs: `ready`, `block`, `new-phase`, `check`.

## Common helper — `match-project`

Used by every verb except `check` (which uses it too):

1. Glob `<vault>/<projects_glob>/Phases/*.md`. Read frontmatter.
2. Filter to phases whose `project_id` (or `project` fallback) contains the operator's argument **case-insensitively**.
3. If zero matches → exit with `[onyx] No project matching "<arg>"` + `Available: onyx status`.
4. Pick the most-specific `project_id` among matches as the canonical id.
5. Return `{id, phases}`.

---

## Verb 1: `ready` — set a phase to phase-ready

**Args:** `<project> [phase-number]`.

### Procedure

1. `match-project <project>` → `{id, phases}`.
2. Resolve target:
   - If `phase-number` supplied: `phases.find(p => phase_number === <num>)`. Exit if missing.
   - Else (auto-pick): from phases with `state == 'backlog'`, find ones whose `depends_on[]` are all `completed`; sort by `phase_number` asc; take first.
   - If none activatable → exit with `No activatable backlog phase found in "<id>"` + `All phases may have unmet dependencies. Run: onyx status`.
3. Read current state. Branch:
   - `state == 'ready'` → `[onyx] <id> P<N> — <name> is already ready.` + `→ Run: onyx next`.
   - `state == 'active'` → `[onyx] <id> P<N> — <name> is currently active (agent running).`.
   - Otherwise → write tag.
4. **Write tag:**
   - In `tags:` frontmatter array, replace any existing `phase-*` tag with `phase-ready`.
   - In `status:` frontmatter, set to `ready`.
   - Bump `updated:` to current ISO timestamp.
5. Print: `[onyx] <id>  P<N> — <name>:  <prev> → ready` + `→ Run it: onyx next`.

---

## Verb 2: `block` — block a phase with a reason

**Args:** `<project> [phase-number] <reason>`.

### Procedure

1. `match-project <project>` → `{id, phases}`.
2. Resolve target:
   - If `phase-number`: exact match.
   - Else: first `state == 'active'`, fall back to first `state == 'ready'`.
   - If none → exit with `No active/ready phase found`.
3. Read body. Update `## Human Requirements` section:
   - If section exists → replace its body up to the next `##` heading with `\n\n<reason>\n`.
   - Else → insert before `## Agent Log` if present, otherwise append at end.
4. Write tag: `phase-blocked` (replacing existing phase-* tag), `status: blocked`, bump `updated:`.
5. Print: `[onyx] <id>  P<N> — <name>:  → blocked` + `Reason: <reason>` + `→ Fix it, then: onyx reset "<id>"`.

---

## Verb 3: `new-phase` — create a new phase file

**Args:** `<project> "<phase-name>" [--priority N] [--risk low|medium|high] [--directive <name>]`.

### Procedure

1. `match-project <project>` → `{id, phases}`.
2. Resolve `bundle_dir` from any phase's path (`dirname(dirname(phase.path))`).
3. Compute `new_num = max(phase_number, ...phases) + 1`.
4. Compute `depends_on = [new_num - 1]` if any phases exist, else `[]`.
5. Sanitise filename: strip non-alphanumeric (preserve spaces + hyphens), cap at 60 chars.
6. Target path: `<bundle_dir>/Phases/P<new_num> - <safe-name>.md`. Exit if file already exists.
7. Write the file with this exact frontmatter + body shape:

```markdown
---
project_id: "<id>"
phase_number: <new_num>
phase_name: "<original-name>"
state: backlog
status: backlog
risk: <opt --risk or medium>
priority: <opt --priority or 5>
[directive: <opt --directive>]   <- only if --directive supplied
depends_on: [<new_num - 1>]      <- or [] if first phase
locked_by: ""
locked_at: ""
tags:
  - onyx-phase
  - phase-backlog
created: <YYYY-MM-DD>
up: <id> - Phases Hub             <- if hub exists, else <id> - Overview
---

## 🔗 Navigation

**UP:** [[<id> - Phases Hub|Phases Hub]]

# P<new_num> — <phase-name>

## Summary

<phase-name>

## Acceptance Criteria

- [ ] _(define acceptance criteria)_

## Tasks

- [ ] _(generate tasks: onyx atomise "<id>" <new_num>)_

## Agent Log

_(none yet)_
```

8. `mkdir -p Phases/` if needed.
9. Print:
   - `[onyx] Created P<N> — <name>`
   - `Depends on: P<dep>` (if dep set)
   - `→ Generate tasks: onyx atomise "<id>" <N>`
   - `→ Skip tasks, activate: onyx ready "<id>" <N>`

---

## Verb 4: `check` — validate a project before running

**Args:** `<project>`.

### Procedure

1. `match-project <project>` → `{id, phases}`.
2. Print header: `\n─── <id> — check ───\n`.
3. Initialise `issues = 0`.

### 4. Overview check

- Path: `<bundle_dir>/<id> - Overview.md`.
- Missing → ✗ + `issues++`.
- Present → read its frontmatter.
  - Print `✓ Overview  (profile: <profile>)`.
  - Locate the profile file at `<vault>/08 - System/Profiles/<profile>.md`.
  - Read profile's `required_fields[]` from frontmatter.
  - For each required field, check Overview frontmatter has a non-empty value.
  - ✓ + value (truncated to 50 chars) on hit; ✗ + `issues++` on miss.
  - If profile file doesn't exist → ⚠ `Profile file not found`.

### 5. Knowledge.md check

- Path: `<bundle_dir>/<id> - Knowledge.md`.
- Present → ✓ with `(updated <X>d ago | today)` from mtime.
- Missing → ⚠ `learnings won't compound` (warn, not issue).

### 6. Phases iteration

For each phase, sorted by `phase_number`:

- Compute icon: `✓` completed, `▶` active, `✗` blocked, `→` ready, `○` other.
- Resolve directive label:
  - If frontmatter `directive:` set → check `<bundle>/Directives/<name>.md` (local) and `<vault>/08 - System/Agent Directives/<name>.md` (system); print which exists, or `✗ NOT FOUND` (`issues++`).
  - Else if `cycle_type:` set → `cycle: <type> (auto-wired)`.
- Compute `unmet = depends_on[].filter(d => d not in completed-numbers)`.
- Print `<icon> P<N> — <name>  [<state>]<dir-note>`.
- If `unmet.length > 0` → ⚠ `waiting on: P<a>, P<b>`.
- If state ∉ {completed, active} AND task count == 0 → ⚠ `no tasks — onyx atomise "<id>" <N>`.
- If state == 'blocked' → extract first line of `## Human Requirements` (capped 100 chars), print as `↳ <reason>`.

### 7. Summary

- `issues > 0` → `<N> issue(s) found. Fix before running.`
- Else → `All checks passed. → onyx next "<id>"`.

---

## Skills invoked
None.

## Tools invoked
None irreducible. Native primitives suffice.

## Native primitives relied on
- **Glob** — phase + Overview + profile discovery.
- **Read** — frontmatter + body parses.
- **Edit** — `ready` tag swap, `block` HR section replace, frontmatter writes.
- **Write** — `new-phase` file creation.
- **Bash** — `mkdir -p` for `new-phase`, `stat -c %y` for Knowledge mtime.

## Acceptance (self-check)
- For `ready`: target phase's tag changed to `phase-ready` (or appropriate no-op message printed).
- For `block`: target phase's tag changed to `phase-blocked`, `## Human Requirements` populated.
- For `new-phase`: file exists at the expected path with all required sections.
- For `check`: report row printed for every phase + Overview + Knowledge state. Exit code reflects `issues == 0`.

## Shadow-mode comparison criteria
**RED:** different target phase chosen (auto-pick), different file path written (`new-phase`), different `issues` count (`check`), different `unmet`-deps detection.
**YELLOW:** wording of advisory messages.
**GREEN:** same writes, same counts, same target identification.

Five GREEN runs across the four verbs (multiple per verb) → graduate, delete `src/cli/phase-ops.ts`.

## Forbidden patterns
- **Never** create a phase file that overwrites an existing one. Exit on collision.
- **Never** swallow `unmet` deps silently — always surface them in `check`.
- **Never** modify a phase's `phase_number` after creation. The number is identity.
- **Never** write `state: ready` without also setting the `phase-ready` tag (and vice versa). State + tag must agree.
