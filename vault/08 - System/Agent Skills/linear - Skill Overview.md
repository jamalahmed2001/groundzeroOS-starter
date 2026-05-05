---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: linear
version: 1.0.0
source_skill_path: ~/clawd/onyx/skills/linear/SKILL.md
created: 2026-04-27
updated: 2026-04-27
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# linear

> Thin shell wrapper over the Linear GraphQL API. The HTTP boundary used by directive-driven workflows ([[08 - System/Operations/linear-import.md|linear-import]], [[08 - System/Operations/linear-uplink.md|linear-uplink]]) instead of the legacy `src/linear/*.ts`.

## Purpose

Each verb is one HTTP call → one JSON line on stdout. Orchestration logic lives in the linear-import / linear-uplink directives; this skill only owns talking to Linear.

This is the "skill" pole of the no-code split. The "directive" pole is the two operation directives that compose these verbs into actual import/uplink workflows.

## Verbs

| Verb | Purpose |
|---|---|
| `project --id <id>` | Fetch a Linear project's metadata |
| `project-issues --id <id>` | Fetch all issues + sub-issues in a project |
| `viewer` | Fetch the authenticated user's ID |
| `active-cycle --team-id <id>` | Find the team's currently-active cycle (or null) |
| `find-project --team-id <id> --name <name>` | Resolve a project ID by name (exact, case-insensitive fallback) |
| `find-labels --team-id <id> --patterns p1,p2,...` | Resolve label IDs matching regex patterns |
| `issue-create --team-id ...` | Create a new issue (returns id + identifier) |
| `issue-update --id ... [...]` | Update an existing issue's title/description/state |

Full reference + flag list: see the SKILL.md at `~/clawd/onyx/skills/linear/SKILL.md`.

## Auth

`LINEAR_API_KEY` env var (Linear → Settings → API → Personal API keys). Optional: `LINEAR_TEAM_ID` for verbs that take a team scope.

## Retries

429 + 5xx auto-retried with exponential backoff (max 4 attempts, 30s cap). Honours `Retry-After` header.

## Why a separate skill (not direct curl from directives)

- The retry/backoff logic is non-trivial and matters under real Linear load.
- GraphQL escaping is fiddly — a typo in a directive's query string is hard to debug; a typo in a typed CLI flag is caught immediately.
- Centralised auth means the API key never appears in directive bodies (which get version-controlled).
- The skill is the natural shadow-mode comparison boundary against the legacy `src/linear/client.ts`.

## Related

- [[08 - System/Operations/linear-import.md|linear-import]] — directive that uses this skill to pull a Linear project into a vault bundle.
- [[08 - System/Operations/linear-uplink.md|linear-uplink]] — directive that uses this skill to push vault phases back to Linear as sub-issues.
- Legacy: `src/linear/{client,import,uplink,merge}.ts` (839 LOC) — to be deleted after the directives' shadow week proves zero behavioural diff.

## Forbidden patterns

- Don't bypass the retry logic by writing bare `curl` in a directive.
- Don't pass the API key via flags — use `LINEAR_API_KEY` env only.
- Don't hardcode label / cycle / project IDs in directives. Resolve them at run time via `find-*` verbs so directives stay portable.
