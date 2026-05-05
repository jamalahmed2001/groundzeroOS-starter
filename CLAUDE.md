---
title: ONYX Runtime Bootstrap (onyx/ subpackage)
type: system-config
updated: 2026-05-05T00:00:00Z
---

# ONYX — onyx/ subpackage

> **There is no TypeScript CLI.** The `src/` directory in this folder is archived legacy code. Claude IS the runtime now.
>
> The active bootstrap is at `/home/jamal/clawd/CLAUDE.md`.

## What lives here

- `skills/` — executable skill CLIs invokable by Claude (installed to `~/clawd/skills/<name>/` at runtime)
- `dashboard/` — Next.js dashboard UI (read-only view, not the runtime)
- `vault/` — bundled starter vault for new installs; orchestration skill specs live under `08 - System/Agent Skills/_onyx-runtime/`
- `src/` — **ARCHIVED** TypeScript runtime (do not use)
- `dist/` — **ARCHIVED** compiled output (do not use)

## What to do instead of running `onyx`

| Old command | New approach |
|---|---|
| `onyx run` | Tell Claude: "Execute next" |
| `onyx status` | Tell Claude: "Status" |
| `onyx heal` | Tell Claude: "Heal vault" |
| `onyx doctor` | Tell Claude: "Doctor" |
| `onyx init "My App"` | Tell Claude: "New project: My App, engineering" |

Full operation specs: `08 - System/Operations/<name>.md` in the vault.

See `/home/jamal/clawd/CLAUDE.md` for the complete runtime bootstrap.
