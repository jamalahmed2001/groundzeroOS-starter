---
name: linear
description: Thin shell wrapper over the Linear GraphQL API for use from agent directives. Reads Linear projects + issues, creates/updates issues, resolves viewers/cycles/labels/project IDs. Replaces the legacy src/linear/*.ts; orchestration logic now lives in vault directives (linear-import.md, linear-uplink.md), this skill only owns the HTTP boundary.
metadata:
  clawdbot:
    emoji: "📋"
    requires: ["bash", "curl", "jq"]
    credentials: "LINEAR_API_KEY (Linear personal API key — settings → API → Personal API keys)"
---

# Linear

A small shell skill that talks to Linear's GraphQL API. Used by agent directives that need to read or write Linear state — primarily `linear-import` (pull a Linear project into a vault bundle) and `linear-uplink` (push vault phases back as Linear issues).

The skill is intentionally thin: each verb does exactly one HTTP call and emits a single JSON line on stdout. The directive pipes the JSON through `jq` and decides what to do. This keeps the boundary between "code that talks to Linear" and "logic that decides what to send" sharp — the code stays small (≈250 LOC of bash) and the logic lives in human-readable directives.

## When to use

- A directive needs to fetch a Linear project's issues to seed a vault bundle.
- A directive needs to push back vault phases as Linear sub-issues for visibility outside the vault.
- A directive needs to find a project by name, resolve the active cycle, fetch label IDs, etc.

## Not when

- You want a high-level "sync everything" — that's the `linear-import` / `linear-uplink` directives' job, which call this skill underneath.
- You want a real-time webhook receiver — out of scope; this skill is a pull/push primitive.

## Install

```bash
chmod +x ~/clawd/skills/linear/bin/linear
```

No build step, no dependencies beyond `bash`, `curl`, and `jq`.

## Auth

```bash
# .env (already in onyx.config.json's secret resolution chain)
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=TEAM_UUID         # used by some verbs
```

Get a personal API key at <https://linear.app/settings/api>.

## Verbs

```
linear project --id <id>
   → { "id": ..., "name": ..., "description": ... }

linear project-issues --id <id>
   → { "project": { "issues": { "nodes": [{ id, identifier, title, description,
                                              state { name },
                                              children { nodes: [...] } }] } } }

linear viewer
   → { "viewer": { "id": ..., "email": ... } }

linear active-cycle --team-id <id>
   → { "team": { "activeCycle": { "id": ... } } }   (activeCycle may be null)

linear find-project --team-id <id> --name "<name>"
   → { id, name }    (exact match preferred, else case-insensitive; {} if none)

linear find-labels --team-id <id> --patterns "regex1,regex2,..."
   → { ids: ["...", "..."] }    (label ids matching any pattern)

linear issue-create --team-id X --title Y [--description Z]
                    [--project-id P] [--parent-id P]
                    [--assignee-id A] [--cycle-id C]
                    [--label-ids L1,L2,...]
   → { success: true|false, id: ..., identifier: "ABC-123" }

linear issue-update --id <id> [--title Y] [--description Z]
                    [--state-id S] [--team-id T]
   → { success: true|false }
```

Every verb emits a single JSON line on stdout. Errors go to stderr as a JSON object with `ok:false` and exit non-zero.

## Retries + backoff

Built in. The skill auto-retries on:
- HTTP 429 (rate-limited) — honours the `Retry-After` header if present.
- HTTP 5xx (transient server errors).

Exponential backoff: 1s → 2s → 4s → 8s, capped at 30s. Max 4 retries, then the skill gives up and exits 1.

## Example: directive uses

### Fetch a project + its issues

```bash
project_id="abc-123"
project_data=$(linear project --id "$project_id")
issues=$(linear project-issues --id "$project_id")

echo "$issues" | jq -r '.project.issues.nodes[] | "\(.identifier): \(.title)"'
```

### Find a project by name then resolve viewer + cycle

```bash
team_id="$LINEAR_TEAM_ID"

project=$(linear find-project --team-id "$team_id" --name "My Project")
project_id=$(echo "$project" | jq -r '.id // empty')

viewer=$(linear viewer | jq -r '.viewer.id')
cycle=$(linear active-cycle --team-id "$team_id" | jq -r '.team.activeCycle.id // empty')
labels=$(linear find-labels --team-id "$team_id" --patterns '^Creator Experience$' | jq -r '.ids | join(",")')
```

### Create an issue + write the new ID back

```bash
result=$(linear issue-create \
  --team-id "$team_id" \
  --title "P1 — Setup" \
  --description "$desc" \
  --project-id "$project_id" \
  --parent-id "$parent_issue_id" \
  --assignee-id "$viewer" \
  --cycle-id "$cycle" \
  --label-ids "$labels")

new_id=$(echo "$result" | jq -r '.id')
new_identifier=$(echo "$result" | jq -r '.identifier')
```

## Forbidden patterns

- **Don't bypass the retry logic** by writing a bare `curl` in your directive. The retry handling is non-trivial and matters under real Linear load.
- **Don't pass secrets via `--api-key` flags** — the skill reads only from `LINEAR_API_KEY` env. Keep credentials out of process listings.
- **Don't hardcode label / cycle / project IDs** in directives. Use the find-* verbs to resolve them at run time so the directives stay portable.

## Related

- `08 - System/Operations/linear-import.md` — directive that uses this skill to pull a Linear project into a vault bundle.
- `08 - System/Operations/linear-uplink.md` — directive that uses this skill to push vault phases back to Linear as sub-issues.
- Legacy: `src/linear/*.ts` (839 LOC) — to be deleted after the directive shadow week proves zero behavioural diff against the TS path.
