---
title: linear-import
tags:
  - system
  - operation
  - onyx
  - linear
type: operation-directive
replaces: src/linear/import.ts + src/linear/merge.ts + src/cli/import-linear.ts
lines_replaced: 410
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

# Operation: linear-import

> Pull a Linear project into a fresh ONYX vault bundle. Each Linear issue becomes a phase. The bundle's Overview/Knowledge/Kanban/Phases/Logs are written from scratch on first import; on re-import, existing phases with matching `linear_issue_id` get a frontmatter + Overview-block merge (vault wins on Tasks / Acceptance / Blockers / Human Requirements; Linear wins on phase_name + frontmatter ids + the managed Overview block).
>
> The directive is the orchestration. The HTTP boundary lives in [[skills/linear|the linear skill]]. This directive replaces `src/linear/import.ts` (283 LOC) + `src/linear/merge.ts` (84 LOC) + the corresponding CLI command.

## Preconditions
- `LINEAR_API_KEY` set in env (or via `.env`).
- A Linear project ID known (the operator passes it, or the directive resolves it from Overview frontmatter `linear_project_id` if updating).
- `vault_root` and `projects_glob` from `onyx.config.json`.

## Invocation context
- Operator: `onyx linear-import <linear-project-id>` (CLI doorbell — until graduated, the TS path is canonical and this directive runs in shadow).
- Agent-driven: invoked from a higher-level routine that's bringing a backlog into the vault.

## Read order
1. This directive.
2. `skills/linear/SKILL.md` — verb reference for the linear skill.
3. `onyx.config.json` — `vault_root`, `projects_glob`, `linear.team_id`.
4. The bundle (if it already exists) — to detect existing phases for merge.

## Procedure

### Step 1 — Fetch the Linear project + issues

```
linear project        --id <linear-project-id>            → project.json
linear project-issues --id <linear-project-id>            → issues.json
```

Capture `project.name`, `project.description`, `issues[]`. Each issue has `id`, `identifier` (e.g. `ABC-123`), `title`, `description`, `state.name`, and optional `children.nodes[]` (sub-issues that become individual `## Tasks` lines under their parent phase).

### Step 2 — Resolve the bundle directory

`bundle_dir = <vault_root>/<projects_glob without /** suffix>/<project.name>`

Example: `vault_root=/home/op/vault`, `projects_glob="01 - Projects/**"`, `project.name="My Service"` → `/home/op/vault/01 - Projects/My Service`.

Create `bundle_dir`, `bundle_dir/Phases`, `bundle_dir/Logs` if they don't exist.

### Step 3 — Write Overview / Knowledge / Kanban (idempotent overwrite)

Three files, each rewritten on every import. All carry the bundle's identity in frontmatter.

#### `<project> - Overview.md`

```yaml
---
project_id: "<project.name>"
project: "<project.name>"
linear_project_id: "<linear-project-id>"
type: overview
status: planning
tags:
  - onyx-project
up: <project> - Hub      # if a project hub exists, else omit
---
```

Body sections:
- `## 🔗 Navigation` — links to Knowledge + Kanban + each phase
- `# <project.name>` heading
- `## Description` — `project.description`
- `## Scope (from Linear)` — for each issue, write a sub-heading `### P<N> — <title> (\`<identifier>\`)` followed by the issue description (capped to 500 chars) and a sub-task list if `children.nodes[]` is present
- `## Source` — note the Linear project ID for traceability

#### `<project> - Knowledge.md`

Frontmatter: `project`, `type: knowledge`, `up: <project> - Overview`.

Body: nav block, `# Knowledge — <project>`, `## Learnings` (placeholder), `## Phases` (one wikilink per phase), `## Decisions` (placeholder).

#### `<project> - Kanban.md`

Frontmatter: `project`, `type: kanban`, `up: <project> - Overview`.

Body: nav block, `# Kanban — <project>`, columns for **Backlog** (initially every phase), **Ready**, **Active**, **Blocked**, **Completed** (initially empty).

### Step 4 — For each Linear issue: create or merge a phase note

Numbering: `phase_number = N` where `N` is the 1-indexed position in the issue list returned by Linear (Linear's order, not alphabetical).

For each issue:

1. **Detect existing phase by `linear_issue_id`.** Glob `bundle_dir/Phases/*.md` and parse frontmatter. If any phase has `linear_issue_id == issue.identifier` OR `linear_identifier == issue.identifier`, that's a re-import.

2. **Create branch** (no existing phase):
   - File path: `bundle_dir/Phases/P<N> - <issue.title>.md`
   - Tasks: if `children.nodes[]` is present, one `- [ ]` per child title; else one `- [ ]` with the issue title itself.
   - Write the phase file with this template:

   ```yaml
   ---
   project_id: "<project.name>"
   project: "<project.name>"
   phase_number: <N>
   phase_name: "<issue.title>"
   linear_issue_id: "<issue.identifier>"
   linear_identifier: "<issue.identifier>"
   status: backlog
   locked_by: ""
   locked_at: ""
   tags:
     - onyx-phase
     - phase-backlog
   created: <YYYY-MM-DD>
   up: <project> - Phases Hub      # if hub exists, else <project> - Overview
   ---
   ## 🔗 Navigation

   **UP:** [[<project> - Phases Hub|Phases Hub]]

   # P<N> — <issue.title>

   ## Overview

   <!-- ONYX_MANAGED_START:linear-overview -->
   <issue.description, or "_No description provided._" if blank>
   <!-- ONYX_MANAGED_END:linear-overview -->

   ## Human Requirements

   - (none)

   ## Tasks

   <one "- [ ] <child title>" per child, or "- [ ] <issue.title>" if no children>

   ## Acceptance Criteria

   - [ ] Define acceptance criteria for this phase

   ## Blockers

   (none)

   ## Log

   - [[L<N> - P<N> - <issue.title>|L<N> — Execution Log]]
   ```

   - Also create `bundle_dir/Logs/L<N> - P<N> - <issue.title>.md` with frontmatter, a nav block linking back to the phase + project, and a single `### <ISO timestamp> — IMPORT` entry recording the import event.

3. **Merge branch** (existing phase found):

   The merge rule:

   | Field/section | Wins on merge | How |
   |---|---|---|
   | `phase_name` (frontmatter) | Linear | Overwrite |
   | `linear_issue_id` / `linear_identifier` (frontmatter) | Linear | Overwrite |
   | All other frontmatter keys | Vault | Preserved |
   | `## Overview` body inside `<!-- ONYX_MANAGED_START:linear-overview --> ... <!-- ONYX_MANAGED_END:linear-overview -->` block | Linear | Replace block content |
   | Any vault content outside the managed block | Vault | Preserved |
   | `## Tasks`, `## Acceptance Criteria`, `## Blockers`, `## Human Requirements`, `## Decisions`, anything else | Vault | Preserved unchanged |

   - If the existing phase has no `<!-- ONYX_MANAGED_START:linear-overview -->` block: find the `## Overview` heading, wrap the next-section body in a managed block, write `issue.description` (or `_No description provided._`) inside.
   - If no `## Overview` heading at all: append a new `## Overview` section with a managed block at the end of the body.

   Increment a counter for `updated` rather than `created`; do not write a new log file (the original log persists).

### Step 5 — Write the import log

Create or append to `bundle_dir/Logs/L0 - Import Log.md` with:

- Frontmatter: `type: log`, `project: "<project.name>"`, `up: <project> - Agent Log Hub` (or `Overview` if no hub).
- An `### <ISO timestamp> — IMPORT` entry under `## Log` recording: number of phases created, number updated, number skipped, the Linear project ID.

### Step 6 — Notify

Emit `linear_import_done` via the openclaw notification path (Master Directive §15):

```
openclaw \
  --event linear_import_done \
  --project "<project.name>" \
  --phase "-" \
  --severity info \
  --message "[INFO] <project>/-: <created> phases imported (<updated> updated)"
```

### Step 7 — Return

The directive's "return value" is the bundle path + a counts summary `{created, updated, skipped}` printed as JSON on stdout for the caller (or for an ExecLog entry if invoked from a Master Directive loop).

## Post-conditions & transitions

- A vault bundle exists at `bundle_dir` with:
  - Overview / Knowledge / Kanban
  - Phases/ with one phase note per Linear issue (or merged updates for existing phases)
  - Logs/ with one log per phase + an import log
- Each phase carries `linear_issue_id` linking back to Linear (for the uplink direction).
- `linear_import_done` notification fired.
- Vault is now authoritative — Linear is the seed, not the source of truth.

## Error handling

- **RECOVERABLE:** transient Linear API errors (429, 5xx) — the linear skill auto-retries with exponential backoff; if the skill exits 1, fail this directive cleanly and surface the error in the import log without writing partial state.
- **RECOVERABLE:** a single phase fails to write (filesystem error) — log it, continue with the rest, include in the `errors[]` summary.
- **BLOCKING:** `LINEAR_API_KEY` not set — abort before any HTTP call; surface as `## Human Requirements` if invoked from a phase context.
- **INTEGRITY:** Linear returns a project ID that doesn't match the URL or returns no project at all — halt; this is a configuration error, not transient.

## Skills invoked

- `skills/linear/bin/linear` — every Linear API call goes through this skill. Verbs used: `project`, `project-issues`.

## Tools invoked

- `tools/write-exec-log.sh` — at completion (one line per import).

## Native primitives relied on

- **Bash** — to invoke the linear skill and parse JSON via `jq`.
- **Read** — to detect existing phase notes for the merge branch.
- **Write** / **Edit** — to create / update phase notes, Overview, Knowledge, Kanban, logs.
- **Glob** — to enumerate `Phases/*.md` for the existing-phase scan.

## Acceptance (self-check before exit)

- The bundle directory exists and contains Overview, Knowledge, Kanban, Phases/, Logs/.
- For every Linear issue, exactly one phase note exists with `linear_issue_id` matching the issue's identifier.
- Each created phase has its log file created.
- The import log records the counts.
- `linear_import_done` notification fired.

## Shadow-mode comparison criteria

For each shadow run (`tools/shadow-run.sh linear-import "<bundle>/Phases/P1.md"`):

- **RED gates:**
  - Different number of phases created (TS vs directive).
  - Phase frontmatter differs on any of: `project_id`, `phase_number`, `phase_name`, `linear_issue_id`, `linear_identifier`, `status`, `tags`.
  - The Linear-managed Overview block content differs (must be byte-equal — Linear is source of truth for that block).
  - Any phase outside the managed block has differing content.
  - Kanban / Knowledge / Overview top-level frontmatter differs.

- **Acceptable divergences:**
  - `created:` timestamp (one ISO line; both should land on today's date but exact second differs).
  - Log file `### <ISO> — IMPORT` timestamps (semantic match — same event, same details, may differ by milliseconds).
  - Stable but cosmetic: trailing newlines, exact whitespace inside frontmatter values.

Seven consecutive GREEN runs across at least two distinct Linear projects → graduate to `status: active`, delete `src/linear/import.ts` + `src/linear/merge.ts`.

## Forbidden patterns

- **Never write a wikilink across the system ↔ bundle boundary.** This directive lives in `08 - System/`; the phase notes it creates live in a bundle. Frontmatter relationships only — no body wikilinks pointing into specific bundles.
- **Never bypass the `<!-- ONYX_MANAGED_START:linear-overview -->` boundary on merge.** Even if the existing phase's Overview body looks "wrong," only the content inside the managed block is rewritten. Vault edits outside the block are sacred.
- **Never write Linear issue IDs from the description text** — only from the frontmatter `linear_issue_id` / `linear_identifier`. Description text changes; identifiers don't.
- **Never proceed past Step 1 if `LINEAR_API_KEY` is missing.** Fail loudly before any vault writes.
