---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: notify
source_skill_path: ~/clawd/skills/notify/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# notify

> Fire a single notification event. Always echoes to stdout in event format; optionally dispatches via the openclaw CLI when `OPENCLAW_NOTIFY_TARGET` is set.

## When a directive should call this

- Surface phase_completed / phase_blocked / integrity_error events to the operator
- Fire schedule_fired / heal_action events from cron-driven pipelines
- Any time an agent needs to write a structured event to the audit channel

## How to call it

```bash
~/clawd/skills/notify/bin/notify --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/notify/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
