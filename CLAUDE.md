---
title: ONYX Runtime Bootstrap (onyx/ subpackage)
type: system-config
updated: 2026-05-19T00:00:00Z
---

# ONYX — onyx/ subpackage

> **Workspace:** this repo lives at `openclaw/projects/onyx` next to other OpenClaw projects under `~/clawd`. It is the public-facing copy of the ONYX framework (github.com/jamalahmed2001/onyx).

> **There is no TypeScript CLI.** Earlier `src/` and `dist/` directories are gone. Claude IS the runtime.

## Runtime contract

The active contract is **ONYX v2**:

- **Read once per session:** `08 - System/ONYX v2 Runtime.md` in your vault — six verbs, four-read cold start, the phase hot loop, the pipeline loop, safety rules. Stand-alone, ≤ 150 lines.
- **On demand only:** `08 - System/PRINCIPLES.md` (cross-project wisdom) and `08 - System/Proposals/ONYX v2 - Simplified Spec.md` (design rationale, rare).

The six verbs: `new`, `execute`, `run`, `heal`, `compact`, `consolidate`. Everything else is mental procedure inside one of those.

## What lives in this repo

- `skills/` — external skills invokable as stages (`linear`, `suno`, `elevenlabs-tts`, `audio-master`, `browser-automate`, …)
- `dashboard/` — Next.js read-only dashboard view of the vault
- `vault/` — v2 starter vault: runtime contract, templates, roles, skill overviews, and an `example-app` smoke-test bundle
- `bin/onyx` — thin shell dispatcher that hands the verb to Claude
- `hooks/pre-commit` — blocks commits containing common secret patterns
- `tools/` — deterministic mechanical helpers (heal-scan, sanitise, shadow-*)

## Where verbs come from

`bin/onyx <verb> ...` is a thin shell that builds a prompt and spawns Claude. The verb's semantics are defined in `08 - System/ONYX v2 Runtime.md` — not in any directive file. There is no `08 - System/Operations/` folder anymore; v1 references to it are stale.

See `~/clawd/CLAUDE.md` (the workspace bootstrap) and the project's [README](./README.md) for the full v2 model.

## Migration note

V1 (Master Directive, 8 operations, `Operations/` + `Profiles/` + `Conventions/` folders) is fully retired. The repo no longer ships any v1 artifacts; the bundled `./vault/` is a clean v2 starter. If you find a v1 reference anywhere in this repo, it's a bug.
