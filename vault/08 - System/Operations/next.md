---
title: next
tags:
  - system
  - operation
  - onyx
type: operation-directive
version: 1.0
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: next

> Find the highest-priority `ready` phase across the vault (or within one project), show it, and offer to run it. If nothing is ready, suggest the next concrete action — resume an active phase, fix a blocked one, atomise a backlog phase, etc. The directive doesn't itself execute the phase — it dispatches to [[08 - System/Operations/execute-phase.md|execute-phase]].

## Preconditions
- A vault exists with at least one phase note.

## Invocation context
- Operator: `onyx next` (any project) or `onyx next <project>` (scope to one) or `onyx next --yes` (skip confirmation).
- Agent-driven: invoked at the start of a "what should I do" loop.

## Read order
1. All phase notes under `projects_glob`.
2. For each ready phase, body — to count tasks (`done/total`).

## Procedure

### Step 1 — Discover phases

Glob `<vault_root>/<projects_glob>/Phases/*.md`. Read frontmatter for each. If a project filter was passed, retain only phases whose `project_id` (or `project`) contains the filter substring (case-insensitive).

### Step 2 — Sort ready phases

Filter to phases with `state == 'ready'` (per Master Directive §5 derivation rules — `status:` field, fall back to `state:`, fall back to `phase-ready` tag).

Sort by:
1. `priority:` desc (default 5 if missing). Higher priority wins.
2. `risk:` ascending where `high=0, medium=1, low=2` (default medium). Higher risk first — Onyx prefers to surface scary work before safe work.
3. `phase_number:` ascending. Earlier phases first.

### Step 3 — Branch on whether anything is ready

**Case A — Ready phases exist.** Continue to Step 4.

**Case B — No ready phases.** Inspect what state the project IS in:

- **Active phase exists.** Print:
  ```
  ▶ Already running: <project> · P<N> — <phase_name>
    Progress: <done>/<total> tasks
    → Monitor: onyx logs "<project>" --follow
  ```
  Exit. Don't dispatch.

- **Blocked phases exist** (and no active). For up to 3 of them:
  ```
  ⚠ Blocked phases need your attention:
    <project> · P<N> — <phase_name>
      ↳ <first line of ## Human Requirements, capped 100 chars>
      → Fix it, then: onyx reset "<project>"
  ```
  Exit.

- **Backlog phases exist** (and no active, no ready, no blocked). Find the first backlog phase whose `depends_on` IDs are all `completed`:
  ```
  No ready phases. Next in backlog:
    <project>  ·  P<N> — <phase_name>
    → Generate tasks first: onyx atomise "<project>" <N>     [if no tasks yet]
    → Activate: onyx ready "<project>" <N>                   [if tasks exist]
  ```
  If no backlog phase has all deps satisfied, print: `No phases can run yet — unmet dependencies. Run: onyx status`.
  Exit.

- **All completed** (every phase done):
  ```
  All phases complete for <project>. Start new work:
    → Add a phase: onyx new phase "<project>" "Phase name"
    → New project: onyx init "New Project"
  ```
  Exit.

### Step 4 — Surface the top ready candidate

Take the first phase from the sorted list. Print:

```
● <project>  ·  P<N> — <phase_name>
  Priority: <P>  |  Risk: <risk>  |  Directive: <directive or 'none'>
  Tasks: <done>/<total> completed         [omit if no tasks]
  Queue: <next 3 ready phases as compact "<project> P<N>" entries> +<extra count> more
```

Count tasks by counting `- [x]` (done) and `- [ ]` (open) checkboxes in the phase body. The compact queue line is omitted if there's only one ready phase total.

### Step 5 — Confirmation gate

If `--yes` flag was passed, skip the prompt and dispatch immediately.

Otherwise prompt: `Run it? [Y/n] ` (default Y on bare Enter).

If `n` / `no` → print `Skipped. Run later: onyx run --project "<project>" --phase <N>` and exit.

If `Y` / `yes` / Enter → continue to Step 6.

### Step 6 — Dispatch

Print: `[onyx] Running P<N> — <phase_name>...`

Invoke [[08 - System/Operations/execute-phase.md|execute-phase]] with the resolved phase, scoped to this single phase + this project (`once: true`). The dispatch is the directive's only "side effect" — execute-phase owns the rest of the work (lock acquire, task loop, completion).

## Post-conditions & transitions
- **Case A → dispatch:** the phase transitions per execute-phase's rules (`ready → active → completed | blocked`).
- **Case B → no dispatch:** vault state unchanged. Advisory output only.

## Error handling
- **RECOVERABLE:** phase frontmatter malformed → skip that phase in the ready-set, continue with the rest.
- **BLOCKING:** project filter matches no projects → list available projects and exit.
- **NEVER WRITE WITHOUT CONFIRMATION** unless `--yes` was passed.

## Skills invoked
None directly — but Step 6 dispatches to `execute-phase`, which invokes `lock-lifecycle` and others.

## Tools invoked
None.

## Native primitives relied on
- **Glob** — phase discovery.
- **Read** — every phase's frontmatter; the top phase's body for task count + ## Human Requirements extraction (in blocked branch).
- **Stdin** — for the confirmation prompt (skipped under `--yes`).

## Acceptance (self-check before exit)
- Either: a single phase was selected + dispatched (Case A with confirmation).
- Or: a "what to do next" message was printed (Case B branches), no dispatch, no writes.
- The output names exactly one project + one phase number when dispatching, OR exactly one suggested action when not.

## Forbidden patterns
- **Never** auto-dispatch without `--yes`. The default is interactive — humans see the candidate before commitment.
- **Never** invent priority / risk values. Read them from frontmatter; default 5 / medium when missing.
- **Never** dispatch a phase that isn't `state == 'ready'`. Rebuild from current state every invocation; don't cache.
- **Never** modify frontmatter from this directive. Routing decisions don't write — execute-phase owns the writes.
