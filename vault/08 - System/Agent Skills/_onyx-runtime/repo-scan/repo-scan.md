---
title: repo-scan
tags: [skill, onyx-runtime, planner]
type: skill
replaces: src/vault/repoScanner.ts + validatePlanFilePaths helper
lines_replaced: 180
version: 0.1
created: 2026-04-24
updated: 2026-04-27T11:59:53Z
status: draft
up: Agent Skills - _onyx-runtime Hub
---

# Skill: repo-scan

> Produce a concise, prioritised file-tree summary of a code repository — enough for an LLM to ground task-plan file references, not enough to blow the context budget.

## Purpose
The atomiser + planner need to know what files exist in the repo **without** reading every line. This skill produces a bounded tree: source-like directories at depth 1, source files up to 3 levels deep, capped at ~150 lines total. Root config files (`package.json`, `Cargo.toml`, etc.) are always surfaced.

## Inputs
- `repo_path: string` — absolute path to the git repo
- `max_lines: int` — default 150
- `max_depth: int` — default 3
- `profile_hint: string | null` — optional; if `engineering`/`trading`, use the standard source-dir list; if `research`/`content`, broaden to include `docs/`, `data/`, etc.

## Outputs
- `tree: string` — a newline-separated file-tree, bounded by `max_lines`.
- `status: "ok" | "path_missing" | "unreadable"`.
- `notes: string[]` — e.g. `["truncated: 43 files omitted past limit", "deep dir skipped: ..."]`.

## Algorithm

### Step 1 — Validate path
If `!fs.existsSync(repo_path)` → return `{ tree: '(repo path not available)', status: 'path_missing', notes: [] }`.

### Step 2 — Root-config first pass
Always surface these at the top of the tree if present at the repo root:
```
package.json, tsconfig.json, Cargo.toml, go.mod, pyproject.toml,
Makefile, Dockerfile, docker-compose.yml, docker-compose.yaml,
.env.example, prisma, next.config.js, next.config.ts, vite.config.ts,
webpack.config.js, jest.config.ts, jest.config.js
```
Mark these as "shown" so they're not duplicated in Step 3.

### Step 3 — Depth-first walk with filtering

Exclude set (never descend):
```
node_modules, .git, dist, build, .next, coverage, .cache,
__pycache__, .tox, venv, .venv, vendor, tmp, temp, .turbo,
.onyx-backups
```
Plus: any entry starting with `.` or `._`.

At **depth 1**, prioritise these source-like directories:
```
src, app, lib, packages, services, api, components, pages, routes,
models, controllers, server, client, backend, frontend, core, shared,
utils, hooks, store, test, tests, spec, __tests__, scripts, config, prisma
```
Other top-level directories are skipped at depth 1 unless they contain source files at depth 2+.

Source file pattern:
```
\.(ts|tsx|js|jsx|py|go|rs|java|rb|cs|json|yaml|yml|toml|md|prisma|sql|graphql|proto)$
```

### Step 4 — Per-depth file caps
- Depth 1: 15 files max per directory
- Depth 2: 15 files max per directory
- Depth 3: 25 files max per directory

Alphabetical order within each directory.

### Step 5 — Size annotation
For files > 100 lines, append `(<N> lines)` to the tree entry. Helps the LLM prioritise which files to read:
```
src/cli/onyx.ts (234 lines)
src/cli/doctor.ts (271 lines)
```

### Step 6 — Cap at max_lines
If accumulated lines exceed `max_lines`, truncate and append `(...<N> more entries)` note.

### Step 7 — Return
```
<tree with 2-space indentation>

notes: [ optional truncation info ]
```

## Output format example

For `repo_path = <home>/clawd/openclaw/projects/amazonpipe`:

```
package.json
tsconfig.json
Dockerfile
prisma/schema.prisma (124 lines)
src/
  cli/
    onyx.ts (234 lines)
    run.ts (189 lines)
  routes/
    moderation.ts
    queue.ts
  db/
    types.ts
  admin/
    dashboard.tsx
    moderation-queue.tsx (312 lines)
scripts/
  seed-dev.ts
tests/
  moderation-queue.test.ts
```

## Also provided: validatePlanFilePaths

Separate helper, same skill:

### Inputs
- `plan_block: string` — the `<!-- AGENT_WRITABLE_START:phase-plan -->` … `<!-- AGENT_WRITABLE_END:phase-plan -->` content
- `repo_path: string`

### Outputs
- `missing_files: string[]` — file paths referenced in `**Files:**` lines that don't exist in `repo_path`

### Procedure
1. Extract every `**Files:**` line from `plan_block`.
2. Parse each into individual paths. Handle:
   - Comma-separated: `` `src/a.ts`, `src/b.ts` ``
   - Backtick-wrapped paths (the standard format).
   - Ignore entries marked `(new)` — those are files to be created.
3. For each path: Glob or Read-check against `repo_path`. If it doesn't resolve to an existing file, add to `missing_files`.
4. Return.

Used by atomise.md Step 6 to surface hallucinated file paths.

## Invariants

- Never follow symlinks past the repo root.
- Never read file contents beyond the first `max(100, lines_to_check)` lines for size annotation.
- Always exclude hidden files/dirs starting with `.` or `._`.
- Tree output is deterministic for the same input (alphabetical within each directory).

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `path_missing` | `repo_path` doesn't exist | Return placeholder tree; caller decides how to proceed. |
| `read_error` | `fs.readdirSync` fails (permissions) | Skip that subdirectory; append to `notes: ['unreadable: <path>']`. |
| `size_check_failed` | File stat or read for line-count errors | Omit size annotation for that file; don't fail the scan. |

## Examples

**Example 1 — small repo:**

Input: `repo_path = /tmp/small-repo` with 8 source files + package.json.

Output tree:
```
package.json
src/
  main.ts (45 lines)
  utils.ts
  client.ts
tests/
  main.test.ts
```

`notes: []`

**Example 2 — large monorepo, capped:**

Input: `repo_path = <home>/clawd/openclaw` (assume ≥ 1000 source files).

Output: 150-line tree prioritising top-level `packages/`, `services/`, etc.

`notes: ['truncated: 47 files omitted past limit', 'deep dir skipped: node_modules/']`

**Example 3 — missing repo:**

Input: `repo_path = /nonexistent`.

Output: `tree: '(repo path not available)'`, `status: 'path_missing'`.
