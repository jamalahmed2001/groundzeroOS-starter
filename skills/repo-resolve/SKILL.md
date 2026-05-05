---
name: repo-resolve
description: Resolve a project's repo path. Tries explicit `repo_path` first, then fuzzy-matches under `repos_root` (lowercase substring with length tie-break, exact match preferred). Replaces src/repos/resolveRepoPath.ts (61 LOC).
metadata:
  clawdbot:
    emoji: "📁"
    requires: ["bash", "jq", "find"]
---

# repo-resolve

Single-purpose: given a project id (and optionally an explicit hint or a repos root), find the directory on disk where that project's code lives.

## When to use

- Inside `init`, `research`, `refresh-context`, `phase-review` operations — anywhere a directive needs to invoke `git diff` / `find` / repo-scan against a project's actual code.
- Whenever Overview frontmatter has `repo_path` set but you also want to validate it exists and fall back gracefully.

## Verbs (one)

```
repo-resolve --project-id <id> [--explicit <path>] [--repos-root <path>]
```

## Output

Single JSON line:

```json
{ "repoPath": "/abs/path/or-empty", "source": "explicit|fuzzy|none" }
```

Exit 0 if `repoPath` is non-empty, 1 if unresolved.

## Resolution order

1. **explicit** — if `--explicit <path>` is set and that path exists as a directory, use it. Highest precedence.
2. **fuzzy** — if `--repos-root <path>` is set, walk its first-level subdirectories. Score by:
   - Exact basename match (lowercased) → highest priority, return immediately.
   - Substring match (project_id is contained in basename, or vice versa) → score by length difference. Smallest score wins.
3. **none** — neither resolves. Return empty `repoPath`, exit 1.

## Why this is its own skill

`init`, `research`, `refresh-context`, and `phase-review` all need the same resolver logic. Centralising it means one source of truth for the matching algorithm — change the rule once, every directive picks it up.

## Forbidden patterns

- **Never** do recursive directory walks beyond depth 1 under `repos_root`. Project repos sit immediately under `repos_root`; nested repos are handled per-project via explicit `repo_path`.
- **Never** match across hidden directories (`.git`, `.cache`, etc.) — use `find -mindepth 1 -maxdepth 1 -type d`.
- **Don't** silently succeed with a wrong match. If multiple subdirectories match equally, pick the shortest-suffix one and return — but never aggregate or merge candidates.
