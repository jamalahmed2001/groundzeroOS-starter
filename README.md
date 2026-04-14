# ONYX

> **The orchestration layer for Obsidian.** Turn your vault into an autonomous execution surface for AI agents — code, content, research, trading, or anything in between.

---

## What is ONYX?

ONYX is a local CLI + vault convention. Phase notes in your Obsidian vault hold state. A controller loop reads state, dispatches AI agents, writes results back, and compounds learnings. No SaaS. No database. No framework. Just markdown, frontmatter, and a deterministic state machine.

```
read vault → heal → discover → route → dispatch agent → write vault → consolidate → repeat
```

---

## Why it exists

Knowledge work has no operating layer. You have:
- **Project tools** (Jira, Linear, Notion) — track work but don't execute it
- **AI agents** (Claude, Cursor) — execute work but forget everything between sessions
- **Knowledge bases** (Obsidian) — store facts but don't do anything

ONYX is the thinnest possible layer that connects all three. Plans live in the vault. Agents read plans, do the work, write results back. Knowledge compounds automatically.

---

## The four ideas

1. **The vault is the only state.** No external databases. Vault frontmatter = truth. If it's not in the vault, it didn't happen.
2. **The phase is sacred.** Every project decomposes into phases — smallest reviewable unit with goals, tasks, acceptance criteria, and a linked log. Same structure everywhere.
3. **Profiles specialise the scaffold.** Domain extensions that tell ONYX how to handle a project type mechanically: extra required fields, templates, acceptance gate.
4. **Directives specialise the agent.** Per-phase instructions that tell the agent who it is, what to load, what constraints to operate under.

---

## What you get

| Capability | Mechanism |
|---|---|
| **Autonomous phase execution** | `onyx run` loops over all `phase-ready` phases, spawns agents, verifies acceptance |
| **Multi-agent pipelines** | Phases chain via `depends_on`. Vault is the coordination layer — no message brokers |
| **Domain specialisation** | 6 profiles (engineering, content, research, operations, trading, experimenter) |
| **Agent identity** | Directives give each phase a role, context rules, and safety constraints |
| **Compounding knowledge** | Consolidator extracts learnings after every phase into `Knowledge.md` |
| **Self-healing vault** | `onyx heal` fixes stale locks, frontmatter drift, orphaned phases |
| **Observable by default** | Everything visible in Obsidian — no special tooling required |
| **Agent-agnostic** | Swap Claude Code for Cursor for a custom binary. Vault doesn't care. |

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install                       # builds automatically via postinstall
cp .env.example .env              # set ONYX_VAULT_ROOT + OPENROUTER_API_KEY
onyx doctor                       # verify every dependency
onyx init "My First Project"      # create a bundle (prompts for profile)
onyx run                          # execute phase-ready phases
```

Full setup: [`CLAUDE.md`](./CLAUDE.md)

---

## Six profiles

One profile per project — set `profile:` in the project's `Overview.md`. Each profile defines required fields, the bundle structure, and the acceptance gate.

| Profile | Use for | Key required fields | Acceptance gate |
|---|---|---|---|
| `engineering` | Software projects with a git repo | `repo_path`, `test_command` | test command exits 0 |
| `content` | Podcast, video, newsletter, social pipelines | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| `research` | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | source count + confidence |
| `operations` | System ops, monitoring, incident response | `monitored_systems`, `runbook_path` | runbook followed + outcome documented |
| `trading` | Algorithmic trading, strategy development | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest passes + risk compliance |
| `experimenter` | A/B testing, prompt engineering, ML experiments | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |

```bash
onyx init "KrakenBot" --profile trading
onyx init "ManiPlus"  --profile content
onyx init "Prompt Lab" --profile experimenter
```

---

## Directives

A directive is a markdown file prepended to the agent's context before it reads its phase. It tells the agent **who it is** — role, what to read, behavioural constraints, output format.

```yaml
# In phase frontmatter
directive: maniplus-script-writer
```

**Resolution:** `My Project/Directives/<name>.md` → `08 - System/Agent Directives/<name>.md`

**Context injection order:**
```
1. Directive (who the agent is)
2. Profile (domain rules + acceptance gate)
3. Overview (project goals)
4. Knowledge (all prior learnings)
5. Context doc (Repo Context / Source Context / etc.)
6. Phase file (what to do right now)
```

**Experimenter auto-wiring** — set `cycle_type:` on a phase, no `directive:` needed:
```yaml
cycle_type: experiment   # → auto-wires experimenter-engineer
cycle_type: analyze      # → auto-wires experimenter-analyzer
cycle_type: learn        # → auto-wires experimenter-researcher
```

---

## Phase lifecycle

```
backlog → planning → ready → active → completed
                               ↘ blocked → (human resolves) → ready
```

| State | Meaning |
|---|---|
| `backlog` | Phase exists, no tasks yet |
| `planning` | Atomiser generating tasks (transient) |
| `ready` | Approved; `onyx run` picks this up |
| `active` | Agent holds lock, executing right now |
| `completed` | Acceptance passed, learnings consolidated |
| `blocked` | Agent hit a wall; `## Human Requirements` written |

**Scheduling:** phases sort by `priority` (0–10, default 5, higher = first) → risk → phase number.

---

## Multi-agent pipelines

The vault is the coordination layer. No message broker. Agent A completes its phase. Agent B's `depends_on: [A]` prevents it from running until A is complete.

```
Phase A (researcher)  → writes findings to vault
Phase B (writer)      → reads findings → writes script
Phase C (distributor) → reads script → publishes
```

Every phase can have a different directive (different agent identity). Same vault, same CLI, different expertise per stage.

---

## Commands

```bash
# Execution
onyx run                          # autonomous loop across all projects
onyx run --project "My Project"   # scope to one project
onyx run --once                   # single iteration (safe for first use)
onyx run --dry-run                # preview without executing

# Observability
onyx status                       # all projects + phase states
onyx explain                      # plain English: what's active, who is the agent, what's next
onyx explain "My Project"         # one project, detailed view
onyx logs "My Project"            # execution logs

# Planning
onyx init "My Project"            # create bundle (prompts for profile)
onyx plan "My Project"            # decompose Overview → phases → tasks
onyx plan "My Project" --extend   # add new phases to existing project

# Maintenance
onyx doctor                       # pre-flight: config, vault, API keys, claude CLI
onyx heal                         # fix stale locks, frontmatter drift
onyx reset "My Project"           # unblock → ready (after fixing a blocked phase)
```

---

## Configuration

**`.env`** — secrets:
```
ONYX_VAULT_ROOT=/absolute/path/to/your/obsidian/vault
OPENROUTER_API_KEY=sk-or-...
```

**`onyx.config.json`** — behaviour:
```json
{
  "vault_root": "/absolute/path/to/your/obsidian/vault",
  "agent_driver": "claude-code",
  "projects_glob": "{01 - Projects/**,02 - Work/**}",
  "model_tiers": {
    "planning":  "anthropic/claude-opus-4-6",
    "standard":  "anthropic/claude-sonnet-4-6",
    "light":     "anthropic/claude-haiku-4-5-20251001",
    "heavy":     "anthropic/claude-opus-4-6"
  },
  "max_iterations": 20,
  "stale_lock_threshold_ms": 300000
}
```

---

## Architecture

```
┌─────────────────────────────────────┐
│  Intelligence Layer (Claude)        │  Reasoning, planning, decision-making
├─────────────────────────────────────┤
│  Runtime Layer (TypeScript)         │  FSM, routing, file I/O, agent spawning
├─────────────────────────────────────┤
│  State Layer (Vault)                │  Persistent state, history, config
└─────────────────────────────────────┘

ONYX Core    = the nervous system (universal)
Profiles     = how ONYX handles each domain (mechanical)
Directives   = who the agent is for each phase (instructional)
Bundles      = instantiated projects in the vault
```

---

## First principles

1. **Vault is the only state.** If it's not in the vault, it didn't happen.
2. **Phase is sacred.** Smallest reviewable unit. No profile or directive redefines it.
3. **Profiles are thin.** Extra fields, templates, verification. Nothing more.
4. **Directives are instructions.** Text the agent reads — not config ONYX parses.
5. **Knowledge compounds.** Every phase teaches the next. Cross-session, cross-agent.
6. **Agents are disposable.** Swap the driver. Vault doesn't care.
7. **Human in the loop.** Blocked phases surface requirements. System asks instead of guessing.
8. **Observable by default.** Everything visible in Obsidian without special tooling.
9. **Convention over configuration.** Name things right, the system finds them.
10. **Domain agnostic.** Engineering is not special. The model is universal.
11. **Least mechanism.** Markdown file beats database table.

---

## Documentation

Open `./vault/` in Obsidian for the full interactive docs:

| File | What's in it |
|---|---|
| `00 - Dashboard/What is ONYX.md` | Intro and mental model |
| `00 - Dashboard/Getting Started.md` | First project walkthrough |
| `08 - System/ONYX - Quick Start.md` | **Step-by-step setup guide** |
| `08 - System/ONYX - Reference.md` | **Complete reference** — profiles, directives, pipelines, commands, internals, laws |
| `08 - System/Profiles/` | All 6 profile specs |
| `08 - System/Agent Directives/` | All system directives |

---

## License

MIT

---

**One nervous system. Many specialisations. The vault does the coordination.**
