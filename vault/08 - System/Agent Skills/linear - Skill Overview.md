---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: linear
source_skill_path: ~/clawd/skills/linear/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# linear

> Thin shell wrapper over the Linear GraphQL API. Read/create/update issues, resolve viewers/cycles/labels/project IDs.

## When a directive should call this

- Pulling Linear issues into a vault bundle (as phases or pipeline inputs)
- Pushing vault phase state back to Linear (`linear-uplink`-style flows)
- Resolving Linear identifiers (project, team, cycle, user) at scaffold time

## How to call it

```bash
~/clawd/skills/linear/bin/linear --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/linear/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
