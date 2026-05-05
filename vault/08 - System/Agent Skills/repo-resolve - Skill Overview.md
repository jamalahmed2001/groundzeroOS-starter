---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: repo-resolve
version: 1.0.0
source_skill_path: ~/clawd/onyx/skills/repo-resolve/SKILL.md
created: 2026-04-27
updated: 2026-04-27
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# repo-resolve

> Resolve a project's repo path. Tries `--explicit` first, then fuzzy-matches under `--repos-root`. Replaces `src/repos/resolveRepoPath.ts` (61 LOC).

## Verbs (one)

```
repo-resolve --project-id <id> [--explicit <path>] [--repos-root <path>]
```

## Output

`{ "repoPath": "/abs/path/or-empty", "source": "explicit|fuzzy|none" }`. Exit 0 on hit, 1 on miss.

## Resolution order

1. **explicit** — if `--explicit` exists as a directory, use it.
2. **fuzzy** — walk first-level subdirs of `--repos-root`. Score by exact basename match → substring match → length-difference tie-break.
3. **none** — exit 1, empty `repoPath`.

## When to use

Anywhere a directive needs a project's actual code path: `init`, `research`, `refresh-context`, `phase-review`.

See full SKILL.md at `~/clawd/onyx/skills/repo-resolve/SKILL.md`.
