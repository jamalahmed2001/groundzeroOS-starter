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

## Operating Rules

- [[08 - System/Agent Directives/AGENTS.md|AGENTS]] — operating rules for every session: phase FSM, lock protocol, write discipline, safety constraints

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

## General Purpose

For any project where no specialist role is needed, or as a default fallback:

- [[08 - System/Agent Directives/general.md|general]] — flexible catch-all agent; reads the phase carefully and does exactly what it asks. Used when `directive:` is not set, or on mixed-domain phases.

---

## Professional Role Directives

Specialist agents that simulate professional roles. Each has domain-specific rules, output formats, and safety constraints appropriate to the profession.

### Finance & Legal

- [[08 - System/Agent Directives/accountant.md|accountant]] — bookkeeping, reconciliation, financial reporting under GAAP/IFRS. Every entry sourced; balance check mandatory; human sign-off required. Use with `accounting` profile.
- [[08 - System/Agent Directives/legal-researcher.md|legal-researcher]] — legal research with primary source citations; evidence hierarchy; jurisdiction-specific. No legal advice. Use with `legal` profile.
- [[08 - System/Agent Directives/legal-drafter.md|legal-drafter]] — contract and policy drafting; precision clause writing; review + annotation mode. All drafts marked for professional review. Use with `legal` profile.
- [[08 - System/Agent Directives/investment-analyst.md|investment-analyst]] — company research, financial modelling, investment memos; thesis-driven; bear case mandatory; regulatory disclaimer required.
- [[08 - System/Agent Directives/compliance-officer.md|compliance-officer]] — regulatory obligation mapping, gap analysis, control frameworks (SOC 2, ISO 27001, GDPR); jurisdiction-specific; accepted risk requires human sign-off.

### Strategy & Product

- [[08 - System/Agent Directives/consultant.md|consultant]] — strategy frameworks (MECE, pyramid principle, hypothesis-driven); situation-complication-resolution structure; so-what test on every finding.
- [[08 - System/Agent Directives/product-manager.md|product-manager]] — PRDs, roadmaps, user stories, acceptance criteria, metrics frameworks; problem before solution; no UI design decisions.
- [[08 - System/Agent Directives/marketing-strategist.md|marketing-strategist]] — campaign strategy, messaging frameworks, copy; audience before message; business objective required for every deliverable.

### Data & Security

- [[08 - System/Agent Directives/data-analyst.md|data-analyst]] — EDA, metrics reporting, cohort analysis, statistical analysis; observation vs interpretation separated; sources and queries documented.
- [[08 - System/Agent Directives/security-analyst.md|security-analyst]] — threat modelling (STRIDE), OWASP Top 10 code review, vulnerability assessment; authorised contexts only; no weaponised exploit code.

### People & Learning

- [[08 - System/Agent Directives/hr-manager.md|hr-manager]] — job descriptions, interview scorecards, onboarding plans, HR policies; jurisdiction compliance mandatory; hiring decisions remain human.
- [[08 - System/Agent Directives/curriculum-designer.md|curriculum-designer]] — backward design, Bloom's taxonomy aligned objectives, lesson plans, assessments; outcomes before content; practice activities required.

### Research & Media

- [[08 - System/Agent Directives/clinical-researcher.md|clinical-researcher]] — biomedical literature synthesis; evidence hierarchy (RCT > cohort > expert opinion); Vancouver citations; no medical advice under any circumstances.
- [[08 - System/Agent Directives/journalist.md|journalist]] — story research, article writing, fact-checking; multiple-source corroboration; right-of-reply noted; no fabrication.

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
