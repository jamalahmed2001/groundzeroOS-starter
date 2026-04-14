---
tags: [onyx, system, reference, status-active]
graph_domain: system
created: 2026-04-14
updated: 2026-04-14
type: reference
---

## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# ONYX — Complete Reference

> The orchestration layer for Obsidian. One nervous system. Many specialisations. Every project — code, content, research, trading, or experiments — on the same phase-driven lifecycle.

---

## Table of Contents

1. [In 30 seconds](#in-30-seconds)
2. [The four ideas](#the-four-ideas)
3. [What ONYX is and is not](#what-onyx-is-and-is-not)
4. [Architecture — four layers](#architecture--four-layers)
5. [Phase lifecycle (FSM)](#phase-lifecycle-fsm)
6. [Profiles](#profiles)
7. [Directives](#directives)
8. [Multi-agent pipelines](#multi-agent-pipelines)
9. [Build lifecycle vs operations lifecycle](#build-lifecycle-vs-operations-lifecycle)
10. [Technical internals](#technical-internals)
11. [Roles and contracts](#roles-and-contracts)
12. [Complete command reference](#complete-command-reference)
13. [Configuration](#configuration)
14. [Three laws](#three-laws)
15. [First principles](#first-principles)
16. [What makes ONYX different](#what-makes-onyx-different)
17. [Glossary](#glossary)

---

## In 30 seconds

ONYX is a local CLI + vault convention. Phase notes in your Obsidian vault hold state. A controller loop reads state, dispatches AI agents, writes results back, and compounds learnings. Profiles extend ONYX's mechanical behaviour per domain. Directives give each agent its identity and constraints per phase. Multi-agent pipelines sequence specialised agents through the vault with no message brokers — just `depends_on`. No SaaS, no database, no framework. Just markdown, frontmatter, and a deterministic state machine.

```
You plan in vault → ONYX discovers work → Directive shapes agent → Agent executes → Vault records → Knowledge compounds
```

---

## The four ideas

1. **The vault is the only state.** No external databases. No SaaS for state. If it's not in the vault, it didn't happen.
2. **The phase is sacred.** A phase is a phase — goals, tasks, acceptance criteria, log. Same structure whether you're shipping code, producing content, or synthesising research.
3. **Profiles specialise the scaffold.** Domain extensions (extra frontmatter, templates, verification) that tell ONYX how to handle a project type mechanically.
4. **Directives specialise the agent.** Per-phase instructions that tell the agent who it is, what to load, how to reason, and what it must never do.

---

## What ONYX is and is not

### What ONYX is
- A **local CLI** (`onyx`) that reads your vault and dispatches agents
- A **vault convention** — names and frontmatter fields that create a shared grammar
- A **controller loop** — heal → discover → route → act → consolidate → repeat
- A **profile system** — one execution model, domain-specific mechanical extensions
- A **directive system** — per-phase agent identity, context rules, and constraints
- A **multi-agent pipeline** — vault-coordinated sequences of specialised agents
- A **knowledge compounder** — extracts learnings after every phase, cross-project

### What ONYX is NOT
- **Not an AI agent** — it dispatches agents; the agents do the work
- **Not a SaaS** — everything runs locally
- **Not a framework** — no SDK, no import, no runtime dependency
- **Not a project manager** — no boards, sprints, velocity (just phases and logs)

---

## Architecture — four layers

```
┌─────────────────────────────────────┐
│  Intelligence Layer (Claude)        │  Reasoning, planning, decision-making
├─────────────────────────────────────┤
│  Runtime Layer (TypeScript)         │  FSM, routing, file I/O, agent spawning
├─────────────────────────────────────┤
│  State Layer (Vault + Orchestrator) │  Persistent state, history, config
└─────────────────────────────────────┘
```

TypeScript handles all deterministic operations. Claude handles judgment. Neither layer absorbs the other's responsibilities.

| Layer | Scope | What it controls | Example |
|---|---|---|---|
| **Core** | Universal | Phase lifecycle, FSM, logging, healing, knowledge | Never changes |
| **Profile** | Project | ONYX's mechanical behaviour: extra fields, templates, verification | `engineering`, `content`, `research` |
| **Directive** | Phase | Agent identity: role, context to load, rules, constraints | `maniplus-script-writer`, `market-analyst` |
| **Bundle** | Instance | The actual vault folder for one project | `ManiPlus/`, `KrakenBot/` |

### Core artefacts

| Artefact | What it is | Who writes to it |
|---|---|---|
| **Overview.md** | Source of truth: goals, profile, agent_driver, scope | Human + operator |
| **Phase note** | One unit of work: tasks, state, directive, acceptance criteria | ONYX (ticks tasks), agent (within markers) |
| **Log note** | Append-only execution record for one phase | ONYX runtime |
| **Knowledge.md** | Compounding learnings, decisions, gotchas | ONYX consolidator |
| **Kanban.md** | Read-only phase state board | ONYX (generated) |
| **Directive file** | Agent identity: role, context, constraints | Human |
| **Orchestrator.json** | Machine-readable manifest: project status, phase map | ONYX runtime |

---

## Phase lifecycle (FSM)

```
backlog → planning → ready → active → completed
                               ↘ blocked → (human resolves) → ready
```

| State | Meaning |
|---|---|
| `backlog` | Phase exists, no tasks yet |
| `planning` | Atomiser generating tasks (transient) |
| `ready` | Approved; `onyx run` will pick this up |
| `active` | Agent holds lock, executing right now |
| `completed` | Acceptance passed, learnings consolidated |
| `blocked` | Agent hit a wall, `## Human Requirements` written |

Six states. Universal. No profile or directive can add, remove, or change them.

**Task states:** `todo | in_progress | blocked | done`

**Project states:** `draft | active | blocked | complete | archived`

### Phase frontmatter

```yaml
project_id: "ProjectName"
phase_number: 1
phase_name: "Phase description"
state: ready                    # backlog | planning | ready | active | blocked | completed
directive: my-specialist        # optional — agent identity for this phase
priority: 7                     # 0–10; default 5; higher runs first
cycle_type: experiment          # experimenter only: auto-wires directive
depends_on: []                  # phase numbers that must complete first
risk: medium                    # low | medium | high
locked_by: ""                   # set by ONYX on execution
locked_at: ""                   # set by ONYX on execution
tags: [onyx-phase, phase-ready]
```

**Scheduling:** phases sort by `priority` (desc) → `risk` (high first) → `phase_number` (asc). Set `priority: 9` to jump the queue.

---

## Profiles

Profiles live in `08 - System/Profiles/` — one markdown file per domain. Set `profile:` in Overview.md frontmatter.

| Profile | Key required fields | Context doc | Verification gate |
|---|---|---|---|
| `engineering` | `repo_path`, `test_command` | Repo Context | `test_command` exits 0 |
| `content` | `voice_profile`, `pipeline_stage` | Source Context | Safety filter + voice check |
| `research` | `research_question`, `source_constraints`, `output_format` | Research Brief | Source count + confidence gaps addressed |
| `operations` | `monitored_systems`, `runbook_path` | Operations Context | `runbook_followed: true` + outcome documented |
| `trading` | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | Strategy Context + Risk Model | Backtest passes + risk model compliance |
| `experimenter` | `hypothesis`, `success_metric`, `baseline_value` | Cognition Store + Experiment Log | Result recorded + Cognition Store updated |

**Experimenter profile extras:**

`cycle_type:` on a phase auto-wires the correct directive — no `directive:` field needed:
- `learn` / `design` → `experimenter-researcher`
- `experiment` → `experimenter-engineer`
- `analyze` → `experimenter-analyzer`

`exploration_bonus: 0.0–1.0` on a phase gives UCB1 hint to prioritise exploration.

→ Full specs: [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

---

## Directives

**A directive is a markdown file prepended to the agent's context before it reads its phase.** It tells the agent who it is — role, what to read, behavioural constraints, output format.

**Resolution:** ONYX checks project-local first, then system-level fallback:
```
My Project/Directives/<name>.md   ← project-local (project-specific)
08 - System/Agent Directives/<name>.md  ← system-level (cross-project)
```

**Wire a directive to a phase:**
```yaml
directive: maniplus-script-writer   # in phase frontmatter
```

**Context injection order (what the agent reads):**
```
1. Directive file (who the agent is)
2. Profile file (domain rules + acceptance gate)
3. Project Overview.md (goals, required fields)
4. Project Knowledge.md (all prior learnings)
5. Profile-specific context doc (Repo Context / Source Context / etc.)
6. Phase file (what to do right now)
```

**Profile vs Directive:**
- Profile = contract with ONYX (how to handle this project type mechanically)
- Directive = contract with the agent (who to be for this phase)

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

## Context you must load before starting
- ManiPlus - Knowledge.md — voice constraints, tone, safety rules, learned preferences
- Docs/ManiPlus - Source Context.md — show identity and positioning
- Last 3 episode scripts — continuity

## How to function
- Always read the previous 3 episodes before writing
- Story-first structure: real story → insight → practical takeaway
- Keep sentences short. Mani's voice is conversational, not clinical.

## Output format
- 800–1,200 words for a full episode script
- Hook (first 30 seconds) written separately for shorts
- Include [PAUSE] markers where natural breaks occur

## Safety constraints (non-negotiable)
- No personalised medical advice
- All clinical claims must cite a source inline
- If uncertain about a medical fact: say so, don't guess
```

### The three levels of agent operation

```
Level 1 — General purpose
  Phase file alone. Agent reads tasks and executes.
  Good for: coding, one-off tasks, codebase provides enough context.

Level 2 — Specialised agent
  Phase file + Directive.
  Good for: content, research, ops — any domain with specific voice/safety/format rules.

Level 3 — Multi-agent pipeline
  Multiple phases, each with its own directive, connected via depends_on.
  Good for: full production pipelines where each stage requires different expertise.
```

**When to add a directive:**
- Wrong voice? → write a directive that defines tone and loads voice constraints
- Ignoring safety rules? → write a directive with non-negotiable constraints
- Missing context? → write a directive that lists the files it must read first
- Wrong output format? → write a directive that specifies format exactly

Don't add a directive to fix a bad phase spec. Unclear tasks produce unclear results. Fix the spec first.

### System directives (cross-project, available to all)

→ Full index: [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

| Directive | Purpose |
|---|---|
| `knowledge-keeper` | Maintains Knowledge.md as a structured wiki (not a log). Contradiction detection, cross-references, index. |
| `experimenter-researcher` | LEARN + DESIGN phases: reads Cognition Store, proposes what to test, writes experiment specs with falsifiable hypotheses |
| `experimenter-engineer` | EXPERIMENT phases: executes the spec exactly, records raw results without interpretation, writes Trial entry |
| `experimenter-analyzer` | ANALYZE phases: interprets delta, extracts lessons, updates Cognition Store, proposes next hypothesis |
| `observer` | Read-only state snapshot: manifest health, active phase, blockers, what controller would do next |

---

## Multi-agent pipelines

The vault is the coordination layer. No message broker. No orchestration service. Agent A completes its phase and writes output to the vault. Agent B's phase has `depends_on: [A]` — ONYX won't start B until A is complete.

```
Phase A (researcher)    → writes findings to log + vault knowledge
Phase B (writer)        → reads vault + A's output → writes script
Phase C (audio)         → reads script from vault → writes audio manifest
Phase D (distributor)   → reads audio manifest → publishes + writes links back
```

**The two-files rule:** Agents may write to exactly two files per phase:
1. The phase file — tick checkboxes, set state tag
2. The log file — append timestamped events

That's it. This rule is what makes multi-agent coordination safe. No agent can corrupt another phase.

### Example: ManiPlus pipeline (8-directive set)

| Directive | Role | What it enforces |
|---|---|---|
| `maniplus-researcher` | Weekly health topic research | Source constraints, citation format, topic selection rules |
| `maniplus-script-writer` | Episode script generation | Mani's voice, continuity, medical safety, output format |
| `maniplus-audio-producer` | ElevenLabs voice generation | Pronunciation rules, pacing markers, file naming |
| `maniplus-video-composer` | Long video + shorts assembly | Branding rules, caption requirements, aspect ratios |
| `maniplus-distributor` | RSS + YouTube + TikTok publish | Platform-specific format rules, description templates |
| `maniplus-engagement` | Comment ingestion + reply assist | Mani's reply voice, escalation rules, response time norms |
| `maniplus-analyst` | Analytics → vault learning loop | What to measure, how to write learnings back to Knowledge |
| `maniplus-meta` | Full pipeline orchestration | Delegates to all the above in sequence |

```
ManiPlus/
├── ManiPlus - Overview.md          ← profile: content
├── ManiPlus - Knowledge.md         ← voice + safety + learnings compound here
├── Directives/
│   ├── maniplus-researcher.md
│   ├── maniplus-script-writer.md
│   └── ... (8 total)
├── Phases/
│   ├── P2 - Build research pipeline.md       directive: maniplus-researcher
│   ├── P3 - Implement script generation.md   directive: maniplus-script-writer
│   └── ...
└── Episodes/                                 ← agent output lands here
```

### The meta-directive

A meta-directive describes the orchestrator — the agent that knows the whole pipeline and drives it end-to-end. It references all atomic directives and describes sequencing logic, handoff formats, and conditions that pause for human review. Use when you want a single `onyx run` to drive the whole weekly production loop.

### Rules for keeping it simple

1. **One directive per role, not per phase.** If two phases use the same persona, they share one directive file.
2. **Directives are instructions, not config.** No YAML tool registrations. A directive is a document the agent reads.
3. **The vault is the only message bus.** Agents don't call each other. Agent A writes to vault. Agent B reads from vault.
4. **Don't add a directive to fix a bad phase spec.** Check the tasks first.
5. **Build general, then specialise.** Run without a directive first. Add one only when the agent's judgment is wrong in domain-specific ways.
6. **Knowledge compounds across all agents.** Every directive should instruct the agent to write learnings back to Knowledge.md.

---

## Build lifecycle vs operations lifecycle

Every production system has two distinct ONYX phases:

**Build lifecycle** — engineering phases that construct the pipeline:
```
P1 Bootstrap → P2 Build researcher → P3 Build writer → P4 Build audio → ...
profile: engineering | agent: claude-code | directives: the specialist personas being built
```

**Operations lifecycle** — a separate ONYX project that runs the pipeline repeatedly:
```
R1 Research → R2 Script → R3 Audio → R4 Video → R5 Publish → R6 Engage → R7 Learn
profile: content | directives: the specialist personas built in the build lifecycle
```

Same vault. Same CLI. Same `onyx run`. Two projects. The build project creates the system; the ops project runs it.

---

## Technical internals

### Deterministic routing table

Given immutable project state, the same input always produces the same dispatch decision:

```
(status, pipeline_atoms, phases) → (dispatch?, mode, priority)

blocked | archived | complete    →  skip                         (never dispatch)
active, atom.status=active       →  dispatch, mode=atomToMode(), p=10
active, atom.status=pending      →  dispatch, mode=status,       p=5
active, no atoms, phases>0       →  dispatch, mode=execute-phase, p=8
active, no atoms, no phases      →  dispatch, mode=status,        p=3
```

No randomness. Kernel processes highest-priority projects first each iteration. Circuit breaker: 3 consecutive failures per project → 30-min cooldown.

### Orchestrator.json — ManifestV2 schema

```typescript
interface ManifestV2 {
  manifest_version: 2;
  project_id: string;
  repo_path: string;
  status: 'draft' | 'active' | 'blocked' | 'complete' | 'archived';
  health: 'healthy' | 'degraded' | 'critical';
  active_phase: number | null;
  phases: {
    [phaseNumber: string]: {
      title: string;
      status: 'planned' | 'ready' | 'active' | 'blocked' | 'complete';
      file: string;           // vault-relative path to phase .md
      tasks_total?: number;
      tasks_done?: number;
      tasks_blocked?: number;
    }
  };
  pipeline_atoms: Array<{
    atom: string;             // e.g. "Phase-Executor", "Sync-State"
    predicate: string;
    status: 'pending' | 'active' | 'complete' | 'blocked';
  }>;
  config: {
    test_cmd?: string;
    lint_cmd?: string;
    build_cmd?: string;
  };
  last_run: {
    run_id: string;
    timestamp: string;
    outcome: string;
    phase?: number;
    task?: string;
  } | null;
  created: string;
  updated: string;
}
```

### Agent context assembly (QMD format)

Context passed to each agent is structured as a YAML-like query block:

````
```query
phase:
  file: "Phases/Phase 2 - Build API.md"
  excerpt: |
    ## Tasks
    - [ ] Define schema
      - Files: src/schemas.ts
      - Steps: Add User interface, export

knowledge:
  excerpts: |
    Relevant historical learnings from Knowledge.md...

files:
  task_files:
    - path: src/schemas.ts
      excerpt: |
        [first 24 lines containing target symbols]

exec_log:
  recent_entries: |
    [2026-03-25] Phase 1 completed: 4 tasks done
```
````

Size caps: plan mode 4,000 chars, execute mode 3,200 chars. File snippets: 24 lines max per file.

### Self-healer — repair types

`runSelfHealer()` runs **before every pipeline** — not only on error flags. All repairs are idempotent.

| Repair Type | Detection | Action |
|---|---|---|
| `stale_lock` | Lock age > 15 min | Delete lock file |
| `stale_session` | Session mtime > 7 days | Delete session file |
| `frontmatter_drift` | `status ≠ phase_status_tag` | Apply canonical FSM state to both fields |
| `orphaned_phase` | Phase `active` AND 0 unchecked tasks | Transition → `complete` |
| `corrupt_lock` | Lock file unparseable | Delete file |

Failed repairs log as `repaired: false` but don't throw. Healing continues even if bundle load fails.

### Pipeline recipes (7 types)

| Recipe | Steps | Purpose |
|---|---|---|
| `full-execute` | refiner → placement → sync → consolidator → atomiser → planner → executor → notify | Complete workflow |
| `plan-phase` | placement → planner → notify | Plan a single phase |
| `status` | status → notify | Report current state |
| `import-linear` | linearImport → placement → atomiser → sync → planner → linearUplink → notify | Import Linear issues |
| `uplink` | linearUplink → notify | Push state to Linear |
| `sync-linear` | linearSync → notify | Sync project-Linear mappings |
| `placement-only` | placement → hint → notify | Store intent without executing |

---

## Roles and contracts

### The seven roles

| Role | Permissions | Responsibilities |
|---|---|---|
| **Controller** | Write any vault file (via `writeBundle()`) | Convert intent → mode → pipeline. Run self-heal first. Maintain locks + FSM invariants. |
| **Kernel** | Read all manifests, trigger Controller | Autonomous batch loop. Scan manifests, dispatch with circuit breaker, enforce iteration cap. |
| **Observer** | **Read-only** | State snapshot: manifest health, active phase, task counts, blockers, what controller would do next. |
| **Vault Writer** | Write designated nodes via `writeBundle()` | Structured vault updates through IO gateway only. No ad-hoc folders. |
| **Planner** | Write inside `<!-- AGENT_WRITABLE_START:phase-plan -->` markers only | Expand phase into atomic tasks. Each task: Files, Steps, Validation. |
| **Executor** | Code repo writes within scoped workdir | Execute exactly one atomic task at a time. No direct vault writes (runtime ticks tasks). |
| **Consolidator** | Write `Knowledge.md` + phase frontmatter via `writeBundle()` | Synthesise learnings when phase completes. Preserve raw phase notes. |

**"Who am I?" checklist for any agent:**
- Am I **observing**? → read-only status snapshot
- Am I **planning**? → write only inside plan markers
- Am I **executing**? → change code only, return results
- Am I **routing**? → deterministic decision + pipeline execution

If unclear: default to **Observer** and ask for clarification.

### The four contracts

**Contract A — Vault is the State Machine**
- `Orchestrator.json` + phase notes + checkboxes = current truth.
- Runtime always reads fresh before writing. No stale writes.

**Contract B — Deterministic Routing**
- Routing decisions must not depend on LLM judgment.
- Given the same manifest state, routing is the same. Every time.

**Contract C — Single Writer**
- Vault writes are centralised. All mutations go through `writeBundle()`.
- No component bypasses the IO gateway.

**Contract D — Agents are bounded**
- Planner writes plans (within markers).
- Worker executes one task, returns results.
- Runtime owns all FSM transitions, checkbox ticking, and logging.

### OpenClaw / ONYX integration

**OpenClaw provides the agent runtime substrate:**
- Messaging surfaces (webchat, WhatsApp, etc.)
- Tool calling + permissions
- Cron + scheduling
- Session isolation and routing

**ONYX provides the project autonomy engine:**
- Vault structure + state machines
- Deterministic routing + pipeline steps
- Context orchestration (QMD packets)
- Phase planning + task execution loops

**The integration point:** OpenClaw receives an intent message → triggers an ONYX controller run → ONYX runs heal → route → plan/execute → write vault → notify.

---

## Complete command reference

### Daily execution
```bash
onyx run                          # full autonomous loop across all projects
onyx run --project "My Project"   # scope to one project
onyx run --once                   # single iteration (safe for first use)
onyx run --phase 2                # run specific phase only
onyx run --dry-run                # preview what would happen without executing
```

### Observability
```bash
onyx status                       # all projects + phase states
onyx status --json                # machine-readable snapshot
onyx explain                      # plain English: what's happening, who is the agent, what's next
onyx explain "My Project"         # one project, detailed view
onyx logs "My Project"            # execution logs
onyx logs "My Project" --recent   # last 5 entries
```

### Project creation + planning
```bash
onyx init "My Project"            # interactive bundle creator (prompts for profile)
onyx init "My Project" --profile content   # skip profile picker
onyx plan "My Project"            # decompose Overview → phase stubs → tasks
onyx plan "My Project" 2          # atomise one phase only
onyx plan "My Project" --extend   # add new phases to existing project
```

### Maintenance + recovery
```bash
onyx doctor                       # pre-flight: config, vault, API keys, claude CLI
onyx heal                         # fix stale locks, frontmatter drift, orphaned phases
onyx reset "My Project"           # unblock → ready (after fixing a blocked phase)
onyx set-state <path> ready       # force state change for scripts/dashboard
onyx consolidate "My Project"     # manually trigger Knowledge consolidation
onyx refresh-context "My Project" # re-scan repo, update Repo Context doc
```

### Integrations
```bash
onyx import <linearProjectId>     # import Linear project as vault bundle
onyx linear-uplink "My Project"   # sync phases to Linear
onyx dashboard                    # web dashboard on localhost:7070
```

### Capture + daily planning
```bash
onyx capture "<text>"             # append to Inbox.md for later triage
onyx daily-plan [YYYY-MM-DD]      # generate time-blocked daily plan
```

### Deprecated commands (still work, print warning)

| Old command | Replacement |
|---|---|
| `onyx execute <project> [n]` | `onyx run <project> --phase <n>` |
| `onyx atomise <project>` | `onyx plan <project>` |
| `onyx plan-phase <project> [n]` | `onyx plan <project> <n>` |
| `onyx plan-project <project>` | `onyx plan <project>` |

### Operator flows

**A — Start a new project:**
```
1. onyx init "My Project"
2. Fill in Overview goals + constraints in Obsidian
3. onyx plan "My Project"
4. onyx run "My Project" --once
```

**B — Execute what's ready today:**
```
1. onyx status
2. onyx daily-plan
3. onyx run --once
```

**C — Something looks stuck:**
```
1. onyx status --json | jq '.projects[].phases[] | select(.status == "phase-blocked")'
2. onyx heal
3. If still stuck: onyx reset "Project" --phase 3
```

---

## Configuration

**`.env`** (secrets)
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

**Controlling agent behaviour from the vault:**

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

## Three laws

1. **Vault is the only state.** No external databases. No sidecar files. Vault frontmatter = truth.
2. **Agents write to exactly two files per phase.** Phase note + log note. Nothing else.
3. **Tags are the FSM, locks are in frontmatter.** `state:` is canonical. `locked_by` + `locked_at` are the lock.

---

## First principles

1. Phase is sacred — no profile or directive redefines it
2. Vault is truth — if not in vault, didn't happen
3. Profiles are thin — fields, templates, verification only
4. Directives are instructions — text the agent reads, not config ONYX parses
5. Knowledge compounds — every phase teaches the next
6. Agents are disposable — swap drivers, vault doesn't care
7. Human in the loop — blocked phases ask for help
8. Observable by default — everything readable in Obsidian without special tooling
9. Convention over configuration — right names, system finds things
10. Domain agnostic — engineering is not special
11. Least mechanism — markdown file beats database table

---

## What makes ONYX different

**vs. Jira / Linear / Notion:**
- Vault-native; no SaaS dependency; state is local, versionable, inspectable
- Explicit execution contract (phases + logs + knowledge), not generic tickets
- Agents run against the vault directly — no integration layer

**vs. raw Claude Code / Cursor:**
- Stops every project being a one-off prompt ritual
- Safe multi-agent coordination via locks and `depends_on`
- Durable logs + compounding knowledge across sessions
- Profiles + directives give agents consistent domain identity

**vs. Zapier / n8n / workflow tools:**
- Those automate known, deterministic steps
- ONYX automates the *work loop* where judgment, adaptation, and domain knowledge are needed

---

## Glossary

| Term | Definition |
|---|---|
| **Bundle** | The vault folder for one project: Overview, Knowledge, Phases/, Logs/, optional Directives/ |
| **Phase** | One agent session of work. Has tasks, acceptance criteria, FSM state, optional directive. |
| **Profile** | Per-project-type mechanical contract: required fields, context doc, acceptance gate, init docs. |
| **Directive** | Per-phase agent identity file: role, what to read, constraints, output format. |
| **Orchestrator.json** | Machine-readable manifest: project status, phase map, pipeline atoms, last run. |
| **Knowledge.md** | Append-compounding learnings extracted from completed phases. Agent reads at start of every phase. |
| **QMD** | Query-Manifest-Document — YAML-like context packet passed to each agent invocation. |
| **pipeline_atoms** | Pending work units inside Orchestrator.json. Drive the routing table. |
| **cycle_type** | Experimenter field: `learn|design|experiment|analyze`. Auto-wires the correct directive. |
| **two-files rule** | Per phase, agents write only to: (1) the phase note, (2) the log note. |
| **self-healer** | Runs before every pipeline. Repairs stale locks, frontmatter drift, orphaned phases. |
| **consolidator** | Synthesises completed phase into Knowledge.md. Runs automatically between phases. |
| **Circuit breaker** | 3 consecutive project failures → 30-min cooldown. Any success resets the counter. |
