---
tags: [system, guide, overview, onyx]
created: 2026-04-13
updated: 2026-04-16
type: guide
---

## Navigation

**HUB:** [[Dashboard|Dashboard]] | **SETUP:** [[Getting Started|Getting Started]] | **RULES:** [[AGENTS|Agent Operating Rules]]

# What is ONYX?

> **The orchestration layer for Obsidian.** Turn your vault into an autonomous execution surface for AI agents.

---

## The one-sentence answer

ONYX is a CLI + vault convention that runs AI agents against your projects — phase by phase, under your direction — with the Obsidian vault as the single source of truth for state, decisions, and execution history.

---

## The mental model

Think of ONYX as a **factory floor controller**, not an AI.

You design the work. You decide what gets built and when. ONYX is the machinery that makes sure agents do exactly what you specified, log everything, stop cleanly when they need a human decision, and accumulate learnings for next time.

```
You     → write phase notes in Obsidian
ONYX    → reads vault, discovers work, dispatches agents, heals drift
Agent   → executes tasks, writes code/content, ticks checkboxes
Vault   → records everything, is the source of truth
```

---

## Why it exists

Knowledge work has three tools that don't talk to each other:

| Tool | Strength | Weakness |
|---|---|---|
| Project trackers (Jira, Linear, Notion) | Plan work | Don't execute it |
| AI agents (Claude, Cursor) | Execute work | Forget everything between sessions |
| Knowledge bases (Obsidian) | Store facts | Can't do anything |

ONYX is the thinnest layer that connects all three:
- **Plans** live in the vault as phase notes
- **Agents** read the phase notes, execute, write results back
- **Knowledge** compounds automatically after every completed phase

---

## What ONYX is

- A **local CLI** (`onyx`) that reads your vault and dispatches agents
- A **vault convention** — a set of file names and frontmatter fields
- A **controller loop** — heal → discover → route → act → consolidate → repeat
- A **profile system** — one execution model, multiple specializations

## What ONYX is NOT

- Not an AI agent (it dispatches agents)
- Not a SaaS (everything runs locally)
- Not a framework (no SDK, no import, no runtime dependency)
- Not a project manager (no boards, sprints, velocity — just phases and logs)

---

## The three ideas

**1. The vault is the only state.**
If a phase is active, the vault says so. If an agent produced output, the log note shows it. If a lesson was learned, Knowledge.md holds it. There is no external database, no SaaS, no sidecar state. The vault is what's real.

**2. The phase is sacred.**
Every project decomposes into phases: the smallest reviewable execution unit with explicit goals, tasks, acceptance criteria, and a linked log. Engineering, content, research, ops — same structure everywhere.

**3. Profiles specialize without fragmenting.**
One execution model. Different domains add extra frontmatter keys and verification strategies. Engineering adds `repo_path` and test commands. Content adds `voice_profile` and safety rules. The core phase lifecycle never changes.

---

## How it works (the loop)

Every `onyx run` invocation does this:

```
1. heal        — clear stale locks, normalize frontmatter drift, repair links
2. discover    — scan vault for phase notes, filter by dependencies
3. route       — for each phase, map state → operation (execute / atomise / wait)
4. act         — acquire lock, spawn agent, run task loop, verify acceptance
5. consolidate — extract learnings from completed phases into Knowledge.md
6. loop        — repeat until no actionable phases remain
```

The controller is a pure state machine. The agents do the work. The vault is the state.

---

## Core concepts in 30 seconds

- **Project bundle** = a folder in your vault with standard files (Overview, Knowledge, Kanban, Agent Log Hub, Phases/, Logs/, Docs/)
- **Phase** = one unit of work: goals, tasks, acceptance criteria, linked log
- **Log note** = append-only timestamped record of phase execution
- **Knowledge note** = learnings + decisions + gotchas that compound across phases
- **Profile** = a string on Overview that selects extra fields, templates, and verification for a domain

---

## Lifecycle (the phase FSM)

```
backlog → planning → ready → active → completed
                                ↘ blocked → planning
```

| State | Meaning |
|---|---|
| `backlog` | Phase exists but has no tasks yet |
| `planning` | Atomiser is generating a task plan (transient) |
| `ready` | Approved for execution; `onyx run` picks these up |
| `active` | Agent holds the lock and is executing |
| `completed` | All acceptance criteria passed; learnings consolidated |
| `blocked` | Agent hit a blocker; `## Human Requirements` written for review |

These six states are universal. No profile can add, remove, or change their meaning.

---

## Example use cases

### Software engineering
**Profile:** `engineering`
**Context doc:** Repo Context (stack, architecture, constraints)
**Verification:** Tests pass, types check, no lint errors
**Knowledge accumulates:** Architecture decisions, gotchas, patterns
**Example:** "Wire JWT authentication" — agent writes middleware, adds route guards, runs tests, marks acceptance criteria.

### Content production
**Profile:** `content`
**Context doc:** Source Context (voice profile, safety rules, distribution targets)
**Verification:** Safety filter passes, voice consistency checked
**Knowledge accumulates:** Audience insights, engagement learnings
**Example:** "Generate Episode 8 script" — agent fetches research, drafts script, runs safety review.

### Research & synthesis
**Profile:** `research`
**Context doc:** Research Brief (question, source constraints, methodology)
**Verification:** Source count, confidence gaps declared, output format matches
**Knowledge accumulates:** Methodology improvements, source quality patterns
**Example:** "Synthesize competitive landscape" — agent gathers sources under constraints, declares confidence gaps, produces memo.

### Operations & monitoring
**Profile:** `operations`
**Context doc:** Operations Context (monitored systems, runbooks, escalation rules)
**Verification:** Runbook followed, incident documented
**Knowledge accumulates:** Operational patterns, incident learnings
**Example:** "Investigate API latency spike" — agent pulls metrics, identifies root cause, follows runbook.

### Personal knowledge work
**Profile:** custom or `research`
**Example:** Long-term learning projects, book note synthesis, skill development tracking. Phases = units of study. Knowledge = connections and insights.

---

## The full picture

```
┌─────────────────────────────────────────────────────┐
│                   ONYX Core                          │
│  phase lifecycle · logging · knowledge · FSM         │
│  healing · discovery · consolidation                 │
└─────────────────────────────────────────────────────┘
               ▲               ▲              ▲
      ┌────────┴────┐  ┌───────┴────┐  ┌──────┴─────┐
      │ Engineering │  │  Content   │  │  Research  │
      │   Profile   │  │  Profile   │  │  Profile   │
      │ repo_path   │  │ voice      │  │ question   │
      │ tests       │  │ safety     │  │ sources    │
      │ rollback    │  │ pipeline   │  │ confidence │
      └────────┬────┘  └───────┬────┘  └──────┬─────┘
               ▼               ▼              ▼
       ┌──────────┐     ┌──────────┐   ┌──────────┐
       │ Bundles  │     │ Bundles  │   │ Bundles  │
       │(projects)│     │(projects)│   │(projects)│
       └──────────┘     └──────────┘   └──────────┘

ONYX Core = the nervous system
Profiles  = specialized regions
Bundles   = instantiated functional structures
```

---

## Next steps

- [[Getting Started|Getting Started]] — install ONYX and create your first project
- [[08 - System/ONYX - Quick Start.md|Quick Start]] — zero to running pipeline
- [[08 - System/ONYX - Reference.md|Complete Reference & Playbook]] — principles, internals, commands
