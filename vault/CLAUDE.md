---
title: ONYX v2 Vault Bootstrap
type: system-config
---

# Vault bootstrap

You are operating under **ONYX v2**. The runtime contract lives in this vault:

**Read once per session:** `08 - System/ONYX v2 Runtime.md` (≤ 150 lines, stand-alone).

**Read on demand only:**
- `08 - System/PRINCIPLES.md` — cross-project wisdom + gotchas
- `08 - System/Roles/<role>.md` — role brief when a phase declares `role:`
- `08 - System/Agent Skills/<name> - Skill Overview.md` — skill contract before invoking

## Default behaviour

1. On session start, run the §A cold-start protocol from the runtime contract:
   - Read the active project's `<Project> - Overview.md`, `<Project> - Status.md`, active phase, newest `logs/*.md`.
   - If `repo_path:` is set, run `git status --porcelain` and `git log -5 --oneline` inside the repo.
2. Do not load any other `08 - System/` files on session start. Read them on demand.
3. Every turn is a pause point — write `## Progress` and append to the session log after every meaningful action (Runtime §B).
4. The six verbs are `new`, `execute`, `run`, `heal`, `compact`, `consolidate`. Everything else is mental procedure inside one of those.

## Vault layout

```
vault/
├── 00 - Dashboard/         ← Central Dashboard (rebuilt by `heal`)
├── 01 - Projects/          ← project bundles live here
└── 08 - System/            ← runtime contract + templates + roles + skill overviews
```

Project bundles use the standard v2 shape: `<Project> - Overview.md` (anchor), `<Project> - Status.md` (derived), `<Project> - Knowledge.md` (append-only), `<Project> - Decisions.md` (ADRs), `phases/`, `pipelines/`, `logs/`, `artifacts/`, `refs/`, plus an optional `repo` symlink for engineering kinds.

See the project [README](../README.md) for the full mental model.
