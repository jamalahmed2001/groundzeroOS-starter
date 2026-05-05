---
title: linear-uplink
tags:
  - system
  - operation
  - onyx
  - linear
type: operation-directive
replaces: src/linear/uplink.ts + src/cli/linear-uplink.ts
lines_replaced: 309
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

# Operation: linear-uplink

> Push a vault bundle's phases back to Linear as sub-issues of a single project parent issue. Each phase gets a Linear issue (created if absent, updated if present). The vault's frontmatter is the source of truth for `linear_issue_id`; the directive writes new IDs back to phase frontmatter on first uplink.
>
> The directive is the orchestration. The HTTP boundary lives in [[skills/linear|the linear skill]]. This directive replaces `src/linear/uplink.ts` (244 LOC) + the corresponding CLI command.

## Preconditions

- `LINEAR_API_KEY` set in env.
- `LINEAR_TEAM_ID` set in env (or in `onyx.config.json` `linear.team_id`).
- Bundle exists at the given path with an `Overview.md` carrying `project_id` (or matching the bundle folder name).
- At least one phase note exists in `Phases/`.

## Invocation context

- Operator: `onyx linear-uplink <bundle-path>` (CLI doorbell — until graduated, the TS path is canonical and this directive runs in shadow).
- Agent-driven: invoked after `atomise` if the bundle's Overview frontmatter has `linear_uplink: true`.

## Read order

1. This directive.
2. `skills/linear/SKILL.md` — verb reference.
3. `onyx.config.json` — `linear.team_id`.
4. The bundle's Overview.md — for `linear_project_id`, `linear_parent_issue_id`, `project_id`.
5. Every phase under `Phases/*.md` — frontmatter + body.

## Procedure

### Step 1 — Resolve identities

1. **Read Overview frontmatter.** Capture: `project_id`, `linear_project_id` (may be empty), `linear_parent_issue_id` (may be empty).
2. **Resolve Linear project ID** if Overview doesn't have one:
   ```
   linear find-project --team-id <team_id> --name "<project_id>"
   ```
   If it returns `{}`, the project doesn't exist on Linear yet — proceed without `linear_project_id`. (Sub-issues will still be created under the parent issue but won't be in a Linear project; that's fine for now.) If it returns `{id, name}`, write `linear_project_id: <id>` back to Overview frontmatter.
3. **Resolve auto-fields** (in parallel):
   ```
   linear viewer                            → assignee_id
   linear active-cycle --team-id <team_id>  → cycle_id (may be empty)
   linear find-labels --team-id <team_id> --patterns "^Creator Experience$"
                                            → label_ids[]
   ```
   These are non-fatal — if any fail, proceed without that field. Log a warning.

### Step 2 — Ensure the parent issue exists

If `Overview.linear_parent_issue_id` is empty:

1. Build the parent description: progress (X/Y phases complete), `## Overview` extracted from Overview.md (or first 500 chars), `## Phases` checklist (one line per phase: `- [{x| }] **P<N> — <name>** (<status>, <done>/<total> tasks)`), trailing `*Synced from ONYX vault*`.
2. Create:
   ```
   linear issue-create \
     --team-id <team_id> \
     --title "<project_id>" \
     --description "<parent_desc>" \
     [--project-id <linear_project_id>] \
     [--assignee-id <assignee_id>] \
     [--cycle-id <cycle_id>] \
     [--label-ids "<label_id_csv>"]
   ```
3. Write `linear_parent_issue_id: <new-id>` back to Overview frontmatter.

If it already exists, skip the creation but **update its description** so the progress line and `## Phases` checklist reflect current vault state:
```
linear issue-update --id <linear_parent_issue_id> --title "<project_id>" --description "<refreshed_desc>"
```

### Step 3 — For each phase: create or update a sub-issue

For each `Phases/*.md`:

1. Read frontmatter + body.
2. Extract:
   - `phase_number`, `phase_name`, `status`
   - `linear_issue_id` (may be empty)
3. Build the description:
   - Header line: `**Status:** <status> | **Progress:** <done>/<total> tasks`
   - `## Summary` — extracted from `## Summary` body section (if present)
   - `## Tasks` — every checkbox line `- [ ]` / `- [x]` (cap at 30 to stay under Linear limits)
   - `## Acceptance Criteria` — extracted from that section
   - Trailing `*Synced from ONYX vault*`
4. Build the title: `P<phase_number> — <phase_name>`
5. **Branch on linear_issue_id:**

   **Empty** (first uplink for this phase):
   ```
   linear issue-create \
     --team-id <team_id> \
     --title "P<N> — <name>" \
     --description "<desc>" \
     --parent-id <linear_parent_issue_id> \
     [--project-id <linear_project_id>] \
     [--assignee-id <assignee_id>] \
     [--cycle-id <cycle_id>] \
     [--label-ids "<label_id_csv>"]
   ```
   On success, write `linear_issue_id: <new-id>` back to phase frontmatter. Increment `created`.

   **Set** (re-uplink):
   ```
   linear issue-update \
     --id <linear_issue_id> \
     --title "P<N> — <name>" \
     --description "<desc>" \
     --team-id <team_id>
   ```
   Increment `updated`.

6. Append a log entry to the phase's log file: `<ISO> | linear_uplink_done | <Created|Updated> Linear issue: P<N> — <name>` (or `Failed: <reason>` on error).

### Step 4 — Notify + return

Emit `linear_uplink_done` via openclaw:

```
openclaw \
  --event linear_uplink_done \
  --project "<project_id>" \
  --phase "-" \
  --severity info \
  --message "[INFO] <project>/-: created:<C> updated:<U> skipped:<S>[ errors:<E>]"
```

Print a JSON summary on stdout: `{ created, updated, skipped, errors: [...] }`.

## Post-conditions & transitions

- Each phase has `linear_issue_id` set in frontmatter.
- Overview has `linear_parent_issue_id` set; updated description reflects current state.
- Linear shows one parent issue with all phases as sub-issues, descriptions current.
- `linear_uplink_done` notification fired.
- No phase status transitions — uplink is read-the-vault, write-Linear; the vault stays authoritative.

## Error handling

- **RECOVERABLE:** Linear API transient errors (429, 5xx) — auto-retried in the skill; if the skill exits 1 for a single phase, log the error, continue with the rest, include in `errors[]`.
- **RECOVERABLE:** unable to resolve viewer / cycle / labels — proceed without those fields; log warnings.
- **BLOCKING:** `LINEAR_API_KEY` or `LINEAR_TEAM_ID` not set.
- **INTEGRITY:** parent issue creation succeeds but the returned ID is empty / malformed — halt; this is a Linear API contract violation worth surfacing.

## Skills invoked

- `skills/linear/bin/linear` — verbs used: `find-project`, `viewer`, `active-cycle`, `find-labels`, `issue-create`, `issue-update`.

## Tools invoked

- `tools/write-exec-log.sh` — final summary line.

## Native primitives relied on

- **Bash** — invoke the linear skill, pipe through `jq`.
- **Read** — Overview, every phase, every phase's log file.
- **Edit** — write `linear_issue_id` and `linear_parent_issue_id` back to frontmatter; append to logs.
- **Glob** — enumerate `Phases/*.md`.

## Acceptance (self-check before exit)

- Every phase that exists has `linear_issue_id` set in frontmatter (either pre-existing or newly written).
- Overview has `linear_parent_issue_id` set.
- Counts summary printed.
- Notification fired.
- Per-phase log entries appended.

## Shadow-mode comparison criteria

For each shadow run (`tools/shadow-run.sh linear-uplink "<bundle>/Overview.md"`):

- **RED gates:**
  - Different `linear_issue_id` written to any phase (TS vs directive).
  - Different `linear_parent_issue_id` written to Overview.
  - Different `created` / `updated` / `skipped` counts.
  - The description string sent to Linear differs (the parent description body or any phase description body must be byte-equal).
  - Different number of API calls (extra create where TS only updated, or vice versa).

- **Acceptable divergences:**
  - Order of API calls (parallelism is OK as long as final state matches).
  - Log entry timestamps.
  - The exact wording of the openclaw `--message` (semantic match).

Seven consecutive GREEN runs across at least two distinct bundles → graduate to `status: active`, delete `src/linear/uplink.ts`.

## Forbidden patterns

- **Never write a phase's `linear_issue_id` until the create call returns success** — partial state on failure means the next uplink would skip the phase forever.
- **Never push tasks beyond the 30-line cap** — Linear enforces a description length limit; descriptions over 32KB get rejected and the phase silently fails to update. The 30-task cap keeps us well under.
- **Never auto-assign to anyone other than the viewer.** The skill resolves "me" via the `viewer` verb. Don't let directives hardcode arbitrary user IDs.
- **Never proceed if the parent issue creation fails.** All phase sub-issues need a parent ID; without it they'd be top-level issues, polluting the team's backlog.
