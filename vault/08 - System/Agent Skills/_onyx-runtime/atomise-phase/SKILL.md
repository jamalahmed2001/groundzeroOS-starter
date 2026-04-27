---
title: atomise-phase
tags: [skill, onyx-runtime, planner]
type: skill
replaces: src/planner/atomiser.ts (the LLM + agent-spawn portions)
lines_replaced: 400
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: atomise-phase

> Generate a structured `## Implementation Plan` task block for a phase, grounded in the project's real source context. Two branches: **direct-agent** (write-through-file) for agent-capable drivers, **LLM-output** (text-to-file) for driverless environments.

## Purpose
The core plan-generation step of the `atomise` operation. Given a phase description + project context, produce 4–8 parent tasks each with files/output locations, concrete steps, validation commands, and definition-of-done. Each parent gets 2–5 sub-task checkboxes.

## Inputs
- `phase_path: string`
- `project_id: string`
- `phase_name: string`
- `phase_number: int`
- `profile_name: string` — engineering | trading | content | research | operations | experimenter | accounting | legal | general
- `is_code_profile: bool` — true for engineering/trading; gates whether output uses `**Files:**` or `**Output:**`
- `repo_path: string | null` — code profiles only; absolute path to the git repo
- `bundle_path: string` — absolute path to project bundle (parent of Phases/)
- `context_packet: string` — project scope + agent constraints + sibling summary (≤ 4KB)
- `phase_content: string` — full phase file body
- `source_context: string` — repo tree (code) or bundle listing (non-code)
- `model_hint: "planning" | "heavy" | null` — if set, use the corresponding model tier; else default to the project's `planning` tier.

## Outputs
- `plan_block: string` — the markdown between and including `<!-- AGENT_WRITABLE_START:phase-plan -->` and `<!-- AGENT_WRITABLE_END:phase-plan -->`. Return `null` if generation failed.
- `warnings: string[]` — notes like "LLM had to salvage plan" or "agent didn't write, fell back to LLM".
- `missing_files: string[]` — file paths in the plan that don't exist in the repo (code profile post-validation).

## The two branches

### Branch A — Direct-agent (preferred when available)

Triggers when: driver supports file-write tools AND repo/bundle directory is accessible.

Process:
1. Build the **agent system prompt** (see §System prompts below) selecting the code or generic template based on `is_code_profile`.
2. Build the **user prompt**: phase note path + "Repo/Bundle to explore" + "## Your task" numbered list + "## Phase context" containing the context_packet + phase_content.
3. Invoke the agent (Task/Agent tool, or equivalent sub-agent invocation), instructing it to:
   - Read the phase file.
   - Explore the repo/bundle.
   - Write the plan **directly into the phase file** between the managed markers.
   - Update frontmatter: `state: ready`, tags include `phase-ready`.
4. After the agent returns successfully, verify the managed block was actually written. If yes → extract it and return.
5. If the agent succeeded but didn't write the block (rare; sometimes they output to stdout instead) → fall through to Branch B.

Timeout: 180 seconds. On timeout, abort the agent call and fall through to Branch B.

### Branch B — LLM-output (fallback)

Triggers when: no agent driver, or Branch A didn't land a plan block.

Process:
1. Build the **LLM system prompt** (text-output variant of §System prompts).
2. Build the user prompt as in Branch A.
3. Call the configured planning-tier LLM (OpenRouter via `planningCall` equivalent, max 3500 tokens).
4. Parse the returned text:
   - Search for `<!-- AGENT_WRITABLE_START:phase-plan -->` to end marker.
   - If found → extract that block verbatim.
   - If not found but output contains `- [ ]` checkboxes or `[T1]` task IDs → **salvage**: wrap the output in the markers. Record in `warnings` as `llm_salvage`.
   - If neither → return `null` (total failure).
5. Return the wrapped block.

### Branch selection logic

```
if driver_supports_agent_tools AND explore_dir_exists:
    result = branch_a()
    if result.plan_block: return result
    warnings.append("branch_a_no_block")

result = branch_b()
return result
```

## System prompts

### Code profile (engineering, trading) — direct-agent write mode

```
You are a senior technical architect creating an implementation task plan
for an AI coding agent.

You will be asked to:
1. Read a phase note to understand what needs to be built
2. Explore the repo to understand existing patterns and structure
3. Write an implementation task plan DIRECTLY into the phase note file

CRITICAL: You MUST write the plan to the file using your Edit or Write tools.
Do NOT output the plan to stdout.

Plan format — write this exact structure between the managed markers in the file:

<!-- AGENT_WRITABLE_START:phase-plan -->

## Implementation Plan

### [T1] Task name (3-6 words, action-oriented)
**Files:** `path/to/file.ts`, `path/to/other.ts`
**Steps:**
1. Concrete step
2. Concrete step
**Validation:** How to verify (e.g. "npm test passes", "curl /api/foo returns 200")
**DoD:** One measurable binary done condition

- [ ] [T1.1] Sub-task — imperative verb, specific file/symbol if known
- [ ] [T1.2] Sub-task — imperative verb, specific file/symbol if known

### [T2] Next task name
...

<!-- AGENT_WRITABLE_END:phase-plan -->

Rules:
- Sub-tasks MUST be checkboxes (- [ ])
- Steps must be concrete — not "implement" but
  "add POST /api/x in src/routes/x.ts"
- File paths MUST exist in the repo (use Glob/Grep to verify before writing)
- 4-8 parent tasks maximum
- Do NOT add tasks about writing documentation or tests unless
  the phase explicitly requires it
- When done writing the plan, also update the frontmatter:
  set state: ready, ensure tags includes phase-ready
```

### Non-code profile (content, research, operations, …) — direct-agent write mode

Same structure, but:
- `**Files:**` → `**Output:**` — describes the artifact produced and where it goes.
- "Explore the repo" → "Explore the bundle — read context docs, directives, and existing artifacts".
- "File paths MUST exist" → "Output locations must match the phase note's declared output section".

### LLM-output mode (both profile kinds)

Same plan format, but:
- Opens with: "Output format — wrap everything between the markers exactly as shown:"
- Closes with: "Output ONLY the implementation plan block — nothing else, no prose before or after"
- Adds "GROUNDING RULES" block (code profiles): Files: lines must reference real files from the repo tree above OR be marked `(new)`; don't invent paths; base task structure on what actually exists.

## User prompt template

```
Project: <project_id>
Phase: P<phase_number> — <phase_name>

<context_packet>

<phase_content>

---

<source_context_or_exploration_directive>

Generate the implementation task plan for this phase.
```

`<source_context_or_exploration_directive>` branches:
- If Branch A + agent can explore: embed "Explore the repo at <repo_path>" directive.
- If Branch B or static context: embed the full `source_context` string (repo tree or bundle listing).

## Validation after generation (code profiles only)

Invoke [[08 - System/Agent Skills/_onyx-runtime/repo-scan/SKILL.md|repo-scan]] or direct Glob on each `**Files:**` path (ignoring `(new)` markers). Files that don't exist → append to `missing_files` output.

Caller decides whether to annotate the plan with a warning comment block or abort.

## Invariants

- The returned `plan_block` always starts with the start marker and ends with the end marker verbatim.
- Parent task count ≥ 4 and ≤ 8 (strict in system prompt; LLM may drift — detector enforces on output).
- Every parent has at least one sub-task checkbox.
- Never invent file paths silently; either (a) reference existing file OR (b) mark `(new)`.
- `updated:` frontmatter is bumped by the operation caller (atomise.md Step 5), not by this skill.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `ambiguous_scope` | Phase content + Overview too vague; atomiser cannot produce meaningful grounding | Return `null` + warning. Caller should transition to `blocked` with specific "what's unclear" in Human Requirements. |
| `llm_timeout` | LLM call in Branch B times out | Retry once with reduced `maxTokens`; else return `null`. |
| `agent_timeout` | Branch A sub-agent times out after 180s | Fall through to Branch B. |
| `salvaged_plan` | Branch B output missing markers but content looks task-like | Wrap in markers, return with `warnings: ['llm_salvage']`. |
| `empty_output` | LLM returned empty or non-planlike text | Return `null`. |

## Examples

**Example 1 — engineering phase:**

Input:
- `profile_name = engineering`
- `repo_path = /home/jamal/clawd/openclaw/projects/amazonpipe`
- `phase_name = Moderation UX for Designs and Listings`
- `phase_content` describes: build an admin panel for moderators to review AI-generated designs before listing them.

Branch A invoked. Agent reads repo, finds existing `src/admin/` patterns. Writes:

```markdown
<!-- AGENT_WRITABLE_START:phase-plan -->

## Implementation Plan

### [T1] Add moderation queue data model
**Files:** `prisma/schema.prisma`, `src/db/migrations/moderation-queue.sql` (new)
**Steps:**
1. Add ModerationQueue model to schema.prisma with fields: id, designId, status, moderatorId, decidedAt, reason
2. Generate migration: `pnpm prisma migrate dev --name add_moderation_queue`
3. Export types from src/db/types.ts
**Validation:** `pnpm prisma studio` shows new table
**DoD:** Can insert a row via prisma client, schema tests pass

- [ ] [T1.1] Edit schema.prisma with new model
- [ ] [T1.2] Run prisma migrate dev
- [ ] [T1.3] Verify type export in db/types.ts

### [T2] …
```

**Example 2 — non-code research phase:**

Input: `profile_name = research`, bundle has Source Context + prior briefs.

Agent reads the research context docs. Writes plan where `**Files:**` is replaced by `**Output:**`:

```markdown
### [T1] Source scoping + inclusion criteria
**Output:** `research-scope.md` in bundle root
**Steps:**
1. Review Source Context for methodology patterns
2. Define 3–5 inclusion criteria for primary studies
3. List 8–12 candidate sources with PubMed IDs or URLs
**Validation:** research-scope.md exists with all three sections populated
**DoD:** Scope document locked; no ambiguous inclusion rules

- [ ] [T1.1] Draft inclusion criteria
- [ ] [T1.2] Produce candidate source list
```

**Example 3 — salvage path:**

Branch B LLM output: `- [ ] [T1.1] Do the thing\n- [ ] [T1.2] Do the other thing\n### [T2] ...`

No markers present, but checkbox syntax detected. Wrap:
```
<!-- AGENT_WRITABLE_START:phase-plan -->

[original output verbatim]

<!-- AGENT_WRITABLE_END:phase-plan -->
```

Return with `warnings: ['llm_salvage']`. Caller should flag for human review before executing.
