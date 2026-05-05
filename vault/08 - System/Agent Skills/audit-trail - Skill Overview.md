---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: audit-trail
version: 1.0.0
source_skill_path: ~/clawd/onyx/skills/audit-trail/SKILL.md
created: 2026-04-27
updated: 2026-04-27
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# audit-trail

> Append events to `<vault>/.onyx-audit/audit.jsonl`, list events, recover PID-orphaned locks. Replaces `src/audit/recover.ts` + `src/audit/trail.ts` (66 LOC).

## Verbs

```
audit-trail append --vault <path> --event <name> --phase <phase-path> [--project <id>] [--pid <int>] [--detail "<text>"]
audit-trail list   --vault <path> [--project <id>]
audit-trail recover --vault <path> --projects-glob "01 - Projects/**"
```

## Behaviour

- **append**: writes one JSON line. `ts` set to current UTC.
- **list**: prints every event line, optionally filtered.
- **recover**: scans `phase-active` phases, for each reads `lock_pid`, if `kill -0 <pid>` fails → swap tag to `phase-ready`, clear lock fields, audit the recovery.

## When to use

- Inside `execute-phase` — append on every state transition.
- Inside `heal` Step 1 — recover orphaned locks.
- Inside `explain` / `next` — list recent activity.

See full SKILL.md at `~/clawd/onyx/skills/audit-trail/SKILL.md`.
