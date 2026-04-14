---
tags: [hub-domain, status-active]
graph_domain: system
status: active
---

# System Hub

> Navigation hub for ONYX system docs — profiles, directives, and reference.

---

## Key Docs

- [[ONYX - Quick Start|ONYX Quick Start]] — **start here**: step-by-step to your first running pipeline
- [[ONYX - Reference|ONYX Reference]] — complete reference: architecture, profiles, directives, commands, internals, laws

---

## Sub-Sections

- [[Profiles/Profiles Hub|Profiles]] — per-project mechanical contracts (engineering, content, research, operations, trading, experimenter)
- [[Agent Directives/Agent Directives Hub|Agent Directives]] — per-phase agent identity

---

## System Directives

These files are loaded automatically at session start. Customise them for your setup:

- `Agent Directives/AGENTS.md` — operating rules for every session

---

## Profiles

Six profiles, one per domain:

| Profile | Use for |
|---|---|
| `engineering` | Software projects with a git repo |
| `content` | Podcast, video, newsletter, social pipelines |
| `research` | Investigation, analysis, synthesis |
| `operations` | System ops, monitoring, incident response |
| `trading` | Algorithmic trading, strategy dev |
| `experimenter` | Systematic A/B testing, prompt engineering, ML experiments |

→ [[Profiles/Profiles Hub|Profiles Hub]] for full specs

---

## System Directives (cross-project, shared)

| Directive | Purpose |
|---|---|
| `knowledge-keeper` | Maintains Knowledge.md as a structured wiki |
| `experimenter-researcher` | LEARN/DESIGN phases: hypothesis + experiment spec |
| `experimenter-engineer` | EXPERIMENT phases: execute + record raw results |
| `experimenter-analyzer` | ANALYZE phases: interpret + update Cognition Store |
| `observer` | Read-only state snapshot |
| `ONYX Architecture Directive` | Deep technical reference for agents working on ONYX |

→ [[Agent Directives/Agent Directives Hub|Agent Directives Hub]] for full index
