---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: config-load
version: 1.0.0
source_skill_path: ~/clawd/onyx/skills/config-load/SKILL.md
created: 2026-04-27
updated: 2026-04-27
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# config-load

> Read `onyx.config.json` + `.env`, emit `export VAR="value"` lines for shell sourcing. Replaces `src/config/load.ts` (200 LOC). Existing env vars take precedence.

## Verbs (one)

```
config-load [--config <path>] [--cwd <path>]
eval "$(config-load)"
```

## Mapping

| Field in `onyx.config.json` | Env var |
|---|---|
| `vault_root` | `ONYX_VAULT_ROOT` |
| `repos_root` | `ONYX_REPOS_ROOT` |
| `projects_glob` | `ONYX_PROJECTS_GLOB` |
| `agent_driver` | `ONYX_AGENT_DRIVER` |
| `max_iterations` | `ONYX_MAX_ITERATIONS` |
| `max_runtime_seconds` | `ONYX_MAX_RUNTIME_SECONDS` |
| `notify.openclaw.target` | `OPENCLAW_NOTIFY_TARGET` |
| `linear.team_id` | `LINEAR_TEAM_ID` |
| `llm.model` | `ONYX_LLM_MODEL` |

The `.env` file's `KEY=value` lines pass through verbatim.

## Precedence (highest first)

1. Env vars already set in the calling shell.
2. `.env` file values.
3. `onyx.config.json` values.

## When to use

- The `bin/onyx` dispatcher sources this on every invocation.
- Standalone scripts that need vault-aware behaviour.
- Shadow-mode tests comparing config resolution against the legacy TS path.

See full SKILL.md at `~/clawd/onyx/skills/config-load/SKILL.md`.
