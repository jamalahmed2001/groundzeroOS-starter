---
tags: [system, guide, setup, onyx]
created: 2026-04-13
updated: 2026-04-16
type: guide
---

## Navigation

**HUB:** [[Dashboard|Dashboard]] | **WHAT:** [[What is ONYX|What is ONYX]] | **RULES:** [[AGENTS|Agent Operating Rules]]

# Getting Started

> First project in ten minutes. No prior context required.

---

## Before you start

You need:
- Node 18+ and npm 8+
- An Obsidian vault (or use the bundled one at `./vault/`)
- An OpenRouter API key from https://openrouter.ai
- Claude Code installed (`npm install -g @anthropic-ai/claude-code` then `claude login`)

---

## 1 — Install

```bash
git clone https://github.com/jamalahmed2001/onyx
cd onyx
npm install
```

`npm install` runs `postinstall` which builds TypeScript automatically.

---

## 2 — Configure

```bash
cp .env.example .env
```

Edit `.env` and set:
- `ONYX_VAULT_ROOT` — absolute path to your Obsidian vault
- `OPENROUTER_API_KEY` — your key

Also edit `onyx.config.json` to match:
```json
{ "vault_root": "/absolute/path/to/vault" }
```

---

## 3 — Verify

```bash
onyx doctor
```

Green checkmark for each dependency. If anything is red, it prints the exact fix command. Fix before continuing.

---

## 4 — Create a project

```bash
onyx init "My First Project"
```

Interactive prompt: enter the repo path. ONYX scans `package.json`, `README`, and directory structure to auto-detect stack. It creates a full bundle in your vault:

```
{Area}/My First Project/
├── My First Project - Overview.md
├── My First Project - Knowledge.md
├── My First Project - Kanban.md
├── My First Project - Agent Log Hub.md
├── My First Project - Repo Context.md
├── Phases/
└── Logs/
```

---

## 5 — Review the Overview

Open Obsidian and find `My First Project - Overview.md`. This is the **source of truth** for project scope.

Verify the auto-detected fields. Add any decisions or constraints agents should know. Update `## Scope` and `## Goals` sections with what you want to build.

---

## 6 — Generate phases

```bash
onyx plan "My First Project"
```

ONYX reads your Overview and decomposes it into 4-8 phase stubs. Each phase appears under `Phases/` with frontmatter and a `phase-backlog` tag.

Run the command again to atomise each backlog phase into tasks with files, steps, validation, and definition of done.

---

## 7 — Review tasks in Obsidian

Open each phase note. Under `## Tasks` you'll see atomic checkboxes the agent will execute. Edit anything that looks wrong *before* running.

When a phase looks ready, change its tag from `phase-backlog` to `phase-ready` in the frontmatter.

---

## 8 — Execute

```bash
onyx run
```

ONYX loops over all `phase-ready` phases, acquires locks, spawns agents, runs the task loop, verifies acceptance, consolidates learnings, and moves to the next phase.

Watch the log note (`Logs/L{n} - ...`) fill up in real time in Obsidian.

---

## 9 — Follow along

| During execution | Obsidian shows |
|---|---|
| Lock acquired | `locked_by` + `locked_at` appear in phase frontmatter; tag flips to `phase-active` |
| Task started | New timestamped entry in log note |
| Task completed | Checkbox ticks in phase note |
| Acceptance passed | All acceptance checkboxes tick, tag flips to `phase-completed` |
| Learnings extracted | New entries in `Knowledge.md` under `## Learnings`, `## Decisions`, `## Gotchas` |

---

## 10 — When a phase blocks

Agent writes the blocker under `## Human Requirements` and sets tag to `phase-blocked`.

**You decide:**
- Read the blocker
- Resolve it (add info, update Overview, fix environment)
- Change tag back to `phase-ready`
- Run `onyx run` again

The replanner gets 2 auto-retries before blocking.

---

## Everyday commands

| Task | Command |
|---|---|
| Run autonomous loop | `onyx run` |
| Single pass then exit (cron) | `onyx run --once` |
| Scope to one project | `onyx run --project "My First Project"` |
| Dry run (preview, no writes) | `onyx run --dry-run` |
| Current state | `onyx status` |
| Fix vault drift | `onyx heal` |
| Show execution logs | `onyx logs --recent` |
| Reset a blocked phase | `onyx reset "My Project"` |

---

## When scope changes

Update `Overview.md` first. Then:

```bash
onyx plan "My First Project" --extend
```

ONYX reads the updated Overview + existing phases + Knowledge.md, and proposes 2-4 new phases that continue from reality.

---

## Running unattended

Cron (every 30 min, one phase at a time):
```bash
*/30 * * * * cd ~/clawd/onyx && onyx run --once >> /var/log/onyx.log 2>&1
```

Or a persistent loop:
```bash
onyx run
```

---

## If something breaks

| Symptom | Fix |
|---|---|
| Phase stuck as `phase-active` | `onyx heal` (auto-clears locks older than 5 min) |
| Agent failed 3x on a task | Edit the task to be more specific, `onyx reset <n>`, rerun |
| Atomiser wrote bad tasks | Improve Overview Summary/Scope, reset to backlog, rerun `onyx plan` |
| `onyx doctor` shows red | Follow the printed fix command |
| TypeScript build fails | `npm run build` and read errors |

---

## Next reading

- [[What is ONYX|What is ONYX]] — mental model + use cases
- [[08 - System/ONYX - Quick Start.md|Quick Start]] — core concepts and profiles in depth
- [[08 - System/ONYX - Reference.md|Complete Reference & Playbook]] — principles, internals, all commands
