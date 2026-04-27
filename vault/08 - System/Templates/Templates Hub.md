---
tags: [hub-subdomain, status-active, templates]
graph_domain: system
status: active
up: System Hub
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Templates Hub

> Copy-and-fill scaffolds for every artefact ONYX expects to find in your vault. Templates are intentionally minimal — only the frontmatter and section headings that the runtime, healer, or consolidator will actually look for.

> **How to use a template.** Read the header comment in each file, copy the file into the right vault location, rename it (replace `<placeholder>` tokens), and fill in the frontmatter and sections. The starter projects under `01 - Projects/` show worked examples of each template in context.

---

## Project-level

- [[08 - System/Templates/Project Overview Template.md|Project Overview]] — every project has exactly one. Sets profile, repo path, status.
- [[08 - System/Templates/Project Knowledge Template.md|Project Knowledge]] — accumulates per-project learnings; promoted to Cross-Project Knowledge by `consolidate`.
- [[08 - System/Templates/Project Kanban Template.md|Project Kanban]] — optional human-readable phase board.

## Phase / log

- [[08 - System/Agent Directives/Templates/Phase Note Template.md|Phase Note]] *(in Agent Directives folder for legacy reasons)* — every phase gets one. Tags drive the runtime status machine.
- [[08 - System/Agent Directives/Templates/Log Note Template.md|Log Note]] — agent appends one log per phase execution.

## Directive

- [[08 - System/Templates/Directive Template.md|Directive]] — role-specific contract for an agent. One directive per role, not per phase.

## Pipeline-specific (use only if you're running that pipeline shape)

- [[08 - System/Templates/Episode Template.md|Episode]] — for podcast / video / serial-content pipelines. One per episode.
- [[08 - System/Templates/Album Template.md|Album]] — for music-production pipelines. One per album.
- [[08 - System/Templates/Voice Profile Template.md|Voice Profile]] — character voice / narrator voice. Pinned voice ID, ElevenLabs settings, sample lines.
- [[08 - System/Templates/Show Bible Template.md|Show Bible]] — universe / characters / locations / tone for serial video projects.
- [[08 - System/Templates/Research Brief Template.md|Research Brief]] — output of a research phase, input to a script phase.
- [[08 - System/Templates/Pronunciation Dictionary Template.md|Pronunciation Dictionary]] — JSON dictionary applied before TTS synthesis.

---

## Filling in templates

Tokens in templates use angle brackets: `<project-name>`, `<repo-path>`, `<title>`. They are placeholders, not literal frontmatter values — replace them all before saving. The healer flags any frontmatter value that still contains `<…>` syntax as INTEGRITY error.

Frontmatter `created:` / `updated:` should be ISO 8601 UTC timestamps (`2026-04-27T12:00:00Z`). The agent fills these on first write.

Status values follow the standard machine:
- `backlog` → `planning` → `ready` → `active` → `completed`
- Sideways: `blocked` (any active state), `archived` (terminal cleanup)
