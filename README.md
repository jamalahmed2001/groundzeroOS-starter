# ONYX

> **The vault-native runtime for AI agents.** Your Obsidian vault is the OS. Markdown is the source of truth. Skills do the work. One directive tells every agent how to behave.

---

## What is ONYX?

ONYX is not a framework or a SaaS. It is a **vault convention + a runtime directive**. You point an AI agent at your Obsidian vault; it reads the **ONYX Master Directive** and behaves as the system. State lives in frontmatter. Work is scoped to phases. Knowledge compounds. Every iteration runs the same loop:

```
heal → find work → lock → load context → execute → consolidate → release → repeat
```

No database. No message broker. No control plane. If it is not in a markdown file in the vault, it does not exist.

---

## Two-minute model

ONYX is five primitives, one directive, one loop.

**The Master Directive** (`08 - System/ONYX Master Directive.md`) is the runtime's law. Every agent loads it first and follows its invariants, state model, and operation semantics. Update the directive → the runtime's behaviour changes. There is no other source of truth.

**The five primitives** that make up everything else:

| Primitive | What it is | Where it lives |
|---|---|---|
| **Skill** | A capability the agent can invoke (native tool or external CLI). | `~/clawd/skills/<name>/` (external) + vault Skill Overview |
| **Directive** | One phase's agent brief — role, tools to call, outputs to write. | `08 - System/Agent Directives/` or `<project>/Directives/` |
| **Profile** | Invariants for a whole project-type — required fields, acceptance gate. | `08 - System/Profiles/<name>.md` |
| **Phase** | One unit of work — status, deps, tasks, acceptance, Human Requirements. | `<project>/Phases/<Prefix><N> - <Title>.md` |
| **Skill Overview** | Vault-facing contract: verbs, flags, output shape. | `08 - System/Agent Skills/<name> - Skill Overview.md` |

**Every new thing must be one of these five.** No new category without evidence.

---

## Why it exists

Knowledge work has no operating layer. You have:

- **Project tools** (Jira, Linear, Notion) — track work, don't execute it
- **AI agents** (Claude, Cursor) — execute work, forget everything between sessions
- **Knowledge bases** (Obsidian) — store facts, don't do anything

ONYX connects all three with the thinnest viable glue: markdown frontmatter as state, a directive as program, phases as the unit of work. Plans live in the vault. Agents read plans, do work, write results back. Knowledge compounds automatically across every phase, every agent, every session.

---

## The runtime loop

Every iteration — whether triggered by `onyx run`, a cron job, or a human invoking the agent directly — executes the same eight steps from §3 of the Master Directive:

```
1. Heal       — clear stale locks, repair hub back-links, normalise frontmatter drift
2. Find work  — scan for the next actionable phase (priority + dependencies respected)
3. Lock       — stamp the phase with agent-id + ISO timestamp
4. Load ctx   — phase → overview → profile → directive → Knowledge.md → linked files
5. Route      — atomise / wait / execute / surface_blocker / skip (the five operations)
6. Execute    — call skills, follow the directive, write progress to the phase note
7. Consolidate— on completion, merge learnings into Knowledge.md
8. Release    — clear the lock, append to ExecLog, exit (or loop)
```

The agent is disposable. The vault persists the state that makes the next iteration possible.

---

## Vault organisation

The vault is a **fractal tree, not a spider web**. Every node has one `up:` parent. Cross-branch relationships (profile-of, based-on, directive-for) live in frontmatter, not body wikilinks. Obsidian's graph view becomes a branching star, which is what you want.

```
vault/
├── 00 - Dashboard/
│   ├── ExecLog.md            # append-only runtime trace
│   ├── Inbox.md              # quick-capture triage queue
│   └── Daily/                # daily planning + log notes
├── 01 - Projects/
│   └── <My Project>/         # project bundle
│       ├── <Project> - Overview.md
│       ├── <Project> - Knowledge.md
│       ├── Phases/
│       │   ├── <Project> - P01 - Build a thing.md
│       │   ├── <Project> - O3 - Run the pipeline.md
│       │   └── <Project> - R1 - Investigate the spike.md
│       ├── Logs/
│       └── Directives/       # project-local directive overrides (optional)
└── 08 - System/              # cross-project primitives
    ├── ONYX Master Directive.md
    ├── Cross-Project Knowledge.md  # principles graduated from project Knowledge.md
    ├── Doctor Directive.md         # pre-flight health checks
    ├── Agent Directives/           # role-archetype contracts
    ├── Agent Skills/               # skill overviews + _onyx-runtime/ primitives
    ├── Conventions/                # authoring guides (minimal-code, fractal-linking, tags, browser-automation)
    ├── Operations/                 # the nine runtime operations (heal, route, atomise, execute, …)
    ├── Principles/                 # distilled wisdom (M2 — coming next)
    ├── Profiles/                   # project-type contracts (engineering, content, audio-production, …)
    └── Templates/                  # copy-and-fill scaffolds for every artefact type
```

### Phase lifecycle prefixes

Phase filenames carry a single letter describing the **lifecycle role** of that phase, not the sub-activity inside it. A research step inside an ops run is still `O<N>` — the enclosing unit is operational.

| Prefix | Meaning | Typical use |
|---|---|---|
| **`P`** | Plan / Build | One-off setup, scaffolding, new feature, migration |
| **`O`** | Ops | Recurring production runs of an established pipeline |
| **`R`** | Research | Investigation, sniffing, feasibility, discovery |
| **`E`** | Experiment | Experimenter-profile cycles (learn / design / experiment / analyze) |
| **`M`** | Maintenance | Cleanup, dependency upgrades, refactors, non-trivial bugfixes |

Numbers are per-prefix and per-project: `P01`, `P02`, …; separately `O1`, `O2`, …; decimals (`O3.5`) are fine for interstitial steps.

---

## Profiles

One profile per project — set `profile:` in the project's `Overview.md`. The profile defines required fields, the bundle skeleton created by `onyx init`, and the acceptance gate that must pass before a phase can complete.

| Profile | Use for | Required fields | Acceptance gate |
|---|---|---|---|
| `general` | Catch-all, lightweight tasks | none | All tasks checked + output documented |
| `engineering` | Software projects with a git repo | `repo_path`, `test_command` | Test command exits 0 |
| `content` | Podcast, video, newsletter, social pipelines | `voice_profile`, `pipeline_stage` | Safety filter + voice check |
| `research` | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | Source count + gaps addressed |
| `operations` | System ops, monitoring, incident response | `monitored_systems`, `runbook_path` | Runbook followed + outcome documented |
| `trading` | Algorithmic trading, strategy development | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | Backtest passes + risk compliance |
| `experimenter` | A/B testing, prompt engineering, ML experiments | `hypothesis`, `success_metric`, `baseline_value` | Result recorded + Cognition Store updated |
| `accounting` | Financial records, reconciliation, reporting | `ledger_path`, `reporting_period` | Trial balance verified |
| `legal` | Contracts, research, compliance | `jurisdiction`, `matter_type` | Evidence hierarchy + citations verified |
| `audio-production` | Music/audio-first pipelines (My Podcast, My Album) | `voice_profile`, `lufs_target` | Mastered audio + LUFS target met |

Profiles are **invariants**. If a rule only applies to some phases of a project-type, it's a directive rule, not a profile.

---

## Directives

A directive is a markdown file prepended to the agent's context before it reads its phase. It tells the agent **who it is** — role, what to read first, behavioural constraints, output format.

```yaml
# In phase frontmatter
directive: clinical-researcher
```

**Resolution order** (bundle-local wins over system-global):
1. Phase's explicit `directive:` field
2. Auto-wiring for experimenter phases (`cycle_type:` → `experimenter-<role>`)
3. `<project>/Directives/<default>.md` if present
4. Profile's default directive
5. `08 - System/Agent Directives/general.md`

**Context injection order for every phase:**
```
Master Directive → Directive → Profile → Overview → Knowledge → Context file → Phase → Skill Overviews
```

Each data-dependent directive declares the **skills** it needs (API clients, browser recipes, vault primitives) and the **sources** it can read from. Representative directives:

| Directive | What it encodes |
|---|---|
| `clinical-researcher` | PubMed/ClinicalTrials.gov search, evidence hierarchy, Vancouver citations |
| `data-analyst` | EDA, SQL, PostHog/Amplitude API access, observation-vs-interpretation discipline |
| `investment-analyst` | SEC EDGAR, CoinGecko, Yahoo Finance; ratio calculation; investment memo |
| `legal-researcher` | legislation.gov.uk, CourtListener, EUR-Lex; evidence hierarchy; citations |
| `security-analyst` | npm audit, semgrep, secrets grep, OWASP checklist |
| `journalist` | Multi-source corroboration, GDELT/Guardian search, right-of-reply protocol |
| `universal-engagement` | Comment ingestion → safety filter → HITL approval → reply post |
| `universal-publisher` | Pluggable publish fan-out (YouTube/Spotify/TikTok/Instagram) |
| `knowledge-keeper` | Maintains Knowledge.md as structured wiki; contradiction detection |
| `observer` | Read-only state snapshot; never mutates |
| `general` | Catch-all; reads phase and executes without workflow encoding |

---

## Skills

The **skill surface layer** (§10 of the Master Directive) is everything an agent can invoke during a phase. There are exactly two categories:

**Native skills** — built into the runtime, always available:
`read_file`, `write_file`, `edit_file`, `grep`, `glob`, `bash`, `web_fetch`, `web_search`. Plus vault convenience helpers (`read_frontmatter`, `append_to_section`, `check_box`, `append_execlog`).

**External skills** — installed under `~/clawd/skills/<name>/`, with a bin at `<name>/bin/<name>`. Each one has a **Skill Overview** in the vault describing verbs, flags, output shape, prerequisites. The starter vault ships overviews for a generic set:

| Category | Skills |
|---|---|
| Agent Execution | `agent-spawn`, `onyx-controller`, `context-orchestrator` |
| Integrations | `linear-fetch`, `linear-uplink`, `notion-context`, `rss-fetch` |
| Media & Content | `whisper-groq`, `elevenlabs-tts`, `audio-master`, `suno`, `pubmed-search`, `remotion-best-practices` |
| Distribution | `spotify-creators`, `music-distro`, `rss-publish`, `youtube-publish`, `youtube-comments`, `tiktok-publish`, `instagram-publish`, `analytics-pull` |
| Personal & Productivity | `plan-my-day` |
| Infrastructure | `headless-browser`, `browser-automate`, `cloudflare-dns-sync`, `housekeeping`, `obsidian`, `project-health` |
| Utilities | `prompt-optimizer`, `clawdbot-cost-tracker`, `image-resize`, `pdf-extract`, `comment-safety-filter` |

A phase, directive, or profile can declare `skills:` in frontmatter to whitelist its allowed surface. Outside that set → log a warning.

Adding a new skill: scaffold under `~/clawd/skills/<name>/`, write the vault Skill Overview first, then implement backwards from it. Follow `08 - System/Conventions/Minimal Code Max Utility.md`. Ship with pluggable providers from day one if a second backend is plausible.

---

## Pipeline starters

After `My First Project` runs end-to-end, the repo ships ready-to-fork pipeline starters under `01 - Projects/`. Each is a complete phase/directive/skill scaffold for one work shape — copy it, rename it, swap in your project's specifics.

| Starter | Profile | Demonstrates | Status |
|---|---|---|---|
| `My First Project` | `general` | Hello-world phase, the loop runs end-to-end | shipped |
| Engineering — Greenfield Service | `engineering` | 10-phase build → test → harden → deploy → observe pipeline (language-agnostic) | M4 — pending |
| Research — Investigation | `research` | 5-phase scope → gather → synthesise → write → review | M4 — pending |
| Video — Animated Short | `video-production` | 9-phase animated short pipeline (audio-first, character continuity, model routing) | M5 — pending |
| Music — Album Release | `audio-production` | 11-phase concept → generate → master → release → engagement pipeline | M5 — pending |
| Podcast — Spoken Audio Show | `audio-production` | 7-phase plan → research → script → audio → render → publish → engage | M6 — pending |

Each starter pulls the relevant directives from `08 - System/Agent Directives/` and the relevant Templates from `08 - System/Templates/`, so every starter shares the same foundation. See [`PIPELINES.md`](./PIPELINES.md) for the full index.

---

## Wisdom: the Principles library

`08 - System/Principles/` *(M2 — coming next)* distils ~25-30 generalised principles earned from running real pipelines. Things like "audio-first pipeline", "QC gate between every phase", "no invented day-of-week framing", "character continuity stack", "verifiable contact details only". Directives wikilink them and assume the reader has read them.

The operator graduates patterns up the chain: `project Knowledge.md` → `Cross-Project Knowledge.md` → `Principles/`. Most things stay in project Knowledge; only what truly generalises ascends.

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install                       # postinstall runs tsc → dist/
cp .env.example .env              # set ONYX_VAULT_ROOT + OPENROUTER_API_KEY
onyx doctor                       # verify every dependency
onyx init "My First Project"      # create a bundle (prompts for profile)
onyx plan "My First Project"      # decompose Overview → phases → tasks
onyx run                          # execute phase-ready phases
```

Full setup: [`GETTING_STARTED.md`](./GETTING_STARTED.md). The bundled `./vault/` is a working starter with example project, templates, directives, profiles, conventions, skill overviews, and the Master Directive.

---

## CLI — thin helpers around the vault

The `onyx` CLI is convenience, not authority. Everything it does is expressible as reads and writes of markdown files in the vault. The Master Directive is what makes an agent ONYX-shaped; the CLI just saves keystrokes.

```bash
# Execution
onyx run                             # autonomous loop — all phase-ready phases
onyx run --project "My Project"      # scope to one project
onyx run --once                      # single iteration then exit (safe for cron)
onyx run --phase 2                   # run a specific phase

# Observability
onyx status                          # all projects + phase states
onyx explain                         # plain English: what every project is doing
onyx logs "My Project"               # execution log

# Project creation + planning
onyx init "My Project"               # create bundle (prompts for profile, repo path)
onyx plan "My Project"               # decompose + atomise
onyx atomise "My Project" 1          # atomise a specific phase

# Phase state
onyx next                            # highest-priority ready phase → run
onyx ready "My Project" 3            # set phase 3 to ready
onyx block / onyx reset              # blocker management
onyx consolidate "My Project"        # phase-group archive (two-pass: archive + trash)
onyx monthly-consolidate --prune --delete-dailies    # monthly daily-note consolidation

# Maintenance
onyx doctor                          # pre-flight checks
onyx heal                            # clear stale locks, fix drift, repair graph
onyx check "My Project"              # validate bundle shape (read-only)

# Scaffolding
onyx new phase "My Project" "Name"
onyx new directive <name>
onyx new profile <name>
```

---

## Configuration

**`.env`** — secrets, never commit:
```
ONYX_VAULT_ROOT=/absolute/path/to/your/obsidian/vault
OPENROUTER_API_KEY=sk-or-...
```

**`onyx.config.json`** — behaviour:
```json
{
  "vault_root": "/absolute/path/to/your/obsidian/vault",
  "agent_driver": "claude-code",
  "projects_glob": "01 - Projects/**",
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

---

## Principles (hard-won, from §20 of the Master Directive)

1. **One source of truth.** Vault-as-state everywhere. Skills that cache state across runs are wrong. Write to the vault; read from the vault.
2. **Minimal code, max utility.** Every line earns its place. Five composable primitives; no new category without evidence.
3. **Vault-first beats parallel databases.** Every `state.json` temptation has been replaced by frontmatter. Resist the regression.
4. **Fractal tree, not spider web.** One `up:` parent per node. Cross-branch relationships in frontmatter, not body wikilinks.
5. **Pluggable backends from day one.** Skills with a plausible alternative provider ship with `pickProvider()` and one stub on the first commit.
6. **Directives orchestrate; skills execute; profiles constrain.** Violate that separation and debugging becomes archaeology.
7. **Declare the plan before the code.** Write the vault contract (phase file or Skill Overview) first. Implement backwards from it.
8. **Name what you can't solve.** Blockers surface as `## Human Requirements`. Silence is not success.
9. **Verify before declaring done.** After a move, list the destination. After a merge, grep for stragglers. "Should be fine" ≠ "verified fine."
10. **Human in the loop on paid actions.** Never auto-submit a DistroKid release, a Spotify publish, a music-distro flow. Leave the wizard at the review step.

---

## Documentation

Open `./vault/` in Obsidian for the live docs:

| File | What's in it |
|---|---|
| `08 - System/ONYX Master Directive.md` | **The runtime spec.** Every agent reads this first. Everything flows from here. |
| `08 - System/Conventions/Minimal Code Max Utility.md` | Authoring convention for skills, directives, and phase work |
| `08 - System/Conventions/Browser Automation for Services Without APIs.md` | CDP-attach pattern for Clerk-protected / session-bound services |
| `08 - System/Agent Skills/Agent Skills Hub.md` | Registry of all skills, grouped by category |
| `08 - System/Agent Directives/` | All system directives — professional roles + system roles |
| `08 - System/Profiles/` | All profile specs with required fields and acceptance gates |
| `00 - Dashboard/What is ONYX.md` | Mental model, use cases |
| `00 - Dashboard/Getting Started.md` | First project walkthrough — install to running |

---

## License

MIT

---

**Vault is state. Master Directive is program. Skills are effectors. Phases are work units. Agents are disposable.**
