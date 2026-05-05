---
title: explain
tags:
  - system
  - operation
  - onyx
type: operation-directive
version: 1.0
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: explain

> Read vault state for a project (or all projects) and print a plain-English summary: what it is, what's happening now, what's queued, what's blocked, what the agent knows. **Pure read, no LLM, no writes.** This is the `onyx status` for humans — designed to answer "what's going on with X?" in five seconds.

## Preconditions
- A vault exists at `vault_root` with at least one phase note somewhere.

## Invocation context
- Operator: `onyx explain` (all projects) or `onyx explain <project-name-or-substring>`.
- Agent-driven: invoked when surfacing a project's state to a user before doing work.

## Read order
1. All phase notes under `projects_glob`.
2. For each project: its Overview, Knowledge, and (if profile is experimenter) Experiment Log + Cognition Store.
3. The project's `Directives/` folder if present (to resolve directive labels).

## Procedure

### Step 1 — Discover phases

Glob `<vault_root>/<projects_glob>/Phases/*.md` (or wherever phases live per the bundle structure). For each, read frontmatter only — body content isn't needed for most of the summary.

Group by `project_id` (fall back to `project` if `project_id` is missing).

### Step 2 — Filter to requested project (if any)

If the operator passed a `<project-name-or-substring>` argument:
- Match case-insensitively against each project_id.
- If no match, list available project IDs and exit.
- If multiple match, summarise all of them (one block per project).

If no argument, summarise every project.

### Step 3 — For each project, compose the summary

The output format is human-readable terminal text. Keep it tight — humans skim this output at a glance.

```
━━━ <project_id>
  Profile:  <profile>  (repo: <repo_path if engineering>)
  Phases:   <N active>, <N ready>, <N planning>, <N backlog>, <N blocked>, <N completed>

  [if experimenter:]
  Hypothesis: <hypothesis from Overview>
  Metric:     <success_metric>  (baseline: <baseline_value>)

  [if any active phases:]
  ▶ ACTIVE  P<N> — <phase_name> [<cycle_type>]  (since <YYYY-MM-DD from locked_at>)
    Directive: <resolved directive label>
    Acceptance:
      - [ ] first 4 acceptance items as bullets

  [if no active phases:]
  ▶ No phase currently active.

  [if any ready phases:]
  Queued (phase-ready, will run next):
    P<N> — <phase_name> [<cycle>] priority:<P>  → <directive>
    (cap at 3; "… and N more" if more)

  [if any blocked phases:]
  ⚠ Blocked:
    P<N> — <phase_name>  (run: onyx reset --project "<project>")

  [if Knowledge.md exists with > 0 ## sections:]
  Knowledge: <N> topic(s), last updated <YYYY-MM-DD from mtime>

  [if profile is experimenter:]
  Experiment Log: <N> trial(s)         (count "## Trial T<n>" headings)
  Open hypotheses in Cognition Store: <N>  (count numbered list items "<n>.")

  [run hint:]
  [if active or ready exist:]
  Run: onyx run --project "<project>"
  [elif backlog exists but none ready:]
  All ready phases done. Set a backlog phase to phase-ready, then: onyx run --project "<project>"
  [else (all completed):]
  Project complete.
```

### Step 4 — Resolve a phase's directive label

The directive resolver returns a short human label (no path) for use in the summary:

1. If phase frontmatter has explicit `directive:`, use that string.
2. If phase frontmatter has `cycle_type:`, map to experimenter directive:
   - `learn` or `design` → `experimenter-researcher (auto)`
   - `experiment` → `experimenter-engineer (auto)`
   - `analyze` → `experimenter-analyzer (auto)`
3. If the bundle has a `Directives/` folder:
   - One `.md` file → `<file-basename> (bundle)`
   - More than one → `N directives in bundle`
4. Otherwise → empty string.

### Step 5 — Phase state derivation

A phase's state is derived from its frontmatter (per Master Directive §5):
- `status:` field is canonical when set (`backlog`, `planning`, `ready`, `active`, `blocked`, `completed`).
- Fall back to `state:` field if `status:` is absent.
- If both are absent but `tags:` contain `phase-active` / `phase-ready` / etc., infer from the tag.

### Step 6 — Section extraction

For Acceptance Criteria of an active phase:
- Match `## Acceptance Criteria` (with optional `✅` prefix) heading.
- Take the body up to the next `##` heading.
- Filter to lines starting with `-` (bullet items).
- Take first 4.

## Post-conditions & transitions
- Nothing written. No state mutation. Pure read.
- Stdout has the formatted summary.

## Error handling
- **RECOVERABLE:** missing Knowledge.md / Cognition Store / Experiment Log → omit those fields from the summary.
- **RECOVERABLE:** a phase has malformed frontmatter → treat its state as `unknown` and include it in counts.
- **NEVER BLOCKING.** This is read-only; partial data still produces a useful summary.

## Skills invoked
None — pure vault read.

## Tools invoked
None.

## Native primitives relied on
- **Glob** — discover phase files.
- **Read** — every phase's frontmatter; project Overviews, Knowledge files, Cognition Store, Experiment Log.
- **Bash** (optional) — `stat -c %y` for Knowledge mtime if needed; otherwise read frontmatter `updated:` field.

## Acceptance (self-check before exit)
- For every project encountered, the output has at minimum: header line, profile line, phase counts.
- No file in the vault was modified.
- No external API was called.

## Forbidden patterns
- **Never write to the vault.** This op is read-only.
- **Never call an LLM.** No "summarise this in better English" — the format is mechanical.
- **Never block.** A missing Overview, missing Knowledge, missing Experiment Log are all expected; emit what's there.
