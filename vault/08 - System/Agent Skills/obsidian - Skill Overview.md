---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: obsidian
source_skill_path: ~/clawd/skills/obsidian/SKILL.md
updated: 2026-05-19T19:29:44Z
up: "[[Skills Hub]]"
---

## 🔗 Navigation

- [[Skills Hub]]

# obsidian

> Vault IO layer. Read, write, and search Obsidian markdown files via a consistent CLI.

## When a directive should call this

- Frontmatter-aware reads (extract specific fields without parsing markdown)
- Section-level appends (e.g. add a row under `## Journal` without rewriting the file)
- Wikilink-aware searches across a vault subtree

## How to call it

```bash
~/clawd/skills/obsidian/bin/obsidian --help
```

Full flag reference, env vars, output shape: `~/clawd/skills/obsidian/SKILL.md`. This Overview is the vault-facing contract; the skill's own SKILL.md is the source of truth for behaviour.

## Prerequisites

See `SKILL.md` for required env vars and external dependencies.
