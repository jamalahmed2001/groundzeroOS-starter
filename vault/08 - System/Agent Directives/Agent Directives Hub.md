---
tags: [hub-subdomain, status-active]
graph_domain: system
status: active
updated: 2026-04-14
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Agent Directives Hub

> All operational directives governing ONYX agent behaviour. A directive is a vault markdown file prepended to the agent's context before it reads its phase — giving it a role, context-loading rules, behavioural constraints, and output format.
>
> **System-level directives live here** (cross-project, reusable). Project-specific directives live in `My Project/Directives/`.

---

## How directives work

Set `directive: name` in phase frontmatter. ONYX resolves it at runtime:
1. Looks for `My Project/Directives/name.md` (project-local, project-specific override)
2. Falls back to `08 - System/Agent Directives/name.md` (system-level, reusable)

The directive is injected **first** — before the profile, before the Overview, before the phase. The agent reads who it is before it reads what the project is.

**Experimenter auto-wiring:** For phases with `cycle_type:` set in an experimenter project, ONYX wires the directive automatically — no `directive:` field needed:
- `cycle_type: learn` / `design` → `experimenter-researcher`
- `cycle_type: experiment` → `experimenter-engineer`
- `cycle_type: analyze` → `experimenter-analyzer`

---

## System Identity

Core identity files injected by default in all sessions (not phase-specific):

- [[08 - System/Agent Directives/SOUL.md|SOUL]] — the agent's character (Claw persona): cognitive discipline, honesty, first principles
- [[08 - System/Agent Directives/USER.md|USER]] — who Jamal is, communication style, projects, context
- [[08 - System/Agent Directives/AGENTS.md|AGENTS]] — operating rules for every session: task management, memory, blockers protocol, safety
- [[08 - System/Agent Directives/TOOLS.md|TOOLS]] — available tools and correct usage patterns

---

## Architecture & System Directives

For agents working on ONYX itself or needing deep system understanding:

- [[08 - System/Agent Directives/ONYX Architecture Directive.md|ONYX Architecture Directive]] — full architecture reference: FSM, routing, execution engine, pipeline steps, vault I/O, profiles + directives system
- [[08 - System/Agent Directives/Agent Architecture Directive.md|Agent Architecture Directive]] — controller, kernel, FSM internals, executor, healer
- [[08 - System/Agent Directives/Agent Roles & Contracts Directive.md|Agent Roles & Contracts]] — role definitions with permission boundaries: observer, planner, executor, consolidator
- [[08 - System/Agent Directives/Vault Architect Directive.md|Vault Architect Directive]] — vault structure rules, domain isolation, hub decomposition, maintenance protocols

---

## Operational Directives

For agents executing or observing phases across any project type:

- [[08 - System/Agent Directives/Observer Directive.md|Observer Directive]] — read-only explainability role: produce the minimal complete snapshot, explain routing, never mutate state

---

## Experimenter Directives

Injected automatically by `cycle_type:` in experimenter profile projects. Can also be used manually on any project phase.

- [[08 - System/Agent Directives/experimenter-researcher.md|experimenter-researcher]] — LEARN + DESIGN phases: reads Cognition Store + Experiment Log, proposes what to test next, writes precise experiment specs with falsifiable hypotheses
- [[08 - System/Agent Directives/experimenter-engineer.md|experimenter-engineer]] — EXPERIMENT phases: executes the spec exactly, records raw results without interpretation, writes Trial entry to Experiment Log
- [[08 - System/Agent Directives/experimenter-analyzer.md|experimenter-analyzer]] — ANALYZE phases: interprets delta between expected and actual, extracts transferable lessons, updates Cognition Store, proposes next hypothesis

---

## Knowledge Directives

For maintaining structured knowledge across a project:

- [[08 - System/Agent Directives/knowledge-keeper.md|knowledge-keeper]] — maintains Knowledge.md as a structured wiki (not a log): extracts understanding from phase logs, detects contradictions, maintains cross-references and index. Use on a post-phase or set `directive: knowledge-keeper` on a dedicated consolidation phase.

---

## Writing a project directive

Project directives live in `My Project/Directives/`. They override system directives of the same name. Useful for: project-specific voice, domain rules, safety constraints, output formats.

Minimal template:

```markdown
---
title: My Directive
type: directive
project: My Project
version: 1.0
---

# My Directive

## Role

You are the [Project] [role]. Your job is [primary responsibility — one sentence].

## What you read first

Before starting any task, read (in this order):
1. [Source Context / Voice Guide / Strategy Context / Research Brief] — your domain context
2. Knowledge.md — what prior agents learned
3. The phase file — what to do this phase

## Behavioural rules

- [Specific, enforceable rule — no vague "be helpful"]
- [Safety rule — non-negotiable constraint]
- [Output rule — where deliverables go, what format]

## What you must not do

- [Hard constraint — things that must never happen]
```

---

## Directive quality checklist

A good directive:
- States the role in one sentence ("You are the ManiPlus Script Writer")
- Lists exactly what to read before starting (in order)
- Has at least one safety constraint that the agent must never work around
- Specifies the output format and location precisely
- Defines acceptance — what "done" looks like for this role
- Has a "What you must not do" section — boundaries matter as much as responsibilities
