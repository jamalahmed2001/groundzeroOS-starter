---
title: refresh-context
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

# Operation: refresh-context

> Re-scan a project's repo and update the bundle's `Repo Context.md` note. The Stack and Key Areas sections are overwritten inside their managed blocks; everything else in the file (architecture notes, agent constraints, custom prose) is preserved.
>
> Used after a substantial repo change (new dependencies, refactor, structural reorg) so the agent's context stays accurate.

## Preconditions
- A bundle exists for the requested project under `projects_glob`.
- The bundle has (or can resolve) a `repo_path`.

## Invocation context
- Operator: `onyx refresh-context <project-name-or-substring>`.
- Agent-driven: invoked from a higher-level routine that detected stack changes (e.g. after a major dep bump phase).

## Read order
1. Bundle Overview at `<bundle_dir>/<project_id> - Overview.md`.
2. Existing `<bundle_dir>/<project_id> - Repo Context.md` (if any).
3. The repo at `repo_path`: file tree, package manifests, framework detection.

## Procedure

### Step 1 — Locate the bundle

Discover bundles under `projects_glob`. Match the operator's argument case-insensitively against `project_id`. If multiple match, take the first; if none, list available bundles and exit.

### Step 2 — Resolve `repo_path`

Same logic as [[08 - System/Operations/research.md#Step 2 — Resolve the repo path|research's Step 2]]:
1. Read Overview frontmatter `repo_path`.
2. If unset / non-existent, fuzzy-match under `repos_root`.
3. On fuzzy match, write the resolved path back to Overview frontmatter for determinism.
4. If still unresolved, **abort** — refresh-context can't proceed without a real repo.

### Step 3 — Scan the repo

Detect the **stack** by reading manifest files. The stack section is a short paragraph naming the language(s), framework(s), and key dependencies. Walk through these in order, stop at the first match:

| Manifest file | Stack hint |
|---|---|
| `package.json` | Node/TypeScript. Read `dependencies` + `devDependencies`. Name 3-5 most distinctive (e.g. `next`, `react`, `prisma`, `tsc`). |
| `pyproject.toml` or `requirements.txt` | Python. Detect Django, FastAPI, Flask, pandas, etc. |
| `go.mod` | Go. Read module path + 3-5 distinctive deps. |
| `Cargo.toml` | Rust. |
| `Gemfile` | Ruby/Rails. |
| `pom.xml` or `build.gradle` | Java/Kotlin/JVM. |
| (none of the above) | Mixed / scripts — describe what's there. |

Detect **key areas** by reading the file tree at the repo root. List 5-10 important top-level directories with a one-line gloss each:
- `src/` — application source
- `tests/` — test suite (X tests detected)
- `migrations/` — database migrations
- etc.

Format as a markdown bullet list.

### Step 4 — Read existing Repo Context (if present)

```
rc_path = <bundle_dir>/<project_id> - Repo Context.md
```

If the file doesn't exist → branch to **fresh write** (Step 5a). If it exists → branch to **managed-block update** (Step 5b).

### Step 5a — Fresh write

Write `rc_path` from scratch:

```markdown
---
project: "<project_id>"
type: repo-context
stack: "<one-line stack summary>"
created: <YYYY-MM-DD>
up: <project_id> - Overview
---
## 🔗 Navigation

**UP:** [[<project_id> - Overview|Overview]]
**Related:** [[<project_id> - Docs Hub|Docs Hub]]

# Repo Context — <project_id>

## Repo Path

See Overview frontmatter (`repo_path`).

## Stack

<!-- ONYX_MANAGED_START:stack -->
<stack paragraph from Step 3>
<!-- ONYX_MANAGED_END:stack -->

## Key Areas

<!-- ONYX_MANAGED_START:key-areas -->
<key-areas bullet list from Step 3>
<!-- ONYX_MANAGED_END:key-areas -->

## Architecture Notes

<placeholder — operator fills in over time>

## Agent Constraints

<placeholder — operator fills in: "don't touch X without Y", etc.>
```

### Step 5b — Managed-block update

Read `rc_path`. Update `stack:` in frontmatter to the new value. Then update the body's two managed blocks.

For each block (Stack, Key Areas), three cases:

1. **Block exists** — replace the content between `<!-- ONYX_MANAGED_START:<name> -->` and `<!-- ONYX_MANAGED_END:<name> -->` with the fresh content. Preserve the markers.
2. **Section exists but no managed block** (legacy file) — find the `## Stack` (or `## Key Areas`) heading. Replace the section body up to the next `##` heading with: heading + managed-block markers wrapping fresh content.
3. **Section doesn't exist** — append a new section at the end of the body with managed-block markers + fresh content.

The managed-block primitive: anything outside the `<!-- ONYX_MANAGED_START:X --> ... <!-- ONYX_MANAGED_END:X -->` boundary is sacred. Vault edits, custom architecture notes, agent constraints — all preserved.

### Step 6 — Print

Print: `Updated: <rc_path>` to stdout. Print the new stack one-liner.

## Post-conditions & transitions
- `<rc_path>` exists and reflects the current repo state inside its managed blocks.
- Overview frontmatter `repo_path` is canonical (written back if fuzzy-resolved).
- No phase status changes.
- All non-managed body content preserved verbatim.

## Error handling
- **BLOCKING:** repo path can't be resolved → exit with a clear error message naming what to set (Overview `repo_path` field, or `repos_root` env / config).
- **RECOVERABLE:** manifest file is malformed (broken JSON / TOML) → fall back to "Mixed / scripts" stack hint.
- **RECOVERABLE:** scan timeout (10s on the file walk) → write what was scanned so far with `(partial scan)` suffix.

## Skills invoked
None — agent-native operation. The repo scan is similar to what [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] does; if that skill is available, prefer invoking it instead of inlining the logic.

## Tools invoked
- `find` (file tree).
- Manifest readers (Read tool on `package.json`, `pyproject.toml`, etc.).

## Native primitives relied on
- **Glob** — bundle discovery.
- **Read** — Overview, existing Repo Context, manifest files.
- **Bash** — `find` for file tree.
- **Write** — fresh Repo Context.
- **Edit** — managed-block updates.

## Acceptance (self-check before exit)
- `<rc_path>` exists.
- Stack and Key Areas managed blocks contain fresh content.
- Frontmatter `stack:` updated.
- Any non-managed content (Architecture Notes, Agent Constraints, custom sections) is byte-equal to before.

## Forbidden patterns
- **Never** rewrite content outside a managed block. The block boundary is the only place this op writes.
- **Never** delete custom sections from the file. Only the two named managed blocks are managed.
- **Never** call an LLM to "improve" the stack description. The format is mechanical: read manifest → name dependencies.
- **Never** proceed without a resolved repo path. A bogus repo path leads to a bogus Repo Context.
