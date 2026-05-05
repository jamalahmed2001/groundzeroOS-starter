# P3 — Consolidator

## Purpose
After a phase completes, extract durable learnings and append to Knowledge.md.

## When to invoke
Automatically when controller finds a `phase-completed` phase.

## Input
- The completed phase note (tasks, acceptance criteria)
- The phase log note (full execution trace)

## Output
Appends to `PROJECT - Knowledge.md` under `## Learnings`:
```markdown
### P{N} — {Phase Name} — {date}
- **Decision:** [key decision made during execution]
- **Gotcha:** [something unexpected that was encountered]
- **Ref:** [[Logs/LN - PN - Phase Name|Full log]]
```

Optionally creates a Doc note under `Docs/` if a durable reference document emerged.

## Rules
- Append only — never rewrite existing Knowledge.md content
- Extract signal (decisions, gotchas), not recap (the log has the full trace)
- Keep each learning entry concise (3–5 bullet points max)
- Link to the log note for full detail
