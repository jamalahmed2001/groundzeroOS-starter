---
tags: [onyx, system, guide, status-active]
graph_domain: system
created: 2026-04-14
updated: 2026-04-14
type: guide
---

## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# ONYX — Quick Start

> Everything you need to go from zero to a running, self-improving pipeline. Current as of 2026-04-14.

---

## The 60-second mental model

```
Vault                           ONYX
─────────────────────           ──────────────────────────────────────────
Overview.md        ←──────────  reads: who the project is, what it needs
Profile (system)   ←──────────  reads: domain rules, required fields, acceptance gate
Directive (phase)  ←──────────  reads: agent identity for this specific phase
Phases/P1.md       ←──────────  reads: what to do right now
Knowledge.md       ←──────────  reads: what was learned in prior phases
                               ↓
                               spawns Claude Code with full context
                               ↓
                               agent executes, ticks tasks, writes log
                               ↓
Logs/L1.md         ──────────→  writes: what happened
Phases/P1.md       ──────────→  writes: tasks ticked, state → completed
Knowledge.md       ──────────→  writes: learnings accumulated
```

**One-line loop:** find `phase-ready` → lock → run agent with full context → tick tasks → mark complete → repeat.

The vault is the state machine. ONYX reads it, runs agents, writes back. No database. No hidden state. If you can read it in Obsidian, that's the truth.

---

## Core concepts

### Profiles — the project's mechanical contract

Every project has a profile set in `Overview.md` frontmatter. The profile tells ONYX:
- What fields the Overview must have (required_fields)
- What "done" means for this domain (acceptance gate)
- What bundle documents to create at init
- What context to inject into the agent

Seven profiles:

| Profile | Domain | Key required fields | Acceptance gate |
|---|---|---|---|
| `general` | Catch-all — start here if unsure | none | all tasks checked + output documented |
| `engineering` | Software with a git repo | `repo_path`, `test_command` | test command exits 0 |
| `content` | Podcast, newsletter, video pipeline | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| `research` | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | source count + confidence |
| `operations` | System ops, incidents, maintenance | `monitored_systems`, `runbook_path` | runbook followed + outcome documented |
| `trading` | Algorithmic strategies, exchange bots | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest passes + risk compliance |
| `experimenter` | Systematic experimentation, A/B testing | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |

→ Full specs: [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

### Directives — the agent's identity

A directive is a markdown file prepended to the agent's context before it reads its phase. It tells the agent **who it is** for this phase — role, what to read, behavioral constraints, output format.

Two kinds:
- **System directives** — `08 - System/Agent Directives/name.md` — reusable across all projects
- **Project directives** — `My Project/Directives/name.md` — project-specific voice, rules, constraints

Set a directive on a phase by adding `directive: name` to the phase frontmatter. ONYX resolves it at runtime: project-local first, then system fallback.

For **experimenter** projects: set `cycle_type: learn|design|experiment|analyze` and ONYX auto-wires the correct directive (no need to set `directive:` manually).

**Workflow directives** are available system-wide — `accountant`, `investment-analyst`, `legal-researcher`, `data-analyst`, `security-analyst`, `clinical-researcher`, `journalist`, `marketing-strategist`, `general`, `knowledge-keeper`, `observer` + experimenter set. These encode non-trivial automatable processes: specific tool invocations, data protocols, structured output formats that a general agent wouldn't naturally produce. For each data-dependent directive, exact API calls are documented (Tier 1 free, Tier 2 keyed, Tier 3 build-first). No hallucinated data sources.

Add your own: `onyx new directive <name>` — scaffolds a stub with the right structure.

→ Directive index: [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]  
→ Integration catalogue: [[08 - System/ONYX Integrations.md|ONYX Integrations]]

### Context injection order

When ONYX spawns an agent for a phase, it injects context in this order:

```
1. Directive file (who the agent is)
2. Profile file (domain rules + acceptance gate)
3. Project Overview.md (goals, required fields)
4. Project Knowledge.md (all prior learnings)
5. Profile-specific context doc (Repo Context / Source Context / Research Brief / etc.)
6. Phase file (what to do right now)
```

The agent reads identity → rules → project → history → task. Every phase starts with full context.

### FSM states

Every phase moves through 6 states:

```
backlog → planning → ready → active → completed
                                  ↘ blocked
```

- `backlog` — ONYX atomises it (generates tasks) → moves to `planning` → `ready`
- `ready` — ONYX runs it (picks it up on next `onyx run`)
- `active` — currently executing (agent has the lock)
- `completed` — done, can't be re-run
- `blocked` — human input required (read `## Human Requirements` in the phase file)

To trigger a phase: set `state: ready` + tag `phase-ready` in frontmatter.
To unblock: fix the issue → `onyx reset "Project Name"`.

### Scheduling

ONYX picks the `phase-ready` phase with the highest **priority** (0–10, default 5). Tiebreaker: risk (high first), then phase_number (ascending).

To run a phase before others: add `priority: 9` to its frontmatter.
To deprioritize: `priority: 1`.

---

## Step 1 — Check your setup

```bash
onyx doctor
```

Shows: vault_root, agent driver, API keys, Claude CLI — fix anything red before continuing.

```bash
cat ~/clawd/onyx/onyx.config.json
```

Key fields:
- `vault_root` — your Obsidian vault path
- `projects_glob` — which sections ONYX scans (e.g. `{02 - Fanvue/**,03 - Ventures/**}`)
- `agent_driver` — `claude-code` (default) or `cursor`

---

## Step 2 — Create a project bundle

```bash
onyx init "My Project"
# Prompts:
#   Profile [1 = engineering]: 2        ← pick content, research, trading, etc.
#   Vault section: 1                    ← if you have multiple sections
#   Repo path: /path/to/repo            ← for engineering/trading only
```

Or skip the prompt with a flag:
```bash
onyx init "KrakenBot" --profile trading
onyx init "ManiPlus" --profile content
onyx init "Prompt Lab" --profile experimenter
```

This creates the full bundle structure for the profile — correct docs, P1 bootstrap phase, starter log. For experimenter: also creates Experiment Log + Cognition Store.

Then fill in the required fields in Overview.md (profile tells you exactly which ones).

---

## Step 3 — Write or review the phase file

Every phase has the same structure. ONYX reads `state:` and `tags:` to decide what to run.

```markdown
---
project_id: "ManiPlus"
phase_number: 2
phase_name: "Write script for episode 12"
state: ready
tags: [onyx-phase, phase-ready]
directive: script-writer          # optional: agent identity for this phase
priority: 7                       # optional: run this before lower-priority phases
cycle_type: experiment            # experimenter only: auto-wires directive
risk: low                         # low | medium | high
depends_on: [1]                   # won't run until P1 is completed
---

## Summary

Brief description of what this phase does and why.

## Acceptance Criteria

- [ ] Script is 1,200–1,500 words
- [ ] Passes all safety_rules from Overview
- [ ] Audio-ready format (no visual cues, no "as you can see")
- [ ] Knowledge.md updated with any voice refinements

## Tasks

- [ ] Read Source Context and last 3 episode scripts for voice calibration
- [ ] Research the topic: 3 primary sources, extract key insights
- [ ] Write full script: hook → story → insight → takeaway → CTA
- [ ] Self-review against safety rules — flag any violations
- [ ] Write to: Episodes/E12 - [Title].md
- [ ] Append voice notes to Knowledge.md

## Agent Log

(none yet)
```

**State trigger:** `state: ready` + `phase-ready` tag = ONYX picks it up on next run.

---

## Step 4 — Run it

```bash
# Check what ONYX can see
onyx status

# What is each project doing? (plain English)
onyx explain

# Run one phase of one project (safest to start)
onyx run --project "ManiPlus" --once

# Run all ready phases across all projects
onyx run

# Run a specific phase number
onyx run --project "ManiPlus" --phase 2
```

`--once` does one iteration: find one ready phase, run it, stop. Use this while you're getting comfortable.

---

## Step 5 — Monitor

```bash
# Plain English: what's happening, who's the agent, what's next
onyx explain "ManiPlus"

# All projects + phase states
onyx status

# Execution log for a specific project
onyx logs "ManiPlus"
onyx logs "ManiPlus" --recent    # last 5 entries

# Web dashboard (localhost:7070)
onyx dashboard
```

`onyx explain` is your primary window into what's happening. It shows:
- Active phase + which directive is running + acceptance criteria
- Queued phases + their priorities
- Blocked phases + how to unblock
- Knowledge.md summary and Cognition Store state (for experimenter projects)

---

## Step 6 — Review and advance

After a phase completes:

1. **Read the log** (`Logs/L1 - Name.md`) — what did the agent do?
2. **Check the output** — did it produce the deliverable specified in the phase?
3. **Check Knowledge.md** — did it capture useful learnings?
4. **Review the next phase** — does it look right? If it's still `backlog`, ONYX will atomise it automatically on next run.
5. **If blocked** — read `## Human Requirements` in the phase file → fix the issue → `onyx reset "Project"`

---

## Working with profiles

### Engineering project

```yaml
# Overview.md frontmatter
profile: engineering
repo_path: /home/jamal/clawd/krakenbot
test_command: pnpm test
stack: TypeScript, Fastify, Prisma
```

Phases run against the repo. Agent has read/write access. Every phase accepts when `test_command` exits 0. Use `complexity: heavy` on architecture phases to route to Opus.

### Content pipeline (podcast, newsletter, video)

```yaml
# Overview.md frontmatter
profile: content
voice_profile: "Directives/voice-guide.md"
pipeline_stage: research
safety_rules: no-medical-advice, cite-all-claims
```

Create project-specific directives in `Directives/`:
- `researcher.md` — sourcing rules, citation format, what counts as a good source
- `script-writer.md` — voice, tone, structure, safety rules, output format
- `distributor.md` — platform requirements, SEO rules, scheduling

Set `directive: researcher` on research phases, `directive: script-writer` on script phases.

### Experimenter project (prompt engineering, A/B testing, ML)

```yaml
# Overview.md frontmatter
profile: experimenter
hypothesis: "Chain-of-thought prompts improve task_accuracy by ≥10%"
success_metric: task_accuracy
baseline_value: 0.64
```

Phases follow LEARN → DESIGN → EXPERIMENT → ANALYZE cycle. Set `cycle_type:` on each phase — ONYX auto-wires the correct directive. Results accumulate in Cognition Store. Every negative result is as valuable as a positive one.

```markdown
# P3 — Run CoT experiment
cycle_type: experiment    # auto-wires experimenter-engineer
expected_result: 0.72
```

### Trading bot

```yaml
# Overview.md frontmatter
profile: trading
exchange: kraken
strategy_type: arbitrage
risk_limits: "max_position_usd: 500, max_drawdown_pct: 3"
backtest_command: pnpm backtest
live_enabled: false    # never touch this — set only after human review
```

Every strategy phase requires backtest to pass before completion. Agent never sets `live_enabled: true` — that's a human decision.

---

## Working with directives

### Writing a project directive

Create `My Project/Directives/my-directive.md`:

```markdown
---
title: My Directive
type: directive
project: My Project
---

# My Directive

## Role

You are the [Project Name] [role]. Your job is to [primary responsibility].

## What you read first

Before starting any task, read:
1. [Source Context / Voice Guide / Strategy Context] — your identity context
2. [Knowledge.md] — what prior agents learned
3. The phase file — what to do this phase

## Behavioral rules

- [Rule 1 — specific, enforceable]
- [Rule 2 — no vague "be helpful" rules]
- Safety: [non-negotiable constraints]

## Output format

[Exactly what the deliverable looks like, where it goes, what format]

## What you must not do

- [Hard constraint 1]
- [Hard constraint 2]
```

Then reference it on a phase: `directive: my-directive`

### Using system directives

System directives in `08 - System/Agent Directives/` are available to any project:
- `knowledge-keeper` — maintains Knowledge.md as a structured wiki, not a log
- `experimenter-researcher` — proposes what to test next, writes experiment specs
- `experimenter-engineer` — executes experiments, records raw results
- `experimenter-analyzer` — interprets results, updates Cognition Store

---

## Planning phases

```bash
# Overview → phase stubs (backlog state, no tasks yet)
onyx decompose "My Project"

# Phase stubs → concrete tasks (sets phase to ready)
onyx atomise "My Project" 1     # atomise phase 1
onyx atomise "My Project"       # atomise all backlog phases

# Both steps in one command
onyx plan "My Project"
```

Planning generates phase files grounded in the actual repo structure. The planner reads: Overview + profile + any existing phases + repo file tree.

---

## Useful commands reference

```bash
# Setup
onyx doctor                           # pre-flight checks
onyx init "Project" --profile content # create bundle

# Visibility
onyx explain                          # all projects, plain English
onyx explain "Project"                # one project, detailed
onyx status                           # all projects, phase states
onyx logs "Project"                   # execution log
onyx logs "Project" --recent          # last 5 entries

# Execution
onyx run                              # all ready phases
onyx run --project "Project"          # one project
onyx run --once                       # single iteration
onyx run --phase 2                    # specific phase

# Planning
onyx plan "Project"                   # decompose + atomise
onyx decompose "Project"              # Overview → phase stubs
onyx atomise "Project" 1              # one phase → tasks

# State management
onyx reset "Project"                  # unblock → ready
onyx heal                             # fix stale locks, drift
onyx set-state <path> ready           # force state change

# Vault
onyx consolidate "Project"            # manually trigger Knowledge consolidation
onyx refresh-context "Project"        # re-scan repo, update Repo Context

# Integrations
onyx dashboard                        # web dashboard on :7070
onyx import <linearProjectId>         # import Linear project
onyx linear-uplink "Project"          # sync phases to Linear
```

---

## Customising agent behavior

Everything about agent behavior is controlled from the vault — no code changes needed.

| What you want | How to do it |
|---|---|
| Run this phase before others | Add `priority: 9` to phase frontmatter |
| Give agent a specific role | Add `directive: my-directive` to phase frontmatter |
| Change which model runs | Add `complexity: heavy` (→ Opus) or `light` (→ Haiku) |
| Require human approval mid-phase | Agent sets `blocked` + writes `## Human Requirements` |
| Inject domain knowledge | Update Knowledge.md — agent reads it at start of every phase |
| Change acceptance rules | Edit the profile file for this project type |
| Test an idea systematically | Use `profile: experimenter` + `cycle_type:` phases |
| Understand what's happening | `onyx explain "Project"` |

---

## Common mistakes

**Phase not picked up by `onyx run`**
→ Check `state: ready` AND `tags: [onyx-phase, phase-ready]` are both set.
→ Check the folder is inside a path matching `projects_glob` in `onyx.config.json`.
→ Check `depends_on` — the phase won't run until all dependencies are `completed`.

**Phase blocked after first task**
→ Read `## Human Requirements` in the phase file — the agent explained why.
→ Fix the issue, then `onyx reset "Project"` to set it back to ready.

**Agent going off-scope**
→ Phase tasks are too vague. Rewrite them as concrete, testable single actions.
→ Add explicit constraints to the directive or the phase Summary.

**Knowledge not accumulating**
→ Add a task: `- [ ] Append learnings to Knowledge.md` at the end of every phase.
→ Or: enable `auto_knowledge: true` in Overview and set `directive: knowledge-keeper` on a phase.

**Experimenter not auto-wiring directives**
→ Ensure `profile: experimenter` is in Overview.md frontmatter (not just the profile file).
→ Ensure `cycle_type:` is set in the phase frontmatter (not phase_name).

**Wrong section created by `onyx init`**
→ If you have a multi-section vault, `onyx init` prompts you to pick a section.
→ Answer `2` (or whichever section you want) at the "Select vault section" prompt.

---

## How the system learns and improves

ONYX gets smarter in three layers:

**Per-project learning** — Knowledge.md accumulates across phases. Every agent reads all prior knowledge before starting. What P1 discovered, P5 builds on.

**Structured learning (knowledge-keeper)** — Use `directive: knowledge-keeper` on a post-phase to maintain Knowledge.md as a structured wiki: topics, cross-references, contradiction detection. Much more useful than a flat append-log.

**Systematic learning (experimenter)** — For projects where "we don't know what works yet", the experimenter profile runs LEARN → DESIGN → EXPERIMENT → ANALYZE cycles. The Cognition Store accumulates what's been tried, what worked, what failed — so every cycle starts smarter than the last.

**Cross-project learning** — [[08 - System/Cross-Project Knowledge.md|Cross-Project Knowledge]] captures findings that apply across all your projects. Update it when you discover something general.

---

## Reference

- [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]] — all 7 profiles with full specs
- [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]] — all system directives (15 professional roles + system roles)
- [[08 - System/ONYX Integrations.md|ONYX Integrations]] — integration catalogue: APIs, tiers, env vars
- [[08 - System/Agent Directives/ONYX Architecture Directive.md|ONYX Architecture Directive]] — full system internals
- [[08 - System/Agent Directives/Observer Directive.md|Observer Directive]] — how to read system state
