# Install

> Clone-to-working in five steps. Each step is independent and idempotent — re-run any of them safely.

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node ≥ 18** | builds `skills/*` TypeScript skills | <https://nodejs.org> |
| **Claude Code** | the runtime executor | `npm i -g @anthropic-ai/claude-code && claude login` |
| **Obsidian** | view/edit the vault as a graph | <https://obsidian.md> (optional but recommended) |
| **Git** | clone the repo, run the pre-commit hook | any recent version |

No global Python required. No Docker. No database server.

---

## Step 1 — Clone

```bash
git clone https://github.com/jamalahmed2001/onyx.git
cd onyx
```

## Step 2 — Run the installer

```bash
scripts/setup.sh
```

This is idempotent. It:

1. Activates `hooks/pre-commit` (blocks accidental secret commits).
2. Copies `.env.example` → `.env` if missing (you fill in keys yourself).
3. Runs `npm install` at the top level.
4. For every skill in `skills/*/` with a `package.json`: runs `npm install` and `npm run build`.
5. Makes `bin/onyx` and `tools/*.sh` executable.

Re-run any time. If a single skill fails to build, the script reports it and continues — fix the offender and re-run.

```bash
scripts/setup.sh --skip-build    # install deps only (faster for first probing)
scripts/setup.sh --hooks-only    # just wire the pre-commit hook
```

## Step 3 — Fill in `.env`

Open `.env` and add only the keys you actually need:

| Var | Needed when |
|---|---|
| `ONYX_VAULT_ROOT` | Always — absolute path to your vault. Defaults to `./vault` (the bundled starter). |
| `OPENROUTER_API_KEY` | Any skill that calls an LLM directly (most don't — Claude Code handles its own auth). |
| `LINEAR_API_KEY` + `LINEAR_TEAM_ID` | Using the `linear` skill for import/sync. |
| `ELEVENLABS_API_KEY` | Using `elevenlabs-tts`. |
| `GROQ_API_KEY` | Using `whisper-groq` for transcription. |
| `SUNO_API_KEY` | Using `suno`/`suno-generate`. |

Per-skill credentials can also live in `~/clawd/skills/<name>/.env` — see each skill's `SKILL.md`.

## Step 4 — Pick a vault and point at it

The fastest path: use the bundled `./vault/`. It's a clean v2 starter with the runtime contract, all 12 templates, 24 role briefs, 22 skill overviews, a Central Dashboard, and an `example-app` smoke-test bundle.

Edit `onyx.config.json`:

```json
{
  "vault_root": "/absolute/path/to/your/onyx/vault",
  "agent_driver": "claude-code",
  "projects_glob": "01 - Projects/**",
  "stale_lock_threshold_ms": 1800000
}
```

If you want to graft ONYX onto your existing Obsidian vault, copy `vault/08 - System/` and `vault/00 - Dashboard/` into it, then point `vault_root` at your vault. The `01 - Projects/` folder is where your bundles will live.

## Step 5 — Verify with the smoke test

```bash
cd /absolute/path/to/your/vault
claude
```

Tell Claude:

```
execute example-app
```

Claude reads `08 - System/ONYX v2 Runtime.md`, runs the §A cold start (reads Overview, Status, the active phase, the newest log), then enters the §B phase hot loop on `P01 - Hello World`. It:

1. Acquires a lock on the phase
2. Opens a session log
3. Ticks each step in `## Steps`, refreshing `## Progress` after each one
4. Writes `artifacts/hello.txt`
5. Appends a line to `example-app - Knowledge.md`
6. Runs the `verify.steps` (two `shell:` checks)
7. Closes the log with `outcome: done`, sets `status: done`

If that loop completes cleanly, your install is correct. Delete the bundle:

```
new my-real-project --kind engineering --repo ~/code/my-real-project
```

— and you're off.

---

## Optional — the dashboard

`dashboard/` is an optional Next.js read-only view of the vault. It is not required for the runtime to work; Claude reads the vault directly. To run it:

```bash
cd dashboard
npm install
npm run dev
```

Then open <http://localhost:3000>. The dashboard surfaces the Central Dashboard, project bundles, and pipeline journals as a graph + tables. Useful when you want a web view alongside Obsidian.

---

## Troubleshooting

**`scripts/setup.sh` says a skill failed to build.**
Run the failing skill's build directly to see the real error:
```bash
cd skills/<failed-skill> && npm install && npm run build
```
Most failures are `node_modules` mismatch — delete `node_modules` and `package-lock.json`, then re-run.

**Claude says `08 - System/ONYX v2 Runtime.md` is missing.**
You're pointed at the wrong vault. Check `onyx.config.json` → `vault_root` and confirm that path contains `08 - System/`.

**`execute example-app` says the phase is already locked.**
Lock TTL is 30 minutes. Run `heal` to free stale locks, then re-try. If you're sure no other agent is on it, edit the phase frontmatter and remove the `lock:` line.

**The pre-commit hook blocks a commit you know is clean.**
Inspect what it caught (`hooks/pre-commit` prints the matched line). If it's a false positive — e.g. a placeholder secret in an example — escape the pattern in the source file (split the literal or use a clearly-fake value like `sk-EXAMPLE`).

**Skills that need a real API key fail with `Missing X_API_KEY`.**
They're meant to. Skills don't ship with credentials. Add the key to `.env` or to the skill's own `.env`, then re-run.

---

## What got installed

After `scripts/setup.sh` succeeds:

```
onyx/
├── .env                       ← your local secrets (gitignored)
├── bin/onyx                   ← v2 verb dispatcher
├── skills/*/            ← every skill: deps installed, built into dist/
├── hooks/pre-commit           ← wired as core.hooksPath
├── tools/                     ← heal-scan, sanitise-vault, executable
└── vault/                     ← v2 starter — runtime contract + templates + example-app
```

You can now `bin/onyx <verb> ...` from anywhere in the repo, or run Claude directly inside your vault and use natural language ("execute example-app", "heal", "new my-app --kind engineering").
