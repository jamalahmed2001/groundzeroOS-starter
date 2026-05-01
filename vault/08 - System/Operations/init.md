---
title: init (project bootstrap)
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/init.ts
lines_replaced: 986
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

# Operation: init (bootstrap a new project bundle)

> Create a fresh project bundle: directory layout + Overview / Knowledge / Kanban / first phase, parameterised by the chosen profile and (for engineering / trading / experimenter) the resolved repo. The TS path embedded every template inline; the directive renders templates from `08 - System/Templates/` so the templates stay editable.

## Preconditions
- `vault_root` resolvable (from config, `.env`, or operator prompt).
- The vault has `08 - System/Profiles/` and `08 - System/Templates/` populated.

## Invocation context
- Operator: `onyx init "<project-name>" [--profile <name>]`.
- Bootstrap problem: `init` runs **before** any project bundle exists, but it does NOT run before the system layer exists. The vault's `08 - System/` (profiles, templates) must be in place — this is shipped with the framework, not generated.

## Read order
1. `08 - System/Profiles/<profile>.md` — `init_docs[]`, `required_fields[]`, `allowed_shell[]`.
2. `08 - System/Templates/Project Overview Template.md`
3. `08 - System/Templates/Project Knowledge Template.md`
4. `08 - System/Templates/Project Kanban Template.md`
5. `08 - System/Templates/Phase Template.md` (if present, else inline below).
6. The repo (only for engineering / trading / experimenter profiles).

## Procedure

### Step 1 — Resolve inputs

Required answers (prompt operator if not supplied as args):

| Input | Prompt | Default | Validation |
|---|---|---|---|
| `project_name` | `Project name:` | none | non-empty |
| `profile` | `Select a profile: 1-N` | `general` | must exist in `08 - System/Profiles/` |
| `vault_root` | `Vault root (absolute path):` | `config.vault_root` | must exist on disk |
| `repo_path` (engineering/trading/experimenter only) | `Repo path [<cwd>]:` | `process.cwd()` | must exist on disk |

For multi-glob `projects_glob` (e.g. `{02 - <workplace>/**, 03 - Ventures/**}`), prompt the operator to pick which top-level section. For single-glob, use the section automatically.

### Step 2 — Resolve target paths

```
projects_root = <vault_root>/<projects_base>     // e.g. "01 - Projects"
bundle_dir    = <projects_root>/<project_name>
phases_dir    = <bundle_dir>/Phases
logs_dir      = <bundle_dir>/Logs
directives_dir = <bundle_dir>/Directives  // for content/research/experimenter/general/accounting/legal/engineering
```

Bail if `bundle_dir` already exists (don't overwrite an existing project).

### Step 3 — Read the chosen profile

Parse `08 - System/Profiles/<profile>.md` frontmatter:
- `init_docs: [...]` — list of context-doc names to seed (e.g. `Repo Context`, `Source Context`, `Research Brief`, `Strategy Context`, `Show Bible`).
- `required_fields: [...]` — fields the Overview must carry.
- `allowed_shell` / `denied_shell` — for the bundle's documentation, not for init itself.

### Step 4 — Scan repo (if needed)

For engineering / trading / experimenter profiles, invoke [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] against `repo_path`. The skill returns:
- `stack` — one-line summary (e.g. "Node 20 + TypeScript 5 + Next.js 14 + Prisma + Vitest").
- `keyAreas` — markdown bullet list of important top-level directories.
- `architectureNotes` — short paragraph based on detected patterns.
- `constraints` — agent constraints hints.

If repo-scan isn't available or fails → set all four to `(scan unavailable)`.

### Step 5 — Create directory structure

```bash
mkdir -p "<phases_dir>" "<logs_dir>"
[[ "$needs_directives" ]] && mkdir -p "<bundle_dir>/Directives"
```

### Step 6 — Render Overview.md

Read `08 - System/Templates/Project Overview Template.md`. Substitute:
- `${project_name}` → operator's input.
- `${profile}` → chosen profile.
- `${today}` → `YYYY-MM-DD`.
- `${repo_path}` → resolved path or empty.
- `${stack}` → from Step 4 or empty.
- `${required_fields}` → block of `<field>: ""   # description` lines from profile's `required_fields`.

Write to `<bundle_dir>/<project_name> - Overview.md`.

For profiles that need richer Overview content (engineering: Stack + Key Areas + Architecture Notes + Constraints), append the corresponding sections from the repo-scan output.

### Step 7 — Render Knowledge.md

Template: `08 - System/Templates/Project Knowledge Template.md`.

Substitute `${project_name}` and `${today}`. Write to `<bundle_dir>/<project_name> - Knowledge.md`.

### Step 8 — Render Kanban.md

Template: `08 - System/Templates/Project Kanban Template.md`.

Substitute `${project_name}`. Write to `<bundle_dir>/<project_name> - Kanban.md`.

The Kanban starts with empty Backlog/Ready/Active/Blocked/Completed columns; phases appear as the operator atomises them.

### Step 9 — Render init_docs from the profile

For each item in profile's `init_docs[]`:
- Find a matching template at `08 - System/Templates/<doc> Template.md`.
- Substitute `${project_name}`, profile-specific fields.
- Write to `<bundle_dir>/<project_name> - <doc>.md`.

If a template doesn't exist for a declared init_doc, write a minimal stub:

```markdown
---
project: "<project_name>"
type: <doc-name-kebab>
created: <today>
up: <project_name> - Overview
---

## 🔗 Navigation

**UP:** [[<project_name> - Overview|Overview]]

# <doc-name> — <project_name>

_Fill in <doc-name>-specific content here._
```

### Step 10 — Create P1 Bootstrap phase

Path: `<phases_dir>/P1 - Bootstrap.md`.

Frontmatter:

```yaml
---
project_id: "<project_name>"
project: "<project_name>"
phase_number: 1
phase_name: "Bootstrap"
state: backlog
status: backlog
risk: low
priority: 8
depends_on: []
locked_by: ""
locked_at: ""
tags:
  - onyx-phase
  - phase-backlog
created: <today>
up: <project_name> - Overview
---
```

Body sections (every phase has these):

```markdown
## 🔗 Navigation

**UP:** [[<project_name> - Overview|Overview]]

# P1 — Bootstrap

## Summary

Bootstrap the <project_name> bundle. Confirm the Overview's required fields,
populate any init_doc that's still a stub, and atomise the next phase.

## Acceptance Criteria

- [ ] Overview has every `required_fields[]` entry filled.
- [ ] All `init_docs[]` are populated past the stub.
- [ ] First domain phase added via `onyx new phase "<project_name>" "<name>"`.

## Tasks

- [ ] _(generate tasks: onyx atomise "<project_name>" 1)_

## Agent Log

_(none yet)_
```

### Step 11 — (Optionally) seed first project hub

If `Phases/` will end up with > 2 phases shortly, the healer's heal-fractal-links creates a Phases Hub on the next run. Init doesn't need to do this preemptively — the heal pass owns it.

### Step 12 — Print summary

```
[onyx init] Created bundle: <bundle_dir>
  profile: <profile>
  files:
    <project_name> - Overview.md
    <project_name> - Knowledge.md
    <project_name> - Kanban.md
    [each init_doc]
    Phases/P1 - Bootstrap.md
    Logs/ (empty — created by execute-phase)
    Directives/ (empty — operator scaffolds with: onyx new directive ...)

  Next:
    onyx atomise "<project_name>" 1     # generate tasks for P1
    onyx ready "<project_name>" 1       # mark phase-ready
    onyx run                            # execute
```

## Post-conditions
- `bundle_dir` exists with the canonical structure.
- All required files written.
- No system-level files (`08 - System/`) modified.
- The vault has one new project, ready for atomise → ready → run.

## Skills invoked
- [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] — for engineering/trading/experimenter profiles.

## Tools invoked
- `mkdir -p` (Bash).

## Native primitives relied on
- **Bash** — `mkdir`, prompts (or read from args).
- **Read** — profile file, every template file.
- **Write** — every bundle file.
- **Glob** — multi-glob projects_base resolution (rare).

## Acceptance (self-check)
- `bundle_dir` exists.
- Each expected file exists at the expected path.
- Overview frontmatter has every `required_fields[]` key (values may be empty placeholders for the operator to fill).
- P1 Bootstrap exists with `state: backlog` and the three standard sections.
- No file outside `bundle_dir` was modified.

## Shadow-mode comparison criteria
**RED:** different file set written, different frontmatter keys on Overview / Bootstrap, different phase number on Bootstrap (must be 1), missing Phases or Logs directory.
**YELLOW:** template prose differs because the source templates evolved (acceptable as long as substitution markers all resolved).
**GREEN:** byte-equal file structure and frontmatter shape.

Five GREEN runs across distinct profiles (engineering / content / research / experimenter / general) → graduate, delete `src/cli/init.ts` (986 LOC — biggest single deletion in the migration).

## Forbidden patterns
- **Never** overwrite an existing bundle. Exit on collision.
- **Never** embed templates inline in this directive. Templates live in `08 - System/Templates/` and are editable independently.
- **Never** seed phases beyond P1 Bootstrap. Subsequent phases come from `decompose-project` or `new-phase`.
- **Never** modify `08 - System/` content. Init reads system; system writes to bundle.
- **Never** prompt for fields that already arrived as args. Args take precedence over prompts.
- **Never** scan a repo for non-engineering/trading/experimenter profiles. The scan is profile-gated to keep init fast for content / research / accounting / legal projects.
