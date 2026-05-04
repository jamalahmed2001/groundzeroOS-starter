# Getting Started with ONYX

> The vault-native AI runtime. Your Obsidian vault is the OS. Claude Code is the executor. Setup takes 10 minutes.

---

## What you're setting up

ONYX is not a CLI or a SaaS. It is a **vault convention + a runtime directive**. Claude Code reads your vault, follows the Master Directive, and executes phases as markdown operations. State lives in frontmatter. Knowledge compounds. Sessions are disposable — the vault remembers everything.

---

## Prerequisites

| Requirement | Install |
|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code`, then `claude login` |
| Obsidian | https://obsidian.md |

That's it. No Node build step. No API keys at the framework level — each external skill manages its own credentials.

---

## Step 1 — Clone and open the vault

```bash
git clone https://github.com/jamalahmed2001/onyx
```

Open `./vault/` as an Obsidian vault. This is your starter vault — it ships with the Master Directive, example project, templates, directives, profiles, conventions, and skill overviews.

---

## Step 2 — Configure

Copy the example config and set your vault path:

```bash
cp onyx.config.json.example onyx.config.json
```

Edit `onyx.config.json`:

```json
{
  "vault_root": "/absolute/path/to/your/vault",
  "projects_glob": "01 - Projects/**",
  "stale_lock_threshold_ms": 300000
}
```

If you're using the bundled starter vault, set `vault_root` to the absolute path of `./vault/`.

---

## Step 3 — Open Claude Code in the vault directory

```bash
cd /absolute/path/to/your/vault
claude
```

`CLAUDE.md` loads automatically on session start. Claude reads it and announces the current active work. You're now talking to the ONYX runtime.

---

## Step 4 — Create your first project

Tell Claude:

```
New project: My App, engineering
```

Claude creates a full project bundle in your vault:

```
01 - Projects/My App/
├── My App - Overview.md       ← source of truth for direction
├── My App - Knowledge.md      ← learnings compound here
├── Phases/
│   └── My App - P1 - Bootstrap.md
└── Logs/
```

Open `My App - Overview.md` in Obsidian. Fill in `## Scope`, `## Goals`, and any `## Agent Constraints`.

---

## Step 5 — Plan

```
Plan My App
```

Claude reads the Overview and decomposes it into phases, then atomises each phase into tasks with files, steps, and definition of done. Each phase note appears under `Phases/` with `status: ready` once atomised.

Review the phase notes in Obsidian. Edit any tasks that look wrong — the agent treats them as the contract.

---

## Step 6 — Execute

```
Execute next
```

Claude locks the highest-priority ready phase, runs the task loop, verifies acceptance criteria, consolidates learnings into `Knowledge.md`, and marks the phase complete.

Watch the phase note update in real time in Obsidian — checkboxes tick, log entries appear, frontmatter transitions.

---

## Step 7 — Iterate

After each phase, Claude automatically moves on or surfaces blockers:

| Outcome | What happens |
|---|---|
| Phase completed | Learnings → `Knowledge.md`, next phase picked up |
| Phase blocked | `## Human Requirements` written, status → `blocked`, Claude stops and tells you what's needed |

For blocked phases: resolve the requirement in Obsidian, then say `Execute My App P2` to resume.

---

## Everyday operations

| Say | What happens |
|---|---|
| `"Status"` | Active/ready/blocked queue across all projects |
| `"Execute next"` | Run the highest-priority ready phase |
| `"Execute My App P3"` | Run a specific phase |
| `"Plan My App"` | Decompose Overview + atomise phases |
| `"Heal vault"` | Fix stale locks, frontmatter drift, broken links |
| `"Doctor"` | Full audit report — read-only, no fixes |
| `"Review My App P3"` | Extract learnings → Knowledge.md |
| `"New project: X, engineering"` | Create new project bundle |

---

## When scope changes

Edit `Overview.md` first. Then:

```
Plan My App
```

Claude reads the updated Overview + existing phases + Knowledge.md and proposes new phases aligned with the new direction.

---

## When a phase blocks

Claude writes the blocker under `## Human Requirements` in the phase note and sets `status: blocked`.

1. Open the phase note in Obsidian
2. Read `## Human Requirements`
3. Resolve it (add info to Overview, fix environment, etc.)
4. Tell Claude: `"Execute My App P<n>"`

---

## Running unattended (cron)

```bash
# Daily heal
0 5 * * * claude -p "Heal vault" --add-dir /path/to/vault >> /var/log/onyx-heal.log 2>&1

# Execute next phase
*/30 * * * * claude -p "Execute next" --add-dir /path/to/vault >> /var/log/onyx-run.log 2>&1
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing to execute | No `ready` phases. Tell Claude `"Plan My Project"` |
| Phase stuck `active` | `"Heal vault"` — clears stale locks |
| Agent repeated a mistake | Edit the task in Obsidian to be more specific, tell Claude `"Execute My App P<n>"` |
| Knowledge.md not updating | Consolidation runs on phase completion — ask Claude `"Review My App P<n>"` |
| Vault looks wrong | `"Doctor"` — full read-only audit report |

---

## Next steps

Open `./vault/` in Obsidian and read:

- `08 - System/ONYX Master Directive.md` — the runtime spec; everything flows from here
- `08 - System/Agent Context/CLAUDE.md` — the session bootstrap Claude reads on every start
- `00 - Dashboard/What is ONYX.md` — mental model and use cases
- [`PIPELINES.md`](./PIPELINES.md) — ready-to-fork pipeline starters

---

**Vault is state. Master Directive is program. Skills are effectors. Phases are work units. Claude is the runtime.**
