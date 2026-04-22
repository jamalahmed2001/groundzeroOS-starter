---
name: housekeeping
description: Run local cleanup and maintenance scripts for backups, logs, disk usage, and connection hygiene in the ~/clawd workspace.
---

# Housekeeping & Cleanup Skill

This skill wraps the local maintenance scripts under `~/clawd/scripts/` so they can be treated as first‑class tools instead of random one‑offs.

## Scope

Use this skill when you want to:
- Clean up old backups and log files
- Inspect disk usage for the clawd workspace
- Run quick connection/cron sanity checks

It **only** operates inside `~/clawd` and does not modify system‑wide packages or services.

## Scripts

All commands are run from the workspace root:

```bash
cd ~/clawd
```

### 1. Cleanup Backups

Removes old backup artifacts (tarballs, dated backup folders) according to the policy encoded in the script.

Run:
```bash
cd ~/clawd && bash scripts/cleanup-backups.sh
```

Use when:
- `~/clawd/backups` is growing
- You’ve taken many temporary or dated backups

### 2. Cleanup Logs

Rotates or deletes old log files under `~/clawd` (cron logs, project health reports, etc.).

Run:
```bash
cd ~/clawd && bash scripts/cleanup-logs.sh
```

Use when:
- `*.log` files have grown large
- You want to tidy general clawd logs without touching system logs in `/var/log`

### 3. Analyze Disk Usage

Provides a human‑readable breakdown of disk usage within the clawd workspace.

Run:
```bash
cd ~/clawd && bash scripts/analyze-disk-usage.sh
```

Use when:
- You need to know which directories are consuming the most space
- Before deleting large folders or archives

### 4. Fix Duplicate Connections (Optional)

If you see issues related to duplicated OpenClaw gateway/node connections, use the helper:

Run:
```bash
cd ~/clawd && bash scripts/fix-duplicate-connections.sh
```

Only use when:
- You’re debugging repeated connection sessions or ghost processes specifically called out by other skills (e.g. `diagnose-gateway`).

### 5. Cron Path E2E Check (Optional)

End‑to‑end sanity check for cron wiring and PATH usage.

Run:
```bash
cd ~/clawd && bash scripts/run-cron-path-e2e.sh
```

Use when:
- Cron jobs behave differently from manual runs
- PATH / environment issues are suspected in scheduled tasks

### 6. Vault Health & Maintenance (ONYX)

Use the Starter healer/graph maintainer:

```bash
onyx heal
```

And for a read-only state snapshot:

```bash
onyx status --json
```

Use when:
- Project bundles have been renamed or moved
- Navigation/links are broken or missing
- Phases are stuck `phase-active`
- Weekly vault hygiene pass

See `skills/vault-health/SKILL.md` for the full reference.

### 7. Run logs cleanup (Starter)

ONYX writes logs inside each project bundle under `Logs/`.

If you have legacy `.onyx-runs/` folders from older runtimes, treat them as legacy artifacts and clean them manually only after confirming they’re not in use.

---

## Interaction Pattern

- Prefer **read‑only / diagnostic** scripts like `analyze-disk-usage.sh` and vault dry-run before destructive cleanups.
- For any cleanup that deletes files, this skill assumes you:
  - Keep important docs in Obsidian vaults and git repos
  - Treat `~/clawd/backups` and log files as ephemeral
  - Treat `.onyx-runs/` entries older than 30 days as safe to GC

When in doubt, run analyzers first and only then run cleanup scripts.
