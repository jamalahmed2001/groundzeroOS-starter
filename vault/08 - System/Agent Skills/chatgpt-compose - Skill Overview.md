---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: chatgpt-compose
source_skill_path: ~/clawd/skills/chatgpt-compose/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# chatgpt-compose

> Drop-in alternative to FAL/nano-banana image composition. Drives the ChatGPT web UI under your Plus/Pro subscription. Same CLI shape as nano-compose, no API cost.

## When a directive should call this

- Multi-reference image composition (character + location, brand sigil + scene, ensemble)
- Single-image edits via the ChatGPT image-edit surface
- When FAL credits are exhausted or unavailable

⚠ Off-label browser automation. Subject to ChatGPT bot detection — treat as fragile and prefer `nano-banana-compose` when API credits are available.

## How to call it

```bash
~/clawd/skills/chatgpt-compose/bin/chatgpt-compose --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/chatgpt-compose/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
