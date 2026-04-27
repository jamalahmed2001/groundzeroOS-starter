---
title: phase-decompose
tags: [skill, onyx-runtime, planner]
type: skill
replaces: src/planner/phasePlanner.ts (LLM prompts + branches)
lines_replaced: 450
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: phase-decompose

> Turn a project Overview into N phase specs. Two branches (direct-agent write, LLM-output) same as atomise-phase. Shared by `decompose-project` (primary caller) and `replan` (when the replan is phase-sized, not task-sized).

## Purpose
The plan-generation core: take an Overview + repo context + profile, produce 4–8 implementation phases with names, summaries, acceptance criteria, dependency ordering.

## Inputs
- `project_id: string`
- `profile_name: string`
- `is_code_profile: bool`
- `repo_path: string | null` — code profiles
- `bundle_path: string`
- `overview_content: string` — full Overview body
- `knowledge_content: string` — Knowledge.md body, capped ~2KB
- `existing_phases_summary: string | null` — `extend` mode only; list of existing phases
- `source_context: string` — repo tree or bundle listing
- `start_number: int` — first phase number to assign
- `mode: "fresh" | "extend"`

## Outputs
One of:

**A — LLM-output branch:**
```json
{
  "branch": "llm",
  "specs": [
    {
      "number": 1,
      "name": "Short phase name",
      "summary": "2-3 sentences...",
      "context": "Key facts the agent must know...",
      "acceptance_criteria": ["...", "..."]
    }
  ]
}
```

**B — Direct-agent branch:**
```json
{
  "branch": "agent",
  "written_files": [
    "<bundle>/Phases/P1 - Name.md",
    "<bundle>/Phases/P2 - Name.md",
    ...
  ]
}
```

Plus: `warnings: string[]`.

## Branch selection

Same logic as [[atomise-phase]]:
- Branch A (direct-agent write) if the driver supports file-write tools AND the bundle/repo is accessible. Agent writes phase files directly.
- Branch B (LLM-output) otherwise. Skill returns JSON specs; caller materialises phase files.

Branch A is preferred — richer grounding from exploration. Branch B is the fallback.

## System prompts

### Code profile — direct-agent write mode

```
You are a senior technical architect decomposing a software project into
implementation phases.

You will be given:
- A project Overview
- The repo to explore
- A target directory to write phase notes into

Your task: decompose the project into 4-8 implementation phases and write
them as markdown files.

CRITICAL: Write the phase files directly to disk. Do NOT output JSON.
Use Write or Edit tools.

Phase note format for each file (P<n> - <name>.md):
[full phase template — see decompose-project.md Step 5 for the canonical format]

Also create a log stub at Logs/L<n> - <name>.md.

Rules:
- Phases ordered by dependency (earlier phases unblock later ones)
- Phase names: 3-6 words, action-oriented (e.g. "Ship authentication layer")
- depends_on: [] for P<start_number>, [<n-1>] for later phases
- Use ONLY file paths that exist in the repo for Context Pack references
- 2-4 acceptance criteria per phase, verifiable with commands (check package.json scripts)
```

### Code profile — LLM-output mode

```
You are a senior technical architect decomposing a software project into
implementation phases.

Rules:
- 4-8 phases maximum
- Each phase independently deliverable and testable
- Phases ordered by dependency
- Phase name: 3-6 words, action-oriented
- Use the repo file structure to ground phase boundaries
- 2-4 acceptance criteria per phase, measurable binary done conditions
  (e.g. "All existing tests pass", "GET /api/foo returns 200")

Output ONLY valid JSON — no prose, no markdown fences:

[
  {
    "number": 1,
    "name": "Short phase name",
    "summary": "2-3 sentences on what this phase builds and why it comes first",
    "context": "Key facts the agent must know: existing patterns, constraints, prior work",
    "acceptance_criteria": ["Measurable done condition", "..."]
  }
]

GROUNDING RULES:
- Phase boundaries must align with actual repo structure
- acceptance_criteria must be verifiable with commands available in the repo
- context field references specific files/patterns from the repo tree — not abstract descriptions
- If the overview mentions tech not visible in the repo, the FIRST phase must set them up
```

### Non-code profile templates

Same shape but substitute:
- "software project" → "<profile_name> project"
- "repo" → "bundle"
- "source files" → "context docs and artifacts"
- GROUNDING RULES softened to: "reference files that exist in the bundle OR explicitly mark as to-be-created"

## Algorithm

### Step 1 — Branch select
If driver supports Task/Agent tool + bundle is accessible → Branch A.
Else → Branch B.

### Step 2 — Build user prompt
```
Project: <project_id>
Profile: <profile_name>

Overview:
<overview_content>

Knowledge (prior learnings):
<knowledge_content OR "(none yet)">

<existing_phases_summary — only if mode=extend>

---

<source_context>

Generate <start_number>'th through Nth implementation phases.
```

### Step 3 — Branch A: invoke agent
Use Task/Agent tool. Prompt: phase-decompose system prompt (write-mode) + user prompt + target dir (`<bundle>/Phases/`) + log dir (`<bundle>/Logs/`).

Timeout: 300s.

After return, verify:
- N new phase files exist in target dir.
- Each has valid frontmatter with `phase_number` starting at `start_number`.
- Each has a matching log stub.

Return `{ branch: "agent", written_files: [...], warnings: [] }`.

If agent didn't write anything → fall through to Branch B.

### Step 4 — Branch B: LLM call
Call planning-tier LLM, `max_tokens: 4000`.

Parse output:
- Extract first `[...]` block (regex `\[[\s\S]*\]`).
- `JSON.parse`. If fails → try to salvage: if output has phase-shaped headings (`### P1`, `### P2`), parse them manually.
- If still fails → return `{ branch: "llm", specs: [], warnings: ["parse_failed"] }`.

Validate each spec:
- `number` is int, `start_number ≤ number ≤ start_number + 15`.
- `name` is non-empty string, ≤ 60 chars.
- `summary` non-empty string.
- `acceptance_criteria` is non-empty array of strings.

Return `{ branch: "llm", specs: validated, warnings: [] }`.

## Invariants

- `start_number` is respected — phases numbered from there, not 1 (enables extend mode).
- `depends_on` defaults to `[]` for the first phase (number = start_number) and `[n-1]` for the rest.
- Each phase acceptance criterion is verifiable — no "the system works" criteria.
- The skill never writes Overview; only creates new files under `<bundle>/Phases/` and `<bundle>/Logs/`.
- `updated:` bumped on every written file.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `ambiguous_scope` | Overview too vague; LLM returns empty or non-decomposable output | Return empty specs with warning; caller blocks the Overview with HR describing what's unclear. |
| `parse_failed` | JSON parse + salvage both fail | Return empty specs; caller writes warning to Overview log. |
| `agent_timeout` | Branch A agent exceeds 300s | Fall through to Branch B. |
| `invalid_spec` | LLM returned specs but some fail validation | Drop invalid ones; proceed with valid remainder; warning notes drops. |

## Examples

**Example 1 — fresh decomposition of an engineering project:**

Input:
- `project_id = "Clutr"`
- `profile_name = "engineering"`
- Overview goals: "Build a Redis-backed rate-limit layer for the public API. Support per-endpoint + per-user limits, auto-ramp after throttle events."
- Repo tree shows: existing Express server, no Redis client yet.
- `start_number = 1`

Branch A engaged. Agent writes:
- `Phases/P1 - Add Redis adapter.md`
- `Phases/P2 - Per-endpoint limiter middleware.md`
- `Phases/P3 - Per-user limiter + identity layer.md`
- `Phases/P4 - Auto-ramp on throttle recovery.md`
- `Phases/P5 - Observability + alerting.md`
- plus matching log stubs.

Return `{ branch: "agent", written_files: [5 paths], warnings: [] }`.

**Example 2 — extend mode:**

Input: project has P1–P5 complete. Overview grew with new acceptance criteria. `start_number = 6`, `mode = "extend"`, `existing_phases_summary` lists the 5 existing phases.

Skill produces P6–P8 that don't overlap with existing work. `depends_on: [5]` for P6.

**Example 3 — LLM-output fallback:**

No agent available. Branch B.

LLM returns:
```json
[
  {"number":1,"name":"Add Redis adapter","summary":"...","context":"...","acceptance_criteria":["..."]},
  ...
]
```

Returns `{ branch: "llm", specs: [...], warnings: [] }`. Caller (decompose-project Step 5) materialises the phase files.
