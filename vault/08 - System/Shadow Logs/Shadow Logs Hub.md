---
title: Shadow Logs Hub
tags:
  - hub
  - hub-subdomain
  - system
  - shadow-mode
  - onyx
type: hub
version: 1.0
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/Operations/Operations Hub.md|Operations Hub]] · [[08 - System/Operations/_shadow.md|_shadow (meta-directive)]]

# Shadow Logs Hub

> One markdown file per operation in shadow mode. Each file is an append-only ledger of shadow runs — one row per run, recording date, run ID, target phase, verdict (GREEN / RED), and a link to the full diff. After 7 consecutive GREEN runs across distinct phases, the operation graduates from `status: draft` to `status: active` and its TS source is deleted.

The runs themselves are produced by `tools/shadow-run.sh`. See [[08 - System/Operations/_shadow.md|_shadow]] for the full protocol and graduation criteria.

---

## Operation logs

| Operation | Status | Log | Notes |
|---|---|---|---|
| atomise | draft | [[08 - System/Shadow Logs/atomise.md\|atomise]] | created on first run |
| execute-phase | draft | [[08 - System/Shadow Logs/execute.md\|execute]] | hot path — strictest comparison |
| consolidate | active | n/a | already graduated 2026-04-27 |
| decompose-project | draft | [[08 - System/Shadow Logs/decompose.md\|decompose]] | |
| heal | draft | [[08 - System/Shadow Logs/heal.md\|heal]] | |
| replan | draft | [[08 - System/Shadow Logs/replan.md\|replan]] | |
| route | draft | [[08 - System/Shadow Logs/route.md\|route]] | smallest — fastest to graduate |
| surface-blocker | draft | [[08 - System/Shadow Logs/surface-blocker.md\|surface-blocker]] | |

Logs are created on first shadow-run for that operation. Until then the wikilink resolves to nothing — that's expected.

---

## How to run a shadow comparison

```bash
tools/shadow-run.sh <operation> "<phase-path>"
```

Example:

```bash
tools/shadow-run.sh atomise "01 - Projects/Demo/Phases/P1 - Setup.md"
```

The script:

1. Snapshots pre-state.
2. Runs the TS path (e.g. `onyx atomise "Demo" 1`).
3. Snapshots TS-end.
4. Restores pre-state.
5. Prompts you to run the directive in a fresh agent (Claude / Cursor / etc.).
6. Snapshots directive-end after you confirm completion.
7. Diffs TS-end vs directive-end and classifies per `_shadow.md` rules.
8. Appends a row to this directory's `<operation>.md`.

---

## Reading the verdicts

- **GREEN** — TS and directive produced semantically equivalent results. Diffs were limited to timestamps, run-IDs, and log message wording. Counts toward graduation.
- **RED** — fatal divergence. Different `status:`, different ticked checkboxes, different acceptance verdict, missing/extra files, etc. Resets the graduation streak. The directive author fixes the procedure (or, rarely, argues the TS path is wrong) and re-runs.
- **YELLOW** (only shown in the diff output, not as a top-level verdict) — non-fatal divergences worth a glance. The operator decides whether the run still counts as GREEN.

---

## Graduation

When a single operation's log shows 7 consecutive GREEN runs across distinct phases (and ideally across multiple profiles the operation supports), the directive author:

1. Bumps the directive's frontmatter: `status: draft → active`, `version:` increment.
2. Deletes the `replaces:` TS source(s) listed in the directive's frontmatter.
3. Updates [[08 - System/Operations/Operations Hub.md|Operations Hub]] to drop the `(draft)` annotation.
4. Adds a deletion-note row in [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] under the relevant stage.

The shadow log is preserved as the audit trail.

---

## Why this is its own hub

Shadow logs are not phase notes (no lifecycle), not knowledge (no compounding), not principles (no normative content). They're an audit ledger that gates a one-way structural change to the codebase. They earn their own hub so the graduation evidence is findable in five seconds.
