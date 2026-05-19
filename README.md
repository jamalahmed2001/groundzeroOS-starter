# ONYX v2

> **A vault-native runtime for AI agents.** Your Obsidian vault is the operating system. Markdown is the source of truth. Claude is the executor. Six verbs run everything.

ONYX is not a SaaS, not a framework, not a CLI you have to build. It is a **vault convention plus a short runtime contract** that any capable coding agent (Claude Code by default) can follow. Point an agent at your vault, give it one of six verbs, and it does the work — reading state, executing tasks, writing results back. Sessions are disposable. The vault persists.

This is **v2** — a deliberate rewrite of the original ONYX. The first version grew an 8-operation Master Directive, a Profiles registry, and a parallel TypeScript runtime. V2 deletes most of that. What remains is small enough to read in 150 lines and resume cleanly from any pause.

---

## Two-minute model

**Three things move:**

1. **The vault** is state. Every fact lives in a markdown file with frontmatter. There is no database.
2. **The runtime contract** (`08 - System/ONYX v2 Runtime.md`, ≤ 150 lines) is the program. The agent reads it once per session.
3. **The verbs** are how you drive it. There are six — `new`, `execute`, `run`, `heal`, `compact`, `consolidate` — and most days you only use two.

**Two kinds of work:**

| Kind | Verb | Unit | Lock? | Output |
|---|---|---|---|---|
| **System-changing** | `execute` | A **phase** (one-off step) | Yes — one agent at a time | Tasks ticked, knowledge appended, `status: done` |
| **Repeatable** | `run` | A **pipeline** (declared once, run many times) | No — append-safe journal | A row in the pipeline journal + an artifact |

That distinction is the whole architecture. Building a new feature is a phase. Scoring 200 strategies every morning is a pipeline. Migrating a DB is a phase. Generating tomorrow's podcast episode is a pipeline. If you would do it again next week unchanged, it's a pipeline.

**One bundle per project:**

```
<Project>/
├── <Project> - Overview.md     ← anchor — identity, requires, verify defaults
├── <Project> - Status.md       ← derived view — active phase + pipeline queue
├── <Project> - Knowledge.md    ← append-only learnings
├── <Project> - Decisions.md    ← append-only ADRs
├── phases/                     ← one .md per phase
├── pipelines/                  ← one .md per pipeline (with journal rows)
├── logs/                       ← one .md per session
├── artifacts/                  ← binary outputs
├── refs/                       ← long-lived references
└── repo  →  <abs path>         ← symlink for engineering projects
```

Every file in the bundle carries the project prefix (`<Project> - <Type>.md`). Project IDs are kebab-case and stable across renames.

---

## The six verbs

| Verb | What it does | When you use it |
|---|---|---|
| **`new <project> [--kind X] [--repo path]`** | Scaffold a bundle from `08 - System/Templates/`. Engineering kinds get a `repo` symlink. | Start any new project. |
| **`execute <project> [phase]`** | Phase hot loop: acquire lock → run tasks → tick checkboxes → run `verify:` steps → consolidate knowledge → release. | System-changing work. New feature, migration, refactor. |
| **`run <project> <pipeline> [--input X] [--dry-run]`** | Pipeline loop: read inputs → execute stages → verify → append journal row → check promotion gates. | Repeatable work. Daily content, scoring, monitoring. |
| **`heal`** | Rebuild every `<Project> - Status.md` and the Central Dashboard. Free stale locks. Fix broken `up:` links. Flag drift. | Anytime the vault feels off. Daily cron. |
| **`compact <project>[/<file>]`** | Archive-then-rewrite an append-only file (Knowledge, journal, log digest). Originals preserved verbatim in `_archive/`. | Human-triggered only. Never automatic. |
| **`consolidate`** | Scan all `<Project> - Knowledge.md` for cross-project repetition. Emit a diff proposal to `08 - System/Proposals/` for human review. | When wisdom starts repeating across projects. |

**That's the entire runtime surface.** No `atomise`, no `decompose`, no `replan`, no `route`. The agent handles those mentally when running `execute`.

---

## How a session plays out

### Cold start (the 4 reads)

When you say `execute my-app` or just open Claude in the vault, the agent runs §A of the runtime contract:

1. Read `<Project> - Overview.md` — identity, defaults, `requires:` invariants.
2. Read `<Project> - Status.md` — active phase, last action, pipeline queue.
3. Read the active phase file in full — `## Progress`, `touches:`, `verify:` steps.
4. Read the newest `logs/*.md` — handoff via `## What's next`.

If `repo_path:` is set, it also runs `git status --porcelain` and `git log -5 --oneline` inside the repo. That catches "vault says X but disk says Y" before any work happens.

### The phase hot loop

```
acquire lock         ← only one agent on a phase at a time
open session log     ← every turn is a pause point

for each unchecked task in `## Steps`:
    execute (Bash, Edit, Write, skill, sub-agent)
    on success:
        tick the box
        append a bullet to the log
        overwrite `## Progress` (Updated / Last step / Working hypothesis / Partial state)
        refresh the lock — session can die here, next agent resumes cleanly
    on failure: retry 3× with backoff. Three consecutive failures → BLOCKING.

after all tasks ticked:
    run every `verify.step` (shell exit 0, skill stages, human ticks)
    red → BLOCKING
    green → append to Knowledge, close log, `status: done`, rebuild Status
```

**Every turn is a pause point.** Progress is written after every meaningful action, not when the agent "plans to stop." Rate limits and terminal closes do not announce themselves.

### The pipeline loop

Pipelines are journal-only. No phase file per run, no exclusive lock. Each invocation:

1. Reads its stages (`shell:` / `skill:` / `agent:` / `human:`).
2. Executes them in order.
3. Runs `verify.steps`. Red → `outcome: failed` row, abort.
4. Green → `outcome: success` row with metrics + artifact path.
5. Checks `gates.filter`. If matched and `hitl: false`, auto-promotes to the next pipeline. If `hitl: true`, writes a row to the Promotion Queue for human approval.

Two pipelines can run in parallel if they don't share an output target.

---

## Heal, compact, consolidate

**`heal`** is the daily janitor. It rebuilds derived files (every `Status.md`, the Central Dashboard), frees locks older than 30 minutes, fixes broken `up:` pointers, and flags files past compaction thresholds. It writes; it doesn't decide architecture. Run it via cron or whenever the vault feels stale.

**`compact`** is human-triggered. Append-only files (`Knowledge.md`, pipeline journals, log digests) grow forever; eventually they need a rewrite that keeps the signal and drops the chatter. `compact` does the archive-then-rewrite: the original goes to `_archive/<file>.<iso>.md` verbatim, a denser version replaces it, and the new file carries a `compacted_from:` pointer so the lineage is recoverable. Never automatic — humans decide when wisdom is settled enough to compress.

**`consolidate`** looks across every project's `Knowledge.md` for repetition. When the same lesson surfaces in three places, that's a candidate for `08 - System/PRINCIPLES.md`. The verb emits a **diff proposal** to `08 - System/Proposals/PRINCIPLES-diff-<iso>.md` for a human to review. It never writes to `PRINCIPLES.md` directly. Wisdom is promoted, not extracted.

---

## Promotion queues and HITL

Money-touching pipelines default to human approval. A pipeline that publishes to Spotify, releases via DistroKid, or pushes a paid distribution wizard writes a row to the project's Promotion Queue with `approved_by:` empty. A human edits the row to approve. The next pipeline reads only rows whose `approved_by:` is a real person (not an agent identity).

A project can override this only when (a) a Decisions ADR explicitly authorises agent approval, (b) a `refs/<Project> - Risk Budget.md` defines hard caps the agent must respect, and (c) the Promotion Queue records the budget the auto-promotion ran under. All three are non-negotiable. Safety is enforced, not asserted.

---

## Frontmatter is the cheap index; bodies are the expensive read

A scanner that rebuilds `Status.md` or the Central Dashboard only reads frontmatter across many files. An agent doing real work reads bodies. Same files, different cost. This is the reason ONYX puts dependency edges (`depends_on:`, `based_on:`, `supersedes:`, `role:`) in frontmatter rather than body wikilinks — graph operations stay cheap.

**Cross-branch links are frontmatter fields.** Body wikilinks never cross bundles. Hubs list children **down**, never up. Every file has exactly one `up:`.

---

## Useful workflows

A non-exhaustive list of patterns that map cleanly to v2:

**Daily standup.** `heal` (cron, 6am) → Central Dashboard shows what's active, what's blocked, which pipelines failed overnight. You read one file.

**Build a feature.** `new my-app --kind engineering --repo ~/code/my-app` → edit the scaffolded P01 phase to add your tasks → `execute my-app`. The agent locks the phase, ticks tasks, runs `verify.steps` (test command, type check, lint), appends what it learned. You read `logs/<latest>.md` to review.

**Daily content pipeline.** Define a pipeline in `pipelines/<Project> - generate-episode.md` with stages: `skill: suno-generate` → `skill: audio-master` → `human: review` → `skill: rss-publish`. Schedule the verb (`run <project> generate-episode`) via cron. Each run is one journal row. Failed runs don't block tomorrow's run.

**Strategy generation → backtest → promotion.** Three pipelines. `generate-strategies` fans candidates into `phases/<strategy>-<n>.md`. `backtest` runs each on historical data, writes scores to its journal. `promote` reads the journal, filters by `gates.filter` (e.g. `sharpe > 1.5`), and either auto-promotes (if a Risk Budget authorises) or queues for human approval.

**Migration.** One phase. `## Steps` lists the migration script, the verification queries, the rollback. `verify:` is a shell stage that runs the queries. Pause-resumable: a session can die mid-migration and the next agent picks up at the next unticked box.

**Investigation / debugging.** `new <project> --kind research` → one phase with `## Steps` as a hypothesis tree. The agent ticks branches as it eliminates them. `## Progress` reads like a lab notebook by the end.

**Cron-driven monitoring.** A pipeline whose `agent:` stage scores incoming events and a `human:` stage that only fires when the score crosses a threshold. The journal is your audit trail.

---

## Vault layout (the system folder)

You only need to know one folder outside your project bundles:

```
08 - System/
├── ONYX v2 Runtime.md    ← THE runtime contract. Read once per session.
├── PRINCIPLES.md         ← cross-project wisdom + gotchas. On demand.
├── Proposals/            ← `consolidate` diffs awaiting human review
├── Roles/                ← cross-project agent role briefs
├── Agent Skills/         ← Skill Overviews (one per skill in ~/clawd/skills/)
└── Templates/            ← templates `new` scaffolds from
```

**Read on demand, not on session start.** The runtime contract stands alone. Everything else is loaded by name when the agent decides it needs it.

---

## Skills

Skills live outside the vault in `~/clawd/skills/<name>/`. Each one ships with a `SKILL.md` and a `bin/<name>` entry point. The vault carries a **Skill Overview** for each skill describing its verbs, flags, and output shape — so the agent knows the interface without reading the implementation.

Adding a new skill: scaffold under `~/clawd/skills/<name>/`, write the vault Skill Overview first, implement backwards from it. Skills with a plausible second backend (e.g. another LLM provider, another TTS engine) ship with `pickProvider()` and one stub on the first commit. Pluggability from day one prevents the rewrite.

This repo's `skills/` directory contains the skills used by the bundled starter projects — Linear, Suno, ElevenLabs, audio mastering, browser automation, and others. They run independently of ONYX; ONYX just calls them.

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx.git
cd onyx
npm run setup                # installs everything: deps, builds, pre-commit hook, .env
```

`scripts/setup.sh` is idempotent. It installs all `skills/*` dependencies, builds the TypeScript skills, wires the pre-commit secret-scanner, and copies `.env.example` → `.env` if needed. See [INSTALL.md](./INSTALL.md) for the full walkthrough.

Verify the runtime works:

```bash
cd vault                     # the bundled v2 starter
claude
```

Tell Claude:

```
execute example-app
```

It scaffolds nothing — `example-app` already exists. The agent locks `P01 - Hello World`, ticks three steps, writes a Knowledge entry, runs the verify steps, and closes the phase. If that loop completes cleanly, your install is wired up correctly. Delete the bundle and create your real first project:

```
new my-app --kind engineering --repo ~/code/my-app
execute my-app
```

Full walkthrough: [`GETTING_STARTED.md`](./GETTING_STARTED.md). Pipeline patterns: [`PIPELINES.md`](./PIPELINES.md).

---

## Configuration

`onyx.config.json` sets vault path and agent driver:

```json
{
  "vault_root": "/absolute/path/to/your/obsidian/vault",
  "agent_driver": "claude-code",
  "projects_glob": "01 - Projects/**",
  "stale_lock_threshold_ms": 1800000
}
```

Secrets live in `.env` (gitignored). External skills read their own credentials from `~/clawd/skills/<name>/.env` — see each skill's `SKILL.md`.

The `hooks/pre-commit` script blocks commits containing common secret patterns (GitHub PATs, OpenAI keys, Anthropic keys, Linear tokens, AWS keys). Install it once:

```bash
git config core.hooksPath hooks
```

---

## Principles

The hard-won ones. Each is one sentence because each is one principle.

1. **One source of truth.** Vault as state, everywhere. No parallel `state.json`.
2. **Every turn is a pause point.** Write progress after every meaningful action.
3. **Frontmatter is the cheap index.** Cross-branch relationships go there, not in body wikilinks.
4. **Fractal tree, not spider web.** One `up:` per node. Hubs list children down.
5. **Pluggable backends from day one.** A skill with a plausible alternative provider ships with `pickProvider()` on commit one.
6. **Six verbs, no more.** A new operation must justify why it can't be `execute`, `run`, or `heal`.
7. **Compact and consolidate are human-triggered.** Wisdom is promoted by review, not by automation.
8. **Money-touching pipelines stop at the wizard.** Never auto-submit a paid action without an explicit Risk Budget.
9. **Stale Progress means cold-start the phase.** If `Updated:` is > 24h old or `touches:` files are newer, re-read everything before resuming.
10. **Name what you can't solve.** Blockers surface as `## Human Requirements`. Silence is not success.

---

## What ships in the bundled vault

`./vault/` is a clean v2 starter. It contains:

- `08 - System/ONYX v2 Runtime.md` — the runtime contract.
- `08 - System/PRINCIPLES.md` — cross-project wisdom.
- `08 - System/Templates/` — the templates `new` scaffolds from (Overview per kind, Phase, Pipeline, Status, Knowledge, Decisions, Journal).
- `08 - System/Roles/` — role briefs the `role:` field resolves against.
- `08 - System/Agent Skills/` — Skill Overviews for every skill in `skills/`.
- `00 - Dashboard/Central Dashboard.md` — `heal` rebuilds this.
- `01 - Projects/example-app/` — a one-phase, one-pipeline smoke test. Delete it once you have a real project.

No v1 artifacts. No Master Directive, no Operations folder, no Profiles registry. If you find a reference to any of those, it's a bug — please file an issue.

---

## License

MIT.

---

*Vault is state. Runtime contract is program. Skills are effectors. Phases are work units. Pipelines are repeatable work. Agents are disposable.*
