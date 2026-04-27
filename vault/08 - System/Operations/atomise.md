---
title: atomise
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/planner/atomiser.ts
lines_replaced: 498
version: 0.2
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 4
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: atomise

> Turn a `backlog` phase into a ready-to-execute task plan grounded in the project's source context (repo tree for engineering/trading, bundle contents for other profiles).

## Preconditions
- Phase `status:` is `backlog`.
- Phase file exists, is readable, has parseable frontmatter.
- Project bundle exists: phase's grandparent directory contains an `*Overview*.md`.
- For `engineering` / `trading` profiles: either `repo_path:` in Overview frontmatter points at an existing directory, OR `reposRoot` is configured and contains a directory fuzzy-matching the project name.
- For other profiles: bundle directory is readable.

## Invocation context
- Master Directive §6.1. Dispatched by [[08 - System/Operations/route.md|route]] when phase status is `backlog`.
- Also called explicitly via `onyx atomise <project> <n>` (after migration, a directive loader).

## Read order
1. Phase file — full content including existing `## Summary`, `## Acceptance Criteria`, `## Tasks` skeleton if any.
2. Project Overview.md — extract `profile:` from frontmatter (determines code vs. non-code path), plus `repo_path:`, `## Scope` / `## Goals` / `## Description` / `## Overview` body section, `## Agent Constraints` body section.
3. Profile file from `08 - System/Profiles/<profile>.md` — for declared `allowed_shell:`, acceptance-gate patterns, required phase fields.
4. Sibling phases: files under `<bundle>/Phases/*.md` matching `P\d+` or `O\d+`, up to 15. Read only frontmatter + phase_name — enough to avoid duplicating their work.
5. For code profiles only: [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] on `repo_path` — top-level file tree capped at ~150 files, respecting profile exclusions.
6. For non-code profiles: `ls` + short reads of top-level bundle contents (Source Context, Research Brief, Strategy Context, prior artifacts).

## Procedure

### Step 1 — Preflight
1. Read phase frontmatter. Extract `phase_number`, `phase_name`, and `project_id` (fallback: bundle folder name).
2. Locate bundle dir (parent of phase's parent: `dirname(dirname(phase.path))`).
3. Read Overview frontmatter; extract `profile:`. Default to `engineering` if missing.
4. Determine `is_code_profile` = `profile ∈ {engineering, trading}`.
5. If code profile: resolve `repo_path` via §Repo resolution below. If unresolvable and profile expects a repo → transition `backlog → planning → backlog`, append to log: `atomise_failed: repo unresolvable`. Exit with `failed`.

### Step 2 — Transition to planning
Only after Step 1 passes (to avoid planning→backlog bounces on trivial failures):
1. Write `status: planning` + `state: planning` + swap `phase-<prev>` tag for `phase-planning` in `tags:`.
2. Append to phase log: `atomise_started run=<runId>`.
3. Dispatch notification: event `atomise_started`, project, phase.

### Step 3 — Gather context
Build the atomiser's context packet in order:

**A. Project scope** (from Overview body):
Extract the first of `## Scope`, `## Goals`, `## Description`, `## Overview` sections. Cap 800 chars.

**B. Agent constraints** (from Overview body):
Extract `## Agent Constraints` section if present. Cap 400 chars.

**C. Sibling summary:**
For each sibling phase in `<bundle>/Phases/` (up to 15, matching `P\d+` or `O\d+`):
```
P<N>: "<phase_name>" [<phase-tag-or-status>]
```
Cap the list so the full context packet stays under 4KB.

**D. Phase content:**
The full phase file body (Summary, Acceptance Criteria, any existing Tasks, Human Requirements, Progress).

**E. Source context (per profile):**
- Code profile: invoke [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] on `repo_path`. Use the result as "Repo file structure:" block.
- Non-code profile: bundle directory listing + read of Source Context / Research Brief docs if present.

### Step 4 — Generate the plan

Invoke [[08 - System/Agent Skills/_onyx-runtime/atomise-phase/atomise-phase.md|atomise-phase]] with:
- `phase_path`
- `project_id`, `phase_name`, `phase_number`
- `profile_name`, `is_code_profile`
- `repo_path` (code profile) or `bundle_path` (non-code)
- `context_packet` (A+B+C from Step 3)
- `phase_content` (D)
- `source_context` (E)

The skill performs:
- For code profiles, reads the repo (Read + Grep tool use) to ground tasks in real files.
- For non-code profiles, reads bundle context docs.
- Produces a `## Implementation Plan` section with 4–8 parent tasks, each having `**Files:**` / `**Output:**`, `**Steps:**`, `**Validation:**`, `**DoD:**`, plus `- [ ] [TN.M]` sub-tasks.
- Wraps the output in the managed markers `<!-- AGENT_WRITABLE_START:phase-plan -->` ... `<!-- AGENT_WRITABLE_END:phase-plan -->`.

### Step 5 — Inject into phase file

Take the returned plan block and place it in the phase file using this priority:
1. If the managed markers already exist → replace the content between them verbatim.
2. Else if `## Acceptance Criteria` exists → insert the plan block immediately before it.
3. Else if `## Tasks` exists → append the plan block after the `## Tasks` section ends.
4. Else → append at end of file.

Bump `updated:` frontmatter.

### Step 6 — Validate file path references (code profiles only)

For every `**Files:**` line in the plan block, extract the file paths. For each path not marked `(new)`, verify it exists via Read or Glob against `repo_path`. If any are missing:
- Insert an HTML comment block immediately after `<!-- AGENT_WRITABLE_END:phase-plan -->`:
  ```
  <!-- onyx: WARNING — These file paths were not found in the repo and may be hallucinated:
  - <path 1>
  - <path 2>
  Consider verifying before execution. -->
  ```
- Record in log: `atomise_done: plan_written with <N> unverified file path(s)`.

### Step 7 — Transition to ready
1. Write `status: ready` + `state: ready` + swap `phase-planning` tag for `phase-ready` in `tags:`.
2. Bump `updated:`.
3. Append to phase log: `atomise_done run=<runId>` (with any warnings noted).
4. Dispatch notification: event `atomise_done`, project, phase.

### Step 8 — Log
Call `tools/write-exec-log.sh`:
```
--status ATOMISE
--project <project_id>
--phase <phase_number>
--summary "tasks=<count> profile=<name>"
```

## Post-conditions & transitions
- Success: `backlog → planning → ready`.
- Failure: `backlog → planning → backlog` (retry possible).
- Phase `## Tasks` or managed plan block is non-empty.
- `updated:` bumped.
- ExecLog entry appended.

## Error handling
- **RECOVERABLE:** LLM timeout or transient tool failure during Step 4 (max 2 retries with exponential backoff). `repo_path` resolution failed first time but reposRoot changed (re-resolve once).
- **BLOCKING:** phase Summary or Acceptance Criteria too vague to decompose (skill returns `ambiguous_scope`). Write `## Human Requirements` describing specifically what's unclear, transition to `blocked`.
- **INTEGRITY:** phase file unreadable, frontmatter corrupt, or Overview missing. Halt with INTEGRITY error; do not auto-fix frontmatter here (heal's job).

## Repo resolution (code profiles only)

Priority for finding `repo_path`:
1. Overview.md frontmatter `repo_path:` field — if it exists AND the path exists on disk → use it.
2. Fuzzy fallback via `config.reposRoot`: list directories under `reposRoot`, normalise names (lowercase, spaces → hyphens, strip non-alphanumerics). Compare to normalised `project_id`. Scores: exact match = 100, substring match = 60. Best wins if ≥60.
3. If nothing matches → return empty; caller treats this as a BLOCKING condition.

## Skills invoked
- [[08 - System/Agent Skills/_onyx-runtime/atomise-phase/atomise-phase.md|atomise-phase]] — full procedure (the LLM-or-agent plan generation step).
- [[08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md|repo-scan]] — for code profiles in Step 3.E.

## Tools invoked
- `tools/write-exec-log.sh` — Step 8.

## Native primitives relied on
- **Read** — phase, Overview, profile, sibling frontmatter, Source Context docs.
- **Glob** — enumerate phase files, enumerate repo files via repo-scan.
- **Grep** — symbol-level grounding inside atomise-phase skill.
- **Edit** — inject plan block into phase file, update frontmatter.
- **Bash** — optional `git log` / `git ls-files` for engineering repo context (subject to profile `allowed_shell`).

## Acceptance (self-check before exit)
- `<!-- AGENT_WRITABLE_START:phase-plan -->` and end marker present in phase file.
- Task count in [4, 8] (relaxed to [6, 12] for large Overview projects).
- Every task has `**Files:**` or `**Output:**`, `**Steps:**`, `**Validation:**`, `**DoD:**`.
- Every task has at least one `- [ ] [TN.M]` sub-task.
- Phase `status:` frontmatter is `ready` (success) or `backlog` (failure).
- `updated:` current.

## ExecLog entry format
```
<ISO> | <project> | <phase> | ATOMISE | <duration-sec> | tasks=<count> profile=<name> warnings=<count>
```

## Shadow-mode comparison criteria
Given the same backlog phase + same repo state, compare TS and directive outputs:
- Task count should match within ±1.
- Every parent task in TS output has an equivalently-named parent in directive output (semantic match by verb + object).
- Every TS `**Files:**` reference appears in at least one directive task's `**Files:**`.
- Sub-task counts within ±20% per parent task.
- Validation commands should match exactly (both reference the same `package.json` scripts / Makefile targets).

Semantic equivalence — not byte-identity. The LLM's wording will differ; what matters is that the plan would produce the same code.
