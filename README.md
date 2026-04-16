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

ONYX is the thinnest possible layer that connects all three. Plans live in the vault. Agents read plans, do the work, write results back. Knowledge compounds automatically across every phase.

---

## The four ideas

1. **The vault is the only state.** No external databases. Vault frontmatter = truth. If it's not in the vault, it didn't happen.
2. **The phase is sacred.** Every project decomposes into phases — smallest reviewable unit with goals, tasks, acceptance criteria, and a linked log. Same structure everywhere.
3. **Profiles specialise the scaffold.** Domain extensions that tell ONYX how to handle a project type mechanically: required fields, context docs, acceptance gate.
4. **Directives specialise the agent.** Per-phase instructions that tell the agent who it is, what to load, and what constraints to operate under.

---

## What you get

| Capability | Mechanism |
|---|---|
| **Autonomous phase execution** | `onyx run` loops over all `phase-ready` phases, spawns agents, verifies acceptance |
| **Multi-agent pipelines** | Phases chain via `depends_on`. Vault is the coordination layer — no message brokers |
| **Domain specialisation** | 9 profiles (engineering, content, research, operations, trading, experimenter, general, accounting, legal) |
| **Agent identity** | Directives give each phase a role, context rules, real data sources, and safety constraints |
| **Compounding knowledge** | Consolidator extracts learnings after every phase into `Knowledge.md` |
| **Self-healing vault** | `onyx heal` fixes stale locks, frontmatter drift, orphaned phases, graph links |
| **Observable by default** | Everything visible in Obsidian — no special tooling required |
| **Agent-agnostic** | Swap Claude Code for Cursor or a custom binary. Vault doesn't care. |

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install                       # builds TypeScript automatically via postinstall
cp .env.example .env              # set ONYX_VAULT_ROOT + OPENROUTER_API_KEY
onyx doctor                       # verify every dependency
onyx init "My First Project"      # create a bundle (prompts for profile)
onyx plan "My First Project"      # decompose + atomise into phases with tasks
onyx run                          # execute phase-ready phases
```

Full setup guide: [`CLAUDE.md`](./CLAUDE.md)

---

## Profiles

One profile per project — set `profile:` in the project's `Overview.md`. Each profile defines required fields, the bundle structure initialised by `onyx init`, and the acceptance gate that must pass before a phase can complete.

| Profile | Use for | Key required fields | Acceptance gate |
|---|---|---|---|
| `general` | Catch-all — unsure which profile, mixed domains, lightweight tasks | none | All tasks checked + output documented |
| `engineering` | Software projects with a git repo | `repo_path`, `test_command` | Test command exits 0 |
| `content` | Podcast, video, newsletter, social pipelines | `voice_profile`, `pipeline_stage` | Safety filter + voice check |
| `research` | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | Source count + confidence gaps addressed |
| `operations` | System ops, monitoring, incident response | `monitored_systems`, `runbook_path` | Runbook followed + outcome documented |
| `trading` | Algorithmic trading, strategy development | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | Backtest passes + risk compliance |
| `experimenter` | A/B testing, prompt engineering, ML experiments | `hypothesis`, `success_metric`, `baseline_value` | Result recorded + Cognition Store updated |
| `accounting` | Financial records, reconciliation, reporting | `ledger_path`, `reporting_period` | Trial balance verified |
| `legal` | Contracts, research, compliance | `jurisdiction`, `matter_type` | Evidence hierarchy followed + citations verified |

```bash
onyx init "KrakenBot"    --profile trading
onyx init "ManiPlus"     --profile content
onyx init "Prompt Lab"   --profile experimenter
onyx init "Tax Q1"       --profile accounting
```

---

## Directives

A directive is a markdown file prepended to the agent's context before it reads its phase. It tells the agent **who it is** — role, what to read first, behavioural constraints, output format.

```yaml
# In phase frontmatter
directive: maniplus-script-writer
```

**Resolution:** `My Project/Directives/<name>.md` → `08 - System/Agent Directives/<name>.md`

**Context injection order:**
```
1. Directive (who the agent is)
2. Profile (domain rules + acceptance gate)
3. Overview.md (project goals, scope, constraints)
4. Knowledge.md (all prior learnings from past phases)
5. Context doc (Repo Context / Source Context / Research Brief / etc.)
6. Phase file (what to do right now)
```

**Experimenter auto-wiring** — set `cycle_type:` on a phase, no `directive:` field needed:
```yaml
cycle_type: experiment   # → auto-wires experimenter-engineer
cycle_type: analyze      # → auto-wires experimenter-analyzer
cycle_type: learn        # → auto-wires experimenter-researcher
```

**Workflow directives** — encode non-trivial automatable processes with specific tool invocations and real data source access:

| Directive | What it encodes |
|---|---|
| `accountant` | Journal entry production, trial balance verification, Stripe + ECB FX API access |
| `investment-analyst` | Financial data retrieval (SEC EDGAR, CoinGecko, Yahoo Finance), ratio calculation, investment memo |
| `legal-researcher` | Primary source retrieval (legislation.gov.uk, CourtListener, EUR-Lex), evidence hierarchy, citations |
| `data-analyst` | EDA, SQL, PostHog/Amplitude API access, observation vs interpretation discipline |
| `security-analyst` | npm audit, semgrep, secrets grep, OWASP checklist — exact tool commands |
| `clinical-researcher` | PubMed/ClinicalTrials.gov search, evidence hierarchy, Vancouver citations |
| `journalist` | Multi-source corroboration, GDELT/Guardian search, right-of-reply protocol |
| `marketing-strategist` | Audience signal retrieval, Meta/Mailchimp/GA4 API access, objective-first structure |
| `knowledge-keeper` | Maintains Knowledge.md as structured wiki; contradiction detection; topic index |
| `observer` | Read-only state snapshot for inspection without mutation |
| `general` | Catch-all — reads phase and executes without workflow encoding |

Each data-dependent directive uses a three-tier model: Tier 1 (free public APIs, usable immediately), Tier 2 (API key in `.env`), Tier 3 (pnpm script built by an engineering phase first). See `08 - System/ONYX Integrations.md` for the full integration catalogue.

**Scaffold new directives and profiles:**
```bash
onyx new directive <name>                          # system-level directive
onyx new directive <name> --project "My Project"   # project-local directive
onyx new profile <name>                            # new domain profile
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
| `blocked` | Agent halted; `## Human Requirements` written for human review |

**Scheduling:** phases sort by `priority` (0–10, default 5, higher = first) → risk (high first) → phase number.

**Both must be set for pickup:** `state: ready` AND `tags` must include `phase-ready`.

---

## Multi-agent pipelines

The vault is the coordination layer. No message broker. Agent A completes its phase and writes output to the vault. Agent B's `depends_on: [A]` prevents it from starting until A is complete.

```
Phase A (researcher)  → writes findings to vault
Phase B (writer)      → reads findings → writes script
Phase C (distributor) → reads script → publishes
```

Every phase can have a different directive — different agent identity, different expertise — all driven by `onyx run` against the same vault.

---

## Commands

```bash
# Execution
onyx run                             # autonomous loop — all phase-ready phases
onyx run --project "My Project"      # scope to one project
onyx run --once                      # single iteration then exit (safe for cron)
onyx run --phase 2                   # run a specific phase number (implies --once)
onyx run --dry-run                   # preview what would happen without running

# Observability
onyx status                          # all projects + phase states
onyx status --json                   # machine-readable snapshot
onyx explain                         # plain English: what every project is doing
onyx explain "My Project"            # one project, detailed view
onyx logs "My Project"               # execution log
onyx logs "My Project" --recent      # most recent entries
onyx logs --audit                    # full audit trail

# Project creation + planning
onyx init "My Project"               # create bundle (prompts for profile, repo path)
onyx init "My Project" --profile engineering  # skip profile picker
onyx plan "My Project"               # decompose Overview → phase stubs → atomise to tasks
onyx plan "My Project" 2             # atomise one specific phase only
onyx plan "My Project" --extend      # add new phases to an existing project
onyx decompose "My Project"          # Overview → phase stubs only (no atomising)
onyx atomise "My Project"            # atomise all backlog phase stubs to tasks
onyx atomise "My Project" 1          # atomise a specific phase only

# Phase state management
onyx next                            # find highest-priority ready phase and run it
onyx ready "My Project"              # auto-pick next backlog phase → set ready
onyx ready "My Project" 3            # set phase 3 specifically to ready
onyx block "My Project" "reason"     # block active phase with a reason
onyx reset "My Project"              # unblock → ready (after fixing the blocker)
onyx set-state <path/to/phase.md> ready  # force state transition (for scripts)

# Vault objects
onyx new phase "My Project" "Name"   # create a new phase file
onyx new directive <name>            # scaffold system directive stub
onyx new directive <name> --project "My Project"  # project-local directive
onyx new profile <name>              # scaffold new profile

# Maintenance + recovery
onyx doctor                          # pre-flight: config, vault, API keys, claude CLI
onyx heal                            # fix stale locks, frontmatter drift, graph links
onyx check "My Project"              # validate vault state (fields, deps, directives)
onyx consolidate "My Project"        # manually trigger Knowledge consolidation
onyx refresh-context "My Project"    # re-scan repo, update Repo Context doc

# Capture + daily planning
onyx capture "note text"             # append to Inbox.md for later triage
onyx daily-plan                      # generate today's time-blocked daily plan

# Integrations
onyx dashboard                       # web dashboard on localhost:7070
onyx import <linearProjectId>        # import Linear project as vault bundle
onyx linear-uplink "My Project"      # sync vault phases to Linear issues
```

---

## Configuration

**`.env`** — secrets (never commit):
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
┌─────────────────────────────────────────┐
│  Intelligence Layer (Claude / agents)   │  Reasoning, planning, decision-making
├─────────────────────────────────────────┤
│  Runtime Layer (TypeScript CLI)         │  FSM, routing, file I/O, agent spawning
├─────────────────────────────────────────┤
│  Convention Layer (vault structure)     │  File names, frontmatter, folder layout
├─────────────────────────────────────────┤
│  State Layer (Obsidian vault)           │  Persistent state, history, config
└─────────────────────────────────────────┘

ONYX Core    = the nervous system (universal — never changes)
Profiles     = how ONYX handles each domain (mechanical)
Directives   = who the agent is for each phase (instructional)
Bundles      = instantiated projects in the vault
```

---

## First principles

1. **Vault is the only state.** If it's not in the vault, it didn't happen.
2. **Phase is sacred.** Smallest reviewable unit. No profile or directive redefines it.
3. **Profiles are thin.** Extra fields, templates, verification gate. Nothing more.
4. **Directives are instructions.** Text the agent reads — not config ONYX parses.
5. **Knowledge compounds.** Every phase teaches the next. Cross-session, cross-agent.
6. **Agents are disposable.** Swap the driver. Vault doesn't care.
7. **Human in the loop.** Blocked phases surface requirements. System asks instead of guessing.
8. **Observable by default.** Everything visible in Obsidian without special tooling.
9. **Convention over configuration.** Name things right, the system finds them.
10. **Least mechanism.** Markdown file beats database table. Local beats SaaS.
11. **Domain agnostic.** Engineering is not special. The model is universal.
12. **Healing is proactive.** System self-repairs before every run. Drift doesn't accumulate.

---

## Documentation

Open `./vault/` in Obsidian for the full interactive docs:

| File | What's in it |
|---|---|
| `00 - Dashboard/What is ONYX.md` | Mental model, use cases, the three ideas |
| `00 - Dashboard/Getting Started.md` | First project walkthrough — install to running |
| `08 - System/ONYX - Quick Start.md` | Step-by-step guide: profiles, directives, pipelines, examples |
| `08 - System/ONYX - Reference.md` | **Complete reference & playbook** — WHY each principle exists + all technical internals |
| `08 - System/ONYX Integrations.md` | Integration catalogue — all APIs by domain, tier, env var, directive |
| `08 - System/Profiles/` | All 9 profile specs with full required fields and acceptance gates |
| `08 - System/Agent Directives/` | All system directives — 15 professional roles + system roles |

---

## License

MIT

---

**One nervous system. Many specialisations. The vault does the coordination.**
