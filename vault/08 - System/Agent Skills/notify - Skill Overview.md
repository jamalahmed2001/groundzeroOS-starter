---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: notify
version: 1.0.0
source_skill_path: ~/clawd/onyx/skills/notify/SKILL.md
created: 2026-04-27
updated: 2026-04-27
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# notify

> Single-call openclaw wrapper. Always echoes to stdout in Master Directive §15.4 format; dispatches via `openclaw` CLI if `OPENCLAW_NOTIFY_TARGET` is set. Replaces `src/notify/notify.ts` (99 LOC).

## Verbs

```
notify --event <name> --project <pid> --phase <pid|-> --severity <info|warn|alert> --message "<text>"
```

## When to use

- Inside any operation directive that needs to surface state to the operator (phase complete, blocked, integrity error, scheduled event fired).
- Inside the heal sweep when a non-trivial repair was applied.

## Behaviour

1. **Always** prints `[ONYX] <event> · <project> · <phase> · <message>` to stdout.
2. **If** `OPENCLAW_NOTIFY_TARGET` set, fires `openclaw` with a 10s timeout. Failure is swallowed.

## Forbidden patterns

- Don't block on the openclaw call.
- Don't fail the caller on notification failure (fire-and-forget).
- Don't call this for high-frequency events (aggregate at the phase boundary).

See full SKILL.md at `~/clawd/onyx/skills/notify/SKILL.md`.
