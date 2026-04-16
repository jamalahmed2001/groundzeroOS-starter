---
tags: [onyx, system, reference, status-active]
graph_domain: system
created: 2026-04-14
updated: 2026-04-16
type: reference
---

## Navigation

**UP:** [[08 - System/System Hub.md|System Hub]] | **QUICK START:** [[08 - System/ONYX - Quick Start.md|Quick Start]] | **SETUP:** [[00 - Dashboard/Getting Started.md|Getting Started]]

# ONYX — Complete Reference & Playbook

> The orchestration layer for Obsidian. This document is the single source of truth for how ONYX works — from the founding principles to the exact commands and internals. Read it start to finish once, then use it as a reference.

---

## Table of Contents

1. [The Playbook — Why ONYX Works This Way](#the-playbook--why-onyx-works-this-way)
2. [What ONYX is and is not](#what-onyx-is-and-is-not)
3. [Architecture — four layers](#architecture--four-layers)
4. [Phase lifecycle (FSM)](#phase-lifecycle-fsm)
5. [Profiles — domain contracts](#profiles)
6. [Directives — agent identity](#directives)
7. [Context injection — how agents get their world](#context-injection)
8. [Knowledge compounding](#knowledge-compounding)
9. [Multi-agent pipelines](#multi-agent-pipelines)
10. [Technical internals](#technical-internals)
11. [Complete command reference](#complete-command-reference)
12. [Configuration](#configuration)
13. [First principles](#first-principles)
14. [Glossary](#glossary)

---

## The Playbook — Why ONYX Works This Way

This section is the most important in the document. Every design decision in ONYX exists for a specific reason. Understanding the WHY turns you from a user of ONYX into someone who can extend, debug, and improve it.

### The founding question

> *How do you run AI agents against real work — code, content, research, operations — in a way that is safe, auditable, recoverable, and gets smarter over time?*

The answer is not a better prompt. It is a system with the right invariants built into its structure.

### Why the vault is the only state

**The alternative is database rot.** Any time state lives outside files you can read with your eyes, three things happen: you can't see what's wrong without special tooling, recovery after a failure requires database surgery, and state can silently diverge from what the files show.

Vault-as-state-machine means:
- Open Obsidian → see exactly what's happening. Always. No special client.
- Git commit the vault → version control for every decision ever made.
- Server dies? The vault IS the database. Nothing to restore.
- Agent produced garbage? The log file shows exactly when and why.

**The cost:** more structured file formats and stricter naming conventions. This is the right trade. Simplicity of state is worth more than convenience of structure.

### Why phases, not tasks, stories, or tickets

Phases exist to **bound agent sessions**. An AI agent given an open-ended goal will either hallucinate completion or drift off-scope. A phase creates a bounded execution contract:

- **Goals** — what problem are we solving this phase? (not the whole project)
- **Tasks** — what atomic actions does the agent take? (concrete, single-step)
- **Acceptance criteria** — what does done look like, mechanically verifiable?
- **Log** — append-only record of what actually happened

A phase is the smallest reviewable execution unit. Small enough to run in one agent session. Large enough to produce a meaningful, auditable outcome.

**The wisdom:** tasks without acceptance criteria produce subjective completion ("I think I'm done"). Acceptance criteria without tasks produce no clear path ("it needs to work"). A phase holds both in tension, forcing the scoping work to happen before execution starts.

### Why profiles do not own the FSM

Profiles extend ONYX for a specific domain. They add required fields, domain-specific context documents, and verification gates. What they never do is touch the FSM.

This means `backlog → planning → ready → active → completed` is universal across every project type. Engineering, content, research, trading, experimenter — same six states, same transitions, same meaning.

**Why this matters:** if profiles could redefine the FSM, you would eventually have seven different state machines to reason about — each slightly different, each with its own edge cases. The phase lifecycle is the one thing that never changes. Everything else is a domain extension on top of it.

The controller loop is the same code for every profile. That is the source of its reliability.

### Why directives are text, not config

A directive is a markdown document the agent reads. It is **not** a config file ONYX parses, not a YAML block registering tool calls, not a runtime capability manifest. It is a document written in natural language.

If directives were config:
- You would need code changes to add a new directive capability
- Non-engineers couldn't write or tune them
- The surface area for bugs would scale with every new capability

Because directives are text:
- Writing a directive means writing a document in Obsidian
- Tuning a directive means editing a markdown file — no deployment, no restart
- The agent reasons about its instructions rather than executing registered commands
- You can iterate in minutes, not deploy cycles

**The wisdom:** the best constraint on an AI agent is a well-written instruction. If an agent is going off-scope, the fix is almost always a clearer directive — not a new config flag, not a code change.

### Why context injection order matters

When ONYX spawns an agent for a phase, it assembles context in this exact order:

```
1. Directive (who the agent is)
2. Profile (domain rules + acceptance gate)
3. Project Overview.md (goals, scope, constraints)
4. Project Knowledge.md (all prior learnings from past phases)
5. Profile-specific context doc (Repo Context / Source Context / etc.)
6. Phase file (what to do right now)
```

Each ordering decision is intentional:

**Identity before instructions.** The agent knows who it is before it knows what to do. An agent that reads its role last may decide its role based on the task, rather than deciding the task based on its role.

**Rules before goals.** Domain constraints (safety rules, output format, data access boundaries) are established before the agent reads project scope. An agent that reads safety rules after reading creative goals may find the safety rules feel like obstacles. Reading them first makes them foundational.

**History before current task.** Everything prior phases discovered is in context before the current task starts. What Phase 1 learned shapes how the agent approaches Phase 5 — automatically.

**Broad before specific.** Project scope before this-phase-only scope. The agent understands why the project exists before reading what to do this phase.

### Why knowledge is always read, not retrieved on demand

`Knowledge.md` is injected into every agent's context at the start of every phase. Not on demand. Not when the agent asks. Always.

**The alternative** is RAG or explicit memory retrieval: the agent asks for knowledge when it thinks it needs it. The problem: to know what to search for, the agent must already understand the problem. By the time it understands, it may have already made a wrong assumption.

**Always-injected knowledge** means the agent sees every prior learning before it starts reasoning. Patterns emerge automatically. Constraints learned in Phase 1 inform Phase 5 without the agent having to know they exist.

**The cost:** Knowledge.md can grow large. The solution is the `knowledge-keeper` directive, which periodically restructures the knowledge file from an append-log into a dense, cross-referenced wiki.

### Why the healer runs before every iteration

The healer runs before every `onyx run` loop iteration — not just when something looks wrong. It proactively:
- Clears stale locks (older than `stale_lock_threshold_ms`, default 5 minutes)
- Fixes frontmatter drift (`state:` field doesn't match `tags:` array)
- Marks orphaned phases complete (all tasks ticked, no active agent)
- Repairs vault graph links

**Why not wait for explicit `onyx heal`?** Because drift accumulates silently. A phase stuck as `phase-active` with no running agent looks healthy from the outside. By the time you notice, it may be blocking three dependent phases. Proactive healing means the controller always operates on clean state.

**The wisdom:** a system that does not self-repair accumulates technical debt in its state space. State debt is more expensive to resolve than code debt because it's harder to see.

### Why human blocking is a success mode, not an error

`phase-blocked` is a **designed pause**. It is not a failure state.

When an agent writes `## Human Requirements` and transitions to `phase-blocked`, it is communicating: *"I've reached the limit of what I can safely do without information I don't have."*

**The alternative:** force the agent to complete anyway. This produces confident-sounding but wrong outputs — code that doesn't actually work, research that fills gaps with fabrications, content that violates unstated constraints.

A blocked phase that asks the right question is more valuable than a completed phase that solved the wrong problem.

**The recovery is designed to be lightweight:** fix the issue → `onyx reset "Project"` → phase returns to ready. The reason for the block stays in the phase file as a permanent record.

### Why the two-files rule exists

Per phase, agents write to exactly two files:
1. The **phase note** — tick task checkboxes, set the state tag
2. The **log note** — append timestamped events

This is the rule that makes multi-agent coordination safe without any coordination service.

If agents could write anywhere, concurrent phases would produce write conflicts on shared files with no audit trail for who changed what when.

With the two-files rule:
- Each phase has its own log note
- No two concurrent phases share a writable file
- The filesystem serializes writes naturally
- No message broker, no lock server, no orchestration service

**The wisdom:** the filesystem is a message bus. Files are the only coordination primitive that is always present, always auditable, and has zero operational overhead. The two-files rule makes this primitive safe.

### Why convention beats configuration

ONYX discovers work by pattern-matching file names and frontmatter fields — not by reading a central registry of projects.

A file with `tags: [onyx-phase, phase-ready]` in its frontmatter is a ready phase. A folder named `Phases/` inside a bundle directory contains phase notes. A file named `Overview.md` is the project source of truth. No registration required.

**The alternative** is configuration files that list every project and every phase. These go stale. They diverge from reality. They require maintenance.

**Convention means:** create the right file with the right name in the right place, and the system finds it. The structure is the config.

---

## What ONYX is and is not

### What ONYX is

- A **local CLI** (`onyx`) that reads your vault and dispatches agents
- A **vault convention** — standard file names and frontmatter fields that form a shared grammar
- A **controller loop** — heal → discover → route → act → consolidate → repeat
- A **profile system** — one universal execution model with domain-specific mechanical extensions
- A **directive system** — per-phase agent identity, context loading rules, and behavioral constraints
- A **multi-agent pipeline** — vault-coordinated sequences of specialised agents, zero message brokers
- A **knowledge compounder** — extracts learnings after every phase, available to every subsequent phase

### What ONYX is NOT

- **Not an AI agent** — it dispatches agents; the agents do the work
- **Not a SaaS** — everything runs locally, no external dependencies
- **Not a framework** — no SDK to import, no runtime to embed, no dependency
- **Not a project manager** — no boards, sprints, or velocity metrics; just phases and logs
- **Not magic** — agents produce better outputs because the structure forces better inputs

---

## Architecture — four layers

```
┌────────────────────────────────────────────┐
│  Intelligence Layer (Claude / agents)      │  Reasoning, planning, decision-making
├────────────────────────────────────────────┤
│  Runtime Layer (TypeScript CLI)            │  FSM, routing, file I/O, agent spawning
├────────────────────────────────────────────┤
│  Convention Layer (vault structure)        │  File names, frontmatter, folder layout
├────────────────────────────────────────────┤
│  State Layer (Obsidian vault)              │  Persistent state, history, config
└────────────────────────────────────────────┘
```

TypeScript handles all deterministic operations. Claude handles judgment. Neither layer absorbs the other's responsibilities. The vault holds state so nothing is lost between sessions.

### The four architectural concepts

| Concept | Scope | What it controls | Example |
|---|---|---|---|
| **Core** | Universal | Phase lifecycle, FSM, logging, healing, knowledge compounding | Never changes |
| **Profile** | Project type | ONYX's mechanical behaviour: extra fields, templates, verification gate | `engineering`, `content`, `research` |
| **Directive** | Phase | Agent identity: role, context to load, behavioral rules, output format | `maniplus-script-writer`, `accountant` |
| **Bundle** | Project instance | The actual vault folder for one project | `ManiPlus/`, `KrakenBot/` |

### Bundle structure

Every ONYX project is a vault bundle — a folder with standard files:

```
My Project/
├── My Project - Overview.md        ← profile, goals, scope, required fields
├── My Project - Knowledge.md       ← all learnings from completed phases
├── My Project - Kanban.md          ← read-only phase state board
├── My Project - Agent Log Hub.md   ← navigation to all log notes
├── Phases/
│   ├── P1 - Bootstrap.md           ← phase notes
│   └── P2 - Build API.md
├── Logs/
│   ├── L1 - Bootstrap.md           ← append-only execution records
│   └── L2 - Build API.md
└── Directives/                     ← optional: project-local directives
    └── my-specialist.md
```

Engineering and trading bundles also include:
- `My Project - Repo Context.md` — stack, architecture, commands, constraints

Content bundles include:
- `Docs/My Project - Source Context.md` — voice, tone, safety, distribution

Research bundles include:
- `Docs/My Project - Research Brief.md` — question, source constraints, methodology

---

## Phase lifecycle (FSM)

```
backlog → planning → ready → active → completed
                               ↘ blocked → (human resolves) → ready
```

| State | Meaning | Who sets it |
|---|---|---|
| `backlog` | Phase exists, no tasks yet | Human / ONYX on `onyx init` |
| `planning` | Atomiser generating tasks (transient) | ONYX during `onyx plan` |
| `ready` | Approved for execution; `onyx run` will pick this up | Human or ONYX after atomising |
| `active` | Agent holds lock, executing right now | ONYX on lock acquisition |
| `completed` | All acceptance criteria passed, learnings consolidated | ONYX after agent completes |
| `blocked` | Agent halted; `## Human Requirements` written | Agent |

Six states. Universal. No profile or directive can add, remove, or redefine them.

### Phase frontmatter

```yaml
---
project_id: "My Project"
phase_number: 2
phase_name: "Build authentication middleware"
state: ready
tags: [onyx-phase, phase-ready]
directive: security-analyst          # optional — agent identity for this phase
priority: 7                          # 0–10, default 5; higher runs first
risk: medium                         # low | medium | high
depends_on: [1]                      # won't run until P1 is completed
cycle_type: experiment               # experimenter only: auto-wires directive
locked_by: ""                        # set by ONYX when agent starts
locked_at: ""                        # set by ONYX when agent starts
lock_pid: ""                         # OS process ID of the running agent
lock_ttl_ms: 300000                  # healer clears lock after this many ms
---
```

**Both must be set for ONYX to pick up a phase:** `state: ready` AND `tags` must include `phase-ready`.

### Scheduling priority

Phases sort by: `priority` (descending) → `risk` (high first) → `phase_number` (ascending).

Set `priority: 9` on a phase to jump the queue. Set `priority: 1` to defer it until everything else runs.

### Dependency resolution

A phase with `depends_on: [1, 2]` will not enter the `ready` queue until phases 1 and 2 are both `completed`. ONYX checks this at discovery time.

---

## Profiles

Profiles live in `08 - System/Profiles/` — one markdown file per domain. Set `profile:` in `Overview.md` frontmatter.

| Profile | Domain | Key required fields | Acceptance gate |
|---|---|---|---|
| `general` | Catch-all — start here if unsure | none | All tasks checked + output documented |
| `engineering` | Software with a git repo | `repo_path`, `test_command` | `test_command` exits 0 |
| `content` | Podcast, newsletter, video pipeline | `voice_profile`, `pipeline_stage` | Safety filter + voice check |
| `research` | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | Source count + confidence gaps addressed |
| `operations` | System ops, incidents, maintenance | `monitored_systems`, `runbook_path` | Runbook followed + outcome documented |
| `trading` | Algorithmic strategies, exchange bots | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | Backtest passes + risk compliance |
| `experimenter` | Systematic A/B testing, ML experimentation | `hypothesis`, `success_metric`, `baseline_value` | Result recorded + Cognition Store updated |
| `accounting` | Financial records, reconciliation | `ledger_path`, `reporting_period` | Trial balance verified |
| `legal` | Contracts, research, compliance | `jurisdiction`, `matter_type` | Evidence hierarchy followed + citations verified |

**What a profile controls:**
- Which fields `Overview.md` must have (`required_fields`)
- Which context document gets created at `onyx init` (Repo Context, Source Context, etc.)
- What the acceptance gate checks before marking a phase `completed`
- What verification commands to run (e.g., test suite, backtest)

**What a profile never controls:**
- The FSM states or transitions
- Which agent driver is used
- How locking works
- The structure of phase notes or log notes

### Experimenter profile extras

`cycle_type:` on a phase auto-wires the correct directive — no `directive:` field needed:
- `learn` or `design` → `experimenter-researcher`
- `experiment` → `experimenter-engineer`
- `analyze` → `experimenter-analyzer`

Results accumulate in the Cognition Store. Every negative result is as valuable as a positive one — the system learns what doesn't work.

→ Full specs: [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

---

## Directives

**A directive is a markdown file prepended to the agent's context before it reads its phase.** It defines the agent's identity for this phase: who it is, what to read first, how to reason, what it must never do.

### Two kinds of directives

**System directives** — `08 - System/Agent Directives/<name>.md`
Cross-project. Available to any project. Examples: `knowledge-keeper`, `security-analyst`, `accountant`.

**Project directives** — `My Project/Directives/<name>.md`
Project-specific. Override system directives of the same name. Use for project-specific voice, constraints, and context.

### Resolution order

ONYX resolves directives at runtime:
```
1. My Project/Directives/<name>.md   ← project-local (checked first)
2. 08 - System/Agent Directives/<name>.md  ← system-level fallback
```

### Wiring a directive to a phase

```yaml
directive: maniplus-script-writer   # in phase frontmatter
```

### The three levels of agent operation

```
Level 1 — General purpose
  Phase file alone. No directive.
  Agent reads tasks and executes with its own judgment.
  Good for: one-off coding tasks, quick research, familiar domains.

Level 2 — Specialised agent
  Phase file + directive.
  Agent has defined identity, context-loading rules, constraints.
  Good for: content, research, ops — any domain with specific voice/safety/format.

Level 3 — Multi-agent pipeline
  Multiple phases, each with its own directive, connected via depends_on.
  Good for: full production pipelines where each stage requires different expertise.
```

### System directives available to all projects

→ Full index: [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

**System roles:**
| Directive | Purpose |
|---|---|
| `knowledge-keeper` | Maintains Knowledge.md as a structured wiki — contradiction detection, cross-references, topic index |
| `experimenter-researcher` | LEARN + DESIGN phases: reads Cognition Store, proposes what to test, writes falsifiable experiment specs |
| `experimenter-engineer` | EXPERIMENT phases: executes spec exactly, records raw results without interpretation, writes Trial entry |
| `experimenter-analyzer` | ANALYZE phases: interprets delta, extracts lessons, updates Cognition Store, proposes next hypothesis |
| `observer` | Read-only state snapshot: active phase, blockers, what the controller would do next |

**Workflow directives** (encode non-trivial automatable processes with specific tool invocations and data protocols):

| Directive | Workflow | Data access |
|---|---|---|
| `accountant` | Journal entries, reconciliation, trial balance | ECB FX rates (free), Stripe API (key) |
| `investment-analyst` | Financial ratios, investment memo | CoinGecko + SEC EDGAR + Yahoo Finance (free), Alpha Vantage (key) |
| `legal-researcher` | Primary source retrieval, evidence hierarchy, jurisdiction-specific citations | legislation.gov.uk + CourtListener + EUR-Lex (free), Companies House (key) |
| `data-analyst` | EDA, SQL queries, cohort/funnel analysis | CSV/SQLite (bundle), PostHog + Amplitude (key) |
| `security-analyst` | npm audit, semgrep, secrets grep, OWASP checklist | No setup required; Snyk (key) |
| `clinical-researcher` | PubMed/ClinicalTrials.gov search, evidence hierarchy, Vancouver citations | PubMed + Europe PMC + Unpaywall (free), Semantic Scholar (key) |
| `journalist` | Multi-source corroboration, GDELT search, right-of-reply protocol | GDELT + Guardian + OpenCorporates (free), NewsAPI (key) |
| `marketing-strategist` | Audience signal retrieval, campaign structure, measurable objectives | Reddit/HN (free), PostHog + Mailchimp + Meta (key) |
| `general` | Catch-all — reads phase and executes with no workflow encoding | Adapts to whatever the phase specifies |

**Three-tier tooling model** — every data-dependent directive specifies:
- **Tier 1 (immediate):** free public APIs, exact `curl` commands, no setup needed
- **Tier 2 (key):** API key in project `.env` — directive tells agent the exact call
- **Tier 3 (build first):** a pnpm script that an engineering phase must implement before this directive can use it

→ Integration catalogue by domain: [[08 - System/ONYX Integrations.md|ONYX Integrations]]

### When to add a directive

| Symptom | Directive fix |
|---|---|
| Wrong voice or tone | Write a directive that defines voice and loads voice constraints first |
| Ignoring safety rules | Write a directive with non-negotiable constraints listed explicitly |
| Missing domain context | Write a directive that lists which files to read before starting |
| Wrong output format | Write a directive that specifies the exact output format |
| Producing general when you need specialist | Write a directive with the specific role and method |

**Don't add a directive to fix a bad phase spec.** Unclear tasks produce unclear results regardless of the directive. Fix the phase spec first, then add a directive if domain identity is still missing.

### Directive file structure

```markdown
---
name: maniplus-script-writer
type: directive
scope: project
project: ManiPlus
---

# Script Writer Directive

## Role

You are the ManiPlus Script Writer. Your job is to produce episode scripts
that match Mani's voice, build on previous episodes, and stay within
medical safety constraints.

## What you read first

Before starting any task, read:
1. ManiPlus - Knowledge.md — voice constraints, tone, safety rules, learned preferences
2. Docs/ManiPlus - Source Context.md — show identity and positioning
3. Last 3 episode scripts — for continuity and voice calibration

## Behavioral rules

- Always read the previous 3 episodes before writing
- Story-first structure: real story → insight → practical takeaway
- Keep sentences short. Mani's voice is conversational, not clinical.

## Output format

- 800–1,200 words for a full episode script
- Hook (first 30 seconds) written separately for shorts reuse
- Include [PAUSE] markers where natural breaks occur

## What you must not do

- No personalised medical advice
- All clinical claims must cite a source inline
- If uncertain about a medical fact: say so explicitly, don't guess
```

**Profile vs Directive (the distinction that matters):**
- Profile = mechanical contract with ONYX (how to handle this project type)
- Directive = identity contract with the agent (who to be this phase)

---

## Context injection

When ONYX spawns an agent for a phase, it assembles and injects context in this exact order:

```
1. Directive file    — who the agent is for this phase
2. Profile file      — domain rules, required fields, acceptance gate
3. Overview.md       — project goals, scope, constraints, required fields
4. Knowledge.md      — all prior learnings from completed phases
5. Context doc       — Repo Context / Source Context / Research Brief / etc.
6. Phase file        — what to do right now: tasks, acceptance criteria, state
```

The agent reads this concatenated context as a single prompt. It knows its identity, its domain rules, its project's history and learnings, and its current task — all before it starts reasoning.

**Agent spawn command:**
```bash
claude --dangerously-skip-permissions --print "<assembled context>" --add-dir /path/to/repo
```

The `--print` flag runs Claude Code in non-interactive print mode — it executes the context as a prompt and writes output to stdout. ONYX captures this output, ticks completed tasks, and updates the log note.

---

## Knowledge compounding

Knowledge.md is the project's memory. It accumulates across every completed phase.

### What gets written to Knowledge.md

After each phase completes, the consolidator extracts and appends:
- **Learnings** — what worked, what didn't, why
- **Decisions** — architectural or strategic choices with rationale
- **Gotchas** — traps, edge cases, non-obvious constraints

### How it compounds

Every agent reads Knowledge.md in full before starting its phase. This means:
- Phase 2 knows everything Phase 1 discovered
- Phase 5 knows everything Phases 1–4 discovered
- A new agent starting Phase 8 has the full institutional history of the project

Knowledge doesn't just accumulate — it actively shapes every subsequent phase's execution.

### Structured knowledge (knowledge-keeper)

The default behaviour appends learnings as a chronological log. For long projects, use `directive: knowledge-keeper` on a periodic maintenance phase to restructure Knowledge.md from a log into a dense, cross-referenced wiki with:
- Topic index and cross-references
- Contradiction detection and resolution
- Summarisation of redundant learnings

### Cross-project learning

[[08 - System/Skills/Skills Index.md|Skills Index]] captures learnings that apply across all projects. Update it when you discover something generally applicable — patterns, anti-patterns, architectural decisions that transcend any single project.

---

## Multi-agent pipelines

The vault is the coordination layer. No message broker. No orchestration service. No shared mutable state between agents.

**How it works:** Agent A completes its phase and writes output to the vault (in its log note and phase note). Agent B's phase has `depends_on: [A]` — ONYX won't start B until A's phase is `completed`. Agent B reads A's output from the vault.

```
Phase A (researcher)    → writes findings to log + Knowledge.md
Phase B (writer)        → reads Knowledge.md + A's log → produces script
Phase C (audio)         → reads script from vault → writes audio manifest
Phase D (distributor)   → reads audio manifest → publishes + writes links back
```

**The two-files rule makes this safe:** no agent can write to another agent's phase file or log file. Agents write only to their own phase note and log note. Corruption is structurally impossible.

### Rules for multi-agent coordination

1. **One directive per role, not per phase.** If two phases use the same persona, they share one directive file.
2. **The vault is the only message bus.** Agents don't call each other. Agent A writes to vault. Agent B reads from vault.
3. **Directives are instructions, not config.** No YAML tool registrations. A directive is a document the agent reads.
4. **Don't add a directive to fix a bad phase spec.** Check the tasks first.
5. **Build general, then specialise.** Run without a directive first. Add one only when the agent's judgment is wrong in domain-specific ways.
6. **Knowledge compounds across all agents.** Every directive should instruct the agent to write learnings back to Knowledge.md.

### Build lifecycle vs operations lifecycle

Every mature production system in ONYX has two separate projects:

**Build lifecycle** — engineering phases that construct the system:
```
P1 Bootstrap → P2 Build researcher → P3 Build writer → P4 Build audio → ...
profile: engineering | agent: claude-code | directives: the specialist personas being built
```

**Operations lifecycle** — a separate project that runs the system repeatedly:
```
R1 Research → R2 Script → R3 Audio → R4 Video → R5 Publish → R6 Engage → R7 Learn
profile: content | directives: the specialist personas built in the build lifecycle
```

Same vault. Same CLI. Same `onyx run`. Two projects. The build project creates the system; the ops project runs it. This separation keeps build concerns out of ops and vice versa.

---

## Technical internals

### The controller loop

Every `onyx run` executes this sequence:

```
1. Heal       — clear stale locks, fix frontmatter drift, repair graph links
2. Discover   — scan vault paths matching projects_glob for phase-ready notes
3. Sort       — by priority (desc) → risk (high first) → phase_number (asc)
4. For each ready phase:
   a. Check depends_on — skip if any dependency is not completed
   b. Acquire lock     — write locked_by, locked_at, lock_pid, lock_ttl_ms to frontmatter
   c. Flip state       — tag: phase-active, state: active
   d. Assemble context — directive + profile + overview + knowledge + context doc + phase
   e. Spawn agent      — claude --dangerously-skip-permissions --print "<context>"
   f. Monitor output   — tick completed tasks in phase note, append to log note
   g. Verify           — run profile acceptance gate (test_command, safety filter, etc.)
   h. Transition       — completed or blocked based on outcome
   i. Release lock     — clear locked_by, locked_at, lock_pid, lock_ttl_ms
5. Consolidate — extract learnings from newly completed phases into Knowledge.md
6. Repeat      — loop until no actionable phases remain (or --once exits)
```

`--once` mode: performs one iteration (one phase) then exits. Useful for cron, careful first runs.

### The healer

`runAllHeals()` runs at the start of every `onyx run`. All repairs are idempotent — safe to run repeatedly. After lock/drift repairs, `onyx heal` also runs graph maintenance and node consolidation.

| Repair type | Detection | Action |
|---|---|---|
| `stale_lock_cleared` | Lock age > `stale_lock_threshold_ms` (default 5 min) | Clear locked_by, locked_at, lock_pid, lock_ttl_ms |
| `frontmatter_drift` | `state:` field doesn't match `tags:` array | Normalize both to the canonical FSM state |
| `orphaned_phase` | Phase `active` AND all task checkboxes ticked | Transition → `completed` |

Graph maintenance (`maintainVaultGraph`):
- Repairs nav links between phases
- Removes stale cross-links
- Splits phase hub notes with more than 8 phases

Node consolidation (`consolidateVaultNodes`):
- Archives completed phases older than the retention threshold
- Merges duplicate docs

### Atomic locking

ONYX uses frontmatter-based atomic locks to prevent two agents from running the same phase simultaneously.

Lock acquisition writes four fields to phase frontmatter:
```yaml
locked_by: "claude-code"
locked_at: "2026-04-16T10:30:00Z"
lock_pid: "12345"
lock_ttl_ms: 300000
```

Lock release clears all four fields. The healer clears any lock older than `lock_ttl_ms` regardless of agent state — this handles crashes, kills, and hung processes automatically.

### Phase discovery

ONYX discovers phases by scanning vault paths matching `projects_glob` in `onyx.config.json`. Any `.md` file with `tags: [onyx-phase, phase-ready]` in its frontmatter is a candidate. ONYX extracts frontmatter for routing decisions without reading the full note body at discovery time.

### Vault graph

`onyx heal` maintains a directed graph of vault notes based on wikilinks. This powers:
- The web dashboard's 3D sphere visualization
- `onyx explain` — deriving what the active phase connects to
- Navigation link repair — ensuring `[[Next Phase|P2]]` links in phase notes stay valid

---

## Complete command reference

### Daily execution

```bash
onyx run                              # full autonomous loop across all ready phases
onyx run --project "My Project"       # scope to one project only
onyx run --once                       # single iteration then exit (safe for cron)
onyx run --phase 2                    # run a specific phase number only (implies --once)
onyx run --dry-run                    # preview what would happen without executing
```

### Observability

```bash
onyx status                           # all projects + phase states (human-readable)
onyx status --json                    # machine-readable snapshot
onyx explain                          # plain English: what every project is doing
onyx explain "My Project"             # one project, detailed view
onyx logs "My Project"                # execution log
onyx logs "My Project" --recent       # most recent log entries
onyx logs --audit                     # audit trail of all events
```

### Project creation + planning

```bash
onyx init "My Project"                # interactive: profile picker, vault section, repo path
onyx init "My Project" --profile content   # skip profile picker
onyx plan "My Project"                # decompose Overview → phase stubs → atomise to tasks
onyx plan "My Project" 2              # atomise one specific phase number
onyx plan "My Project" --extend       # add new phases to an existing project
onyx decompose "My Project"           # Overview → phase stubs only (no atomising)
onyx decompose "My Project" --extend  # add new phase stubs without deleting existing
onyx decompose "My Project" --force   # delete existing phases and re-decompose from scratch
onyx atomise "My Project"             # atomise all backlog phase stubs → tasks
onyx atomise "My Project" 1           # atomise a specific phase number only
```

`onyx plan` = `onyx decompose` + `onyx atomise` as a single command. Use the individual commands when you want step-by-step control.

### Phase state management

```bash
onyx ready "My Project"               # auto-pick next backlog phase → set ready
onyx ready "My Project" 3             # set phase 3 specifically to ready
onyx block "My Project" "reason"      # block active phase with a reason
onyx block "My Project" "reason" --phase 3   # target a specific phase
onyx reset "My Project"               # unblock → ready (after fixing the blocker)
onyx set-state <path/to/phase.md> ready      # force any state transition (for scripts)
```

### Vault objects

```bash
onyx new phase "My Project" "Phase name"    # create a new phase file
onyx new directive <name>                   # scaffold system directive stub
onyx new directive <name> --project "My Project"  # scaffold project-local directive
onyx new profile <name>                     # scaffold new profile
```

### Maintenance + recovery

```bash
onyx doctor                           # pre-flight: config, vault, API keys, claude CLI
onyx heal                             # fix stale locks, drift, graph, consolidation
onyx consolidate "My Project"         # manually trigger Knowledge consolidation
onyx refresh-context "My Project"     # re-scan repo, update Repo Context doc
onyx check "My Project"               # validate vault state (required fields, deps, directives)
```

### Capture + daily planning

```bash
onyx capture "note text"              # append to Inbox.md for later triage
onyx daily-plan                       # generate today's time-blocked daily plan
onyx daily-plan 2026-04-17            # generate plan for a specific date
```

### Integrations

```bash
onyx dashboard                        # web dashboard on localhost:7070
onyx import <linearProjectId>         # import Linear project as vault bundle
onyx linear-uplink "My Project"       # sync vault phases to Linear issues
```

### Operator flows

**A — Start a new project:**
```
1. onyx init "My Project"          # create bundle
2. Review Overview.md in Obsidian  # fill in goals, constraints
3. onyx plan "My Project"          # decompose + atomise
4. Review phases in Obsidian       # edit tasks if needed
5. onyx run "My Project" --once    # first run (safe, single phase)
```

**B — Execute what's ready today:**
```
1. onyx status                     # see what's ready
2. onyx explain                    # understand what each project needs
3. onyx run --once                 # one phase across highest-priority project
```

**C — Something looks stuck:**
```
1. onyx status                     # identify blocked or stale phases
2. onyx heal                       # clear stale locks, fix drift
3. onyx explain "My Project"       # read the block reason
4. Fix the root cause in Obsidian
5. onyx reset "My Project"         # return blocked phase to ready
```

**D — Scope changed mid-project:**
```
1. Update Overview.md in Obsidian  # reflect the new scope
2. onyx plan "My Project" --extend # propose new phases from updated overview
3. Review new phases in Obsidian   # edit if needed
4. onyx run                        # continue execution
```

---

## Configuration

**`.env`** (secrets — never commit)
```
ONYX_VAULT_ROOT=/absolute/path/to/vault
OPENROUTER_API_KEY=sk-or-...
```

**`onyx.config.json`**
```json
{
  "vault_root": "/absolute/path/to/vault",
  "agent_driver": "claude-code",
  "projects_glob": "{02 - Fanvue/**,03 - Ventures/**}",
  "model_tiers": {
    "planning": "anthropic/claude-opus-4-6",
    "light":    "anthropic/claude-haiku-4-5-20251001",
    "standard": "anthropic/claude-sonnet-4-6",
    "heavy":    "anthropic/claude-opus-4-6"
  },
  "max_iterations": 20,
  "stale_lock_threshold_ms": 300000
}
```

**Key config fields:**

| Field | Purpose | Default |
|---|---|---|
| `vault_root` | Absolute path to Obsidian vault | Required |
| `agent_driver` | `claude-code` or `cursor` | `claude-code` |
| `projects_glob` | Which vault sections ONYX scans for phases | Scan all |
| `model_tiers` | Which model for each complexity tier | Claude 4.x models |
| `max_iterations` | Max loop iterations before halting | 20 |
| `stale_lock_threshold_ms` | Lock age before healer clears it | 300000 (5 min) |

**Controlling agent behaviour from the vault:**

| What you want | How to do it |
|---|---|
| Run this phase before others | Add `priority: 9` to phase frontmatter |
| Give agent a specific role | Add `directive: my-directive` to phase frontmatter |
| Change which model runs | Add `complexity: heavy` (→ Opus) or `light` (→ Haiku) |
| Require human approval mid-phase | Agent sets `blocked` + writes `## Human Requirements` |
| Inject domain knowledge | Update Knowledge.md — agent reads it at start of every phase |
| Change acceptance rules | Edit the profile file for this project type |
| Test an idea systematically | Use `profile: experimenter` + `cycle_type:` on phases |

---

## First principles

These are the design rules that govern every decision in ONYX. When in doubt, apply these.

1. **Phase is sacred.** No profile or directive redefines what a phase is. Goals + tasks + acceptance criteria + log. Always.

2. **Vault is truth.** If it's not in the vault, it didn't happen. Logs, decisions, learnings, state — all in markdown.

3. **Profiles are thin.** A profile specifies required fields, context docs, and an acceptance gate. It does not own the FSM or the agent.

4. **Directives are instructions.** Text the agent reads, not config ONYX parses. The agent's judgment is shaped by language.

5. **Knowledge compounds.** Every phase teaches every subsequent phase. The system gets smarter automatically because Knowledge.md is always injected.

6. **Agents are disposable.** Swap agent drivers, change models — the vault doesn't care. State lives in the vault, not in the agent.

7. **Human in the loop by design.** Blocked phases are not failures. They are the system asking the right question at the right time.

8. **Observable by default.** Every state is readable in Obsidian without special tooling. If you can read it, you can trust it.

9. **Convention over configuration.** Right file name in right place → system finds it. No registries, no manifests of projects.

10. **Least mechanism.** Markdown file beats database table. Text beats API. Local beats SaaS. Add complexity only when the simpler thing genuinely fails.

11. **Domain agnostic.** Engineering is not special. Content, research, operations, trading — same loop, same structure, same invariants.

12. **Healing is proactive.** The system self-repairs before every run. Drift doesn't accumulate into state debt.

13. **Locking is frontmatter.** No lock server, no Redis, no database. Frontmatter fields are the lock. The healer is the lock monitor.

14. **Two-files rule.** Agents write to exactly the phase note and the log note. Nothing else. This is what makes multi-agent coordination safe.

15. **Acceptance before completion.** A phase is not done when all tasks are checked. It is done when the profile's acceptance gate passes. The gate is the only definition of done.

---

## Glossary

| Term | Definition |
|---|---|
| **Bundle** | The vault folder for one project: Overview, Knowledge, Phases/, Logs/, optional Directives/ |
| **Phase** | One bounded agent session of work. Has: goals, tasks, acceptance criteria, FSM state, log, optional directive. |
| **Phase note** | The markdown file for one phase. ONYX ticks checkboxes; agent writes within log markers. |
| **Log note** | Append-only execution record for one phase. Agent and ONYX append timestamped events. |
| **Profile** | Per-project-type mechanical contract: required fields, context doc type, acceptance gate, init docs. |
| **Directive** | Per-phase agent identity file: role, what to read first, behavioral rules, output format, constraints. |
| **Knowledge.md** | Append-compounding learnings extracted from completed phases. Injected into every agent context. |
| **Overview.md** | Project source of truth: profile, goals, scope, required fields, constraints. Human-maintained. |
| **Kanban.md** | Read-only phase state board generated by ONYX. Don't edit manually. |
| **Context injection** | The ordered sequence of files assembled into the agent's prompt: directive → profile → overview → knowledge → context doc → phase. |
| **two-files rule** | Per phase, agents write only to: (1) the phase note, (2) the log note. |
| **healer** | Runs before every loop iteration. Repairs stale locks, frontmatter drift, orphaned phases, graph links. |
| **consolidator** | Synthesises completed phase learnings into Knowledge.md. Runs automatically between phases. |
| **cycle_type** | Experimenter field: `learn \| design \| experiment \| analyze`. Auto-wires the correct experimenter directive. |
| **depends_on** | Array of phase numbers that must be `completed` before this phase enters the `ready` queue. |
| **projects_glob** | Glob pattern in `onyx.config.json` specifying which vault directories ONYX scans for phases. |
| **lock_ttl_ms** | How long a lock can exist before the healer clears it automatically (default: 300000ms = 5 minutes). |
| **acceptance gate** | Profile-defined check that must pass before a phase can transition to `completed`. |
| **meta-directive** | A directive that describes a pipeline orchestrator — knows the whole sequence and drives it end-to-end. |
| **Cognition Store** | Experimenter-profile document: accumulates trial results, patterns, hypotheses across all experiment cycles. |
