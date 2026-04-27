---
title: knowledge-merge
tags: [skill, onyx-runtime, planner, knowledge]
type: skill
replaces: src/planner/consolidator.ts (CONSOLIDATE_SYSTEM_PROMPT + CROSS_PROJECT_DEDUP_PROMPT + extraction + merge logic)
lines_replaced: 200
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: knowledge-merge

> Extract structured learnings from a phase's content + log via LLM. Merge into project Knowledge.md. Optionally evaluate whether any learnings represent genuinely-new cross-project principles.

## Purpose
Two methods packaged in one skill because they share the same LLM + JSON-parsing infrastructure:

1. **extract** — per-phase learnings / decisions / gotchas.
2. **dedup-check** — filter new learnings against existing cross-project principles; return only genuinely new ones.

## Inputs (method: extract)
- `phase_content: string` — full phase file body
- `log_content: string` — phase's log file body, or placeholder if no log
- `phase_label: string` — the human-readable phase name
- `phase_outcome: "completed" | "blocked" | "failed"`

## Outputs (method: extract)
```json
{
  "learnings": ["useful pattern or technique — 1-2 sentences each, 2-5 items"],
  "decisions": ["architectural/design decision — format: 'Chose X over Y because Z', 1-3 items or empty"],
  "gotchas":   ["failure mode / API quirk / blocker — 'X fails when Y, use Z instead', 1-3 items or empty"]
}
```

## Algorithm (method: extract)

### Step 1 — Build the system prompt
```
You are a knowledge curator. Given a phase log and phase note from a software
project, extract structured learnings into three categories.

The phase may be completed or blocked/failed — extract knowledge from BOTH
outcomes.

Output ONLY a valid JSON object — no prose, no markdown fences:
{
  "learnings": ["useful pattern or technique that worked — 1-2 sentences each, 2-5 items"],
  "decisions": ["architectural or design decision made — format: 'Chose X over Y because Z', 1-3 items or empty array"],
  "gotchas":   ["something that failed, surprised, or blocked progress — format: 'X fails when Y, use Z instead', 1-3 items or empty array"]
}

Rules:
- Be concrete and specific — not vague generalities
- decisions: capture choices that would affect future phases (library, pattern, schema, approach)
- gotchas: capture failure modes, API quirks, constraints, blockers discovered during execution
- learnings: general reusable techniques and approaches
- For blocked/failed phases: focus on gotchas and what caused the block
- If a category has nothing worth capturing, return an empty array for it
```

### Step 2 — Build the user prompt
```
Phase: <phase_label>

Phase note:
<phase_content>

Execution log:
<log_content>

Extract learnings.
```

### Step 3 — Invoke LLM
Call the standard-tier LLM with `max_tokens: 1024`. Either via the agent-native LLM call (if available) or via `openrouter` if that's the configured path.

### Step 4 — Parse JSON
1. Find the first `{...}` block in the output (regex `\{[\s\S]+\}`).
2. `JSON.parse` it.
3. If parse fails → **fallback**: wrap the raw output as `{ learnings: [<raw>], decisions: [], gotchas: [] }`.
4. If parse succeeds but schema is wrong → default missing fields to `[]`.

### Step 5 — Return
Return the extracted object.

---

## Inputs (method: dedup-check)
- `new_items: string[]` — combined learnings + gotchas from the just-finished phase
- `existing_principles_text: string` — contents of `08 - System/Cross-Project Knowledge.md` (or just the `### <name>` headers if the full doc is large)
- `project_id: string`

## Outputs (method: dedup-check)
```json
[
  { "name": "5-7 word title", "rule": "one sharp sentence", "why": "failure mode it prevents", "first_seen": "<project> — brief context" },
  ...
]
```
Or `[]` if nothing is genuinely new.

## Algorithm (method: dedup-check)

### Step 1 — Extract just the principle names from existing text
Regex `^### (.+)$` per line. If empty → pass `(none yet)` as the existing block.

### Step 2 — Build the prompt
```
You are maintaining a living principles document for a software engineering team.

Given new learnings from a project phase, identify any that represent GENUINELY
NEW principles not already captured in the existing document.

EXISTING PRINCIPLES (do not repeat or rephrase these):
---
<extracted names or (none yet)>
---

NEW LEARNINGS FROM <project_id>:
- <item 1>
- <item 2>
...

A new principle is worth adding if:
- It names a failure mode or pattern NOT already covered above
- It is universal enough to apply to a different project in a different domain
- It would change how a future team member approaches a problem

Do NOT add a principle if:
- It is the same idea as an existing one, even if worded differently
- It is too project-specific to generalise
- It is a restatement of an obvious software practice (e.g., "write tests")

Output ONLY a JSON array. Each object must have:
{
  "name": "5-7 word principle title",
  "rule": "One sharp, universal sentence stating the principle",
  "why": "The failure mode it prevents — what concretely goes wrong without it",
  "first_seen": "<project_id> — brief one-line context of what happened"
}

If nothing is genuinely new, return exactly: []
```

### Step 3 — Invoke LLM
`max_tokens: 800`.

### Step 4 — Parse JSON array
Regex `\[[\s\S]*\]`. JSON.parse. Filter to valid schema (each has `name` string + `rule` string).

### Step 5 — Return
Array of valid principle objects (possibly empty).

## Invariants

- **extract** never returns non-array categories — always arrays, possibly empty.
- **extract** output is always valid JSON-parseable OR the fallback single-bullet wrap.
- **dedup-check** is conservative — when in doubt, return fewer new principles rather than more.
- **dedup-check** is non-blocking in the caller (consolidate operation) — its failure must not break phase completion.
- Neither method mutates files. Mutation is the caller's responsibility.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `llm_timeout` | LLM call exceeds timeout | Retry once; if still fails, return empty categories. |
| `malformed_json` | LLM returned text that doesn't parse as JSON | Fallback to single-bullet Learnings wrap (extract) or empty array (dedup-check). |
| `empty_input` | `phase_content` + `log_content` both empty/trivial | Return `{ learnings: [], decisions: [], gotchas: [] }` without calling LLM. |
| `schema_mismatch` | Parse succeeds but fields missing | Default missing to `[]`; warn in caller logs. |

## Examples

**Example 1 — extract from a completed engineering phase:**

Input:
- `phase_label = "Integrate Supplier Ingestion"`
- `phase_outcome = "completed"`
- `log_content` describes: built a Prisma Supplier model, wrote an ingestion worker, hit a rate limit on the supplier API, switched from REST to webhook push.

Output:
```json
{
  "learnings": [
    "Supplier-push webhooks scale better than polling for high-volume feeds.",
    "Idempotency keys in ingestion worker prevent duplicate orders under retry."
  ],
  "decisions": [
    "Chose webhook-push ingestion over scheduled polling because rate limits made polling non-viable for daily volume."
  ],
  "gotchas": [
    "Supplier API returns 429 after ~80 requests/minute without documented limit — webhook path avoids it entirely."
  ]
}
```

**Example 2 — extract from a blocked phase:**

Input: `phase_outcome = "blocked"`, log describes failed auth integration.

Output emphasises gotchas:
```json
{
  "learnings": [],
  "decisions": [],
  "gotchas": [
    "Third-party OAuth provider requires explicit redirect-URI allowlist — local dev must register a stable localhost URI.",
    "Refresh-token rotation needs persistent storage — in-memory session cache breaks after restart."
  ]
}
```

**Example 3 — dedup-check returns nothing new:**

Input: existing principles include "Idempotency for retries"; new items include "Idempotency keys in ingestion worker prevent duplicate orders".

Output: `[]` — the new item is a restatement of the existing principle.

**Example 4 — dedup-check finds novelty:**

Input: existing principles don't cover webhook-vs-polling tradeoffs. New items include "Supplier-push webhooks scale better than polling".

Output:
```json
[
  {
    "name": "Push beats poll at volume",
    "rule": "For any high-volume external feed, prefer webhook push over scheduled polling.",
    "why": "Polling at volume hits rate limits, wastes compute on empty responses, and can't meet low-latency requirements.",
    "first_seen": "AmazonPipe — supplier ingestion phase switched from REST poll to push after 429s."
  }
]
```
