# Getting Started with ONYX v2

> Vault-native AI runtime. Six verbs. Setup is one config file and a `claude` invocation.

---

## What you're setting up

ONYX v2 is not a CLI you build or a service you deploy. It is a **runtime contract** (`08 - System/ONYX v2 Runtime.md`) that Claude Code reads at the start of each session, plus a **vault convention** for laying out projects. Claude executes verbs against the vault. State lives in markdown frontmatter. The vault remembers; sessions are disposable.

If you haven't already, read the [README](./README.md) for the two-minute mental model.

---

## Prerequisites

| Requirement | Install |
|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code`, then `claude login` |
| Obsidian | <https://obsidian.md> |
| Git | any recent version |

No Node build step. No framework-level API keys — each external skill manages its own credentials in its own `.env`.

---

## Step 1 — Clone

```bash
git clone https://github.com/jamalahmed2001/onyx.git
cd onyx
```

## Step 2 — Pick a vault

You have three options:

**Option A — use the bundled starter.** The `./vault/` directory in this repo is a clean v2 vault: runtime contract, templates, roles, skill overviews, and a smoke-test `example-app` bundle. Open it directly in Obsidian to start clicking around immediately. Recommended for first-time installs.

**Option B — use your existing Obsidian vault.** Point `onyx.config.json` at it. The first `new <project>` will scaffold the bundle. You'll need to copy `08 - System/` from the bundled starter on your first run, or symlink to it.

**Option C — start fresh.** Make an empty directory, open it as a vault in Obsidian, copy `./vault/08 - System/` into it, and point `onyx.config.json` at it.

## Step 3 — Configure

```bash
cp .env.example .env             # fill in keys you actually need
```

Edit `onyx.config.json`:

```json
{
  "vault_root": "/absolute/path/to/your/vault",
  "agent_driver": "claude-code",
  "projects_glob": "01 - Projects/**",
  "stale_lock_threshold_ms": 1800000
}
```

`stale_lock_threshold_ms` should match the v2 rule (30 minutes = `1800000`).

## Step 4 — Install the pre-commit hook (optional but recommended)

```bash
git config core.hooksPath hooks
```

`hooks/pre-commit` blocks commits containing GitHub PATs, OpenAI keys, Anthropic keys, Linear tokens, and AWS access keys.

## Step 5 — Open Claude Code in the vault

```bash
cd /absolute/path/to/your/vault
claude
```

Your vault's `CLAUDE.md` loads automatically. If you haven't written one yet, the minimum content is:

```markdown
You are operating under ONYX v2. Read `08 - System/ONYX v2 Runtime.md` once per session.

Vault root: /absolute/path/to/your/vault
```

Claude will read the runtime contract, then run cold-start: it looks for an active project, reads its `Overview` / `Status` / active phase / newest log, and tells you what's resumable.

---

## Step 6 — Your first project

Tell Claude:

```
new my-app --kind engineering --repo ~/code/my-app
```

This scaffolds the bundle from `08 - System/Templates/`:

```
01 - Projects/my-app/
├── my-app - Overview.md       ← identity, requires, verify defaults
├── my-app - Status.md          ← derived view of active work
├── my-app - Knowledge.md       ← append-only learnings
├── my-app - Decisions.md       ← append-only ADRs
├── phases/
│   └── my-app - P01 - Bootstrap.md
├── pipelines/
├── logs/
├── artifacts/
└── repo  →  /Users/you/code/my-app
```

Open `my-app - P01 - Bootstrap.md`. The phase frontmatter looks like:

```yaml
---
status: backlog
project: my-app
phase: P01
title: Bootstrap
touches:
  - README.md
  - package.json
verify:
  - kind: shell
    step: npm test
---
```

The body has `## Steps` (your task checklist), `## Progress` (the agent writes here), and `## Human Requirements` (blockers surface here).

Edit `## Steps` to describe the first thing you want done. Concretely: a checklist of three to ten small, verifiable items.

## Step 7 — Execute

```
execute my-app
```

The agent:

1. Acquires a lock on the phase (`lock: <agent>:<session-uuid>:<iso>`, sets `status: active`).
2. Opens a session log (`logs/my-app - <iso> - <summary>.md`).
3. For each unchecked `## Steps` item: runs the step, ticks the box, appends to the log, overwrites `## Progress`, refreshes the lock.
4. Runs every `verify.step`. Green → appends to `Knowledge.md`, closes the log (`outcome: done`), sets `status: done`, rebuilds `Status.md`. Red → writes to `## Human Requirements`, sets `status: blocked`.

Every turn is a pause point. If the session dies mid-phase (rate limit, terminal close, model swap), the next session resumes from `## Progress` cleanly. Locks older than 30 minutes are freed automatically by `heal`.

---

## Step 8 — Run a pipeline

Pipelines are for repeatable work. Create `pipelines/my-app - daily-report.md`:

```yaml
---
project: my-app
pipeline: daily-report
inputs:
  - kind: shell
    cmd: gh issue list --state open --json number,title
stages:
  - kind: agent
    role: summariser
    prompt: "Summarise open issues into a one-page status."
  - kind: shell
    cmd: ./scripts/post-to-slack.sh
verify:
  steps:
    - kind: shell
      step: test -f artifacts/daily-report-$(date +%F).md
gates: {}
schedule: "0 8 * * *"
---

## Journal

(rows appended by `run`)
```

Then:

```
run my-app daily-report
```

The agent reads the pipeline, executes the stages, writes a journal row with `outcome: success|failed`, attaches the artifact path. Two invocations can run in parallel as long as their outputs don't overlap.

---

## The six verbs in practice

```
new <project> [--kind X] [--repo path]      ← scaffold a bundle
execute <project> [phase]                    ← run a phase
run <project> <pipeline> [--input X]         ← run a pipeline
heal                                          ← rebuild Status + Dashboard, free stale locks
compact <project>[/<file>]                   ← human-triggered: archive + rewrite append-only file
consolidate                                   ← emit cross-project wisdom diff for review
```

You will use `execute`, `run`, and `heal` daily. `new` once per project. `compact` when an append-only file gets noisy. `consolidate` when the same lesson appears in three projects.

---

## Common situations

**The phase looks stuck.** Run `heal` — it'll free any lock older than 30 minutes and surface drift. Then `execute` again.

**The agent says `status: blocked`.** Read `## Human Requirements` in the phase. Resolve whatever it lists (missing secret, decision needed, external dependency). Edit `status: blocked` → `status: active` and re-run `execute`.

**`Progress` says `Updated:` 3 days ago.** Treat it as a cold-start, not a resume. The agent will re-read everything before continuing — this is the **Stale-Progress rule** in §A of the runtime contract.

**You want a daily cron.** Add to your crontab:

```
0 6 * * *   cd /path/to/vault && claude -p "heal" --add-dir .
```

`heal` is idempotent and safe to run repeatedly.

**You want to retire a project.** Set `status: done` in `Overview.md`. Run `heal` so it drops off the Central Dashboard. The bundle stays in `01 - Projects/` as a record.

---

## What to read next

- [README](./README.md) — full mental model
- [PIPELINES.md](./PIPELINES.md) — pipeline patterns and starter shapes
- `08 - System/ONYX v2 Runtime.md` in your vault — the runtime contract itself (≤ 150 lines, stand-alone)

---

*Vault is state. Verbs are how you drive it. Six is enough.*
