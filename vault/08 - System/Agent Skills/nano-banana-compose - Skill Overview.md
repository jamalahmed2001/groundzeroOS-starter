---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: nano-banana-compose
source_skill_path: ~/clawd/skills/nano-banana-compose/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# nano-banana-compose

> Multi-reference image composition via fal-ai/nano-banana/edit. The default composition skill — pick this over chatgpt-compose when FAL credits are available.

## When a directive should call this

- Combine 2+ reference images into a single composed output (character + location, multi-character, brand bake)
- Sister tool: bible-to-prompt assembles a canonical prompt from a character/location bible MD before calling nano-compose
- Any phase that needs deterministic, API-driven image composition

## How to call it

```bash
~/clawd/skills/nano-banana-compose/bin/nano-banana-compose --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/nano-banana-compose/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
