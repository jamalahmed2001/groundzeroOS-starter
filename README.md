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

**Important: the verbs are agent procedures, not compiled CLIs.** `bin/onyx <verb>` is a thin shell dispatcher — it builds a prompt and spawns Claude Code. Claude then reads `08 - System/ONYX v2 Runtime.md` and follows the procedure for that verb. The "implementation" of `execute` is §B of the runtime contract; the "implementation" of `run` is §C. There's no scaffolder binary, no heal daemon, no compiled state machine. Everything is markdown + an agent that follows the contract. This is the whole point of v2.

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

Skills are the effectors agents call to do real work — talk to APIs, drive browsers, run ffmpeg, publish to platforms. Each skill is a standalone CLI with its own `SKILL.md` (the source-of-truth contract) and a `bin/<name>` entry point.

**Two-file pattern per skill:**

| File | Lives at | Audience |
|---|---|---|
| `SKILL.md` | `skills/<name>/SKILL.md` | The skill itself — full reference: verbs, flags, env vars, output shape, prerequisites. |
| `<name> - Skill Overview.md` | `vault/08 - System/Agent Skills/` | The agent — short vault-facing contract: when to call, when not to, how to invoke. Points at `SKILL.md` for the details. |

The Overview keeps the agent's context window cheap. The full `SKILL.md` is loaded only if the agent decides it needs the details.

**What ships in this repo** (`skills/`):

- **User-facing effectors** (29) — each has both a `SKILL.md` and a vault Overview: `audio-master`, `browser-automate`, `captcha-solve`, `chatgpt-compose`, `cloudflare-dns-sync`, `comment-safety-filter`, `elevenlabs-tts`, `fal`, `headless-browser`, `housekeeping`, `instagram-publish`, `linear`, `music-distro`, `nano-banana-compose`, `notify`, `notion-context`, `obsidian`, `prompt-optimizer`, `pubmed-search`, `rss-fetch`, `rss-publish`, `spotify-creators`, `subtitle-burner`, `suno`, `suno-generate`, `tiktok-publish`, `whisper-groq`, `youtube-comments`, `youtube-publish`.
- **Internal runtime helpers** (4) — `agent-spawn`, `audit-trail`, `config-load`, `repo-resolve`. No vault Overview; they're plumbing the dispatcher uses.

Adding a new skill: scaffold under `skills/<name>/`, write the vault Overview first (describes the contract you're committing to), implement backwards from it. Skills with a plausible second backend ship with `pickProvider()` and one stub on the first commit — pluggability from day one prevents the rewrite.

---

## Quick start

```bash
git clone https://github.com/jamalahmed2001/onyx.git
cd onyx
npm run setup
```

`scripts/setup.sh` is idempotent. It runs `npm install && npm run build` for every skill in `skills/*/` that has a `package.json`, wires `core.hooksPath=hooks` so the pre-commit secret-scanner is active, copies `.env.example` → `.env` if missing, and marks `bin/onyx` + `tools/*.sh` executable. If a single skill fails to build it reports the offender and continues — fix and re-run.

Edit `.env` to add only the keys you actually need (most skills are off by default; only the ones you wire into pipelines need keys). See [INSTALL.md](./INSTALL.md) for the per-step troubleshooting walkthrough.

Verify the runtime works with the bundled smoke test:

```bash
cd vault                     # the bundled v2 starter
claude
```

Tell Claude:

```
execute example-app
```

The agent runs cold-start (reads Overview → Status → active phase → newest log), locks `P01 - Hello World`, ticks three steps (writes `artifacts/hello.txt`, appends to `Knowledge.md`, re-reads to confirm), runs the two `verify.steps`, closes the log with `outcome: done`, sets `status: done`, and rebuilds `Status.md`. If that loop completes cleanly, your install is wired up correctly.

Delete `example-app` and scaffold your real first project:

```
new my-app --kind engineering --repo ~/code/my-app
execute my-app
```

Full walkthrough: [`GETTING_STARTED.md`](./GETTING_STARTED.md). Pipeline patterns: [`PIPELINES.md`](./PIPELINES.md).

### What you get immediately vs what Claude builds at runtime

| Pre-built (ships in the clone) | Built at runtime by Claude |
|---|---|
| `08 - System/ONYX v2 Runtime.md` — the contract | Project bundles via `new` (Overview/Status/Knowledge/Decisions, phases, pipelines) |
| 12 templates with documented placeholder convention | Phase `## Steps` ticked one at a time, with `## Progress` overwritten after each |
| 24 role briefs in `Roles/` | Pipeline journal rows, one per `run` invocation |
| 29 user-facing Skill Overviews + the skills themselves in `skills/` | `Status.md` and `Central Dashboard.md` rebuilt by `heal` |
| The `example-app` smoke-test bundle (phase + pipeline) | Cross-project `consolidate` diffs in `08 - System/Proposals/` |
| `bin/onyx`, `scripts/setup.sh`, `hooks/pre-commit`, `tools/heal-scan.sh`, `tools/sanitise-vault.sh` | Promotion Queue rows, Risk Budget files, ADRs — all written by you / by Claude as work demands them |

The clone gives you the *contract* and the *effectors*. Claude (or any capable agent that reads the contract) supplies the *behaviour*.

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
