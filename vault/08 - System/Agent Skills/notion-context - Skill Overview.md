---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: notion-context
source_skill_path: ~/clawd/skills/notion-context/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# notion-context

> Fetch project-scoped context from Notion via the official REST API. Use to ground a phase or pipeline in Notion-resident documentation.

## When a directive should call this

- Pulling a Notion project page tree into context before scaffolding a phase
- Refreshing a project's `refs/<Project> - Notion Context.md` snapshot
- Resolving Notion page IDs/properties referenced by frontmatter

## How to call it

```bash
~/clawd/skills/notion-context/bin/notion-context --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/notion-context/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
