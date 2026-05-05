---
name: config-load
description: Read onyx.config.json + .env, emit `export VAR="value"` lines for shell sourcing. Replaces src/config/load.ts (200 LOC). Existing env vars take precedence over config-file values.
metadata:
  clawdbot:
    emoji: "⚙️"
    requires: ["bash", "jq"]
---

# config-load

Tiny config bootstrap. Reads two files (`.env` first, then `onyx.config.json`) and prints `export VAR="value"` lines on stdout. Callers source it:

```bash
eval "$(config-load)"
```

After this, every directive / skill that needs config sees the canonical env vars (`ONYX_VAULT_ROOT`, `ONYX_PROJECTS_GLOB`, `OPENCLAW_NOTIFY_TARGET`, etc.).

## Verbs (one)

```
config-load [--config <path>] [--cwd <path>]
```

Defaults: `--cwd $(pwd)`, config at `<cwd>/onyx.config.json`, .env at `<cwd>/.env`.

## Output

`export <KEY>="<value>"` lines on stdout. Never overwrites already-set env vars (env wins).

## Mapping (config.json → env var)

| `onyx.config.json` field | Env var |
|---|---|
| `vault_root` / `vaultRoot` | `ONYX_VAULT_ROOT` |
| `repos_root` / `reposRoot` | `ONYX_REPOS_ROOT` |
| `projects_glob` / `projectsGlob` | `ONYX_PROJECTS_GLOB` |
| `agent_driver` / `agentDriver` | `ONYX_AGENT_DRIVER` |
| `max_iterations` / `maxIterations` | `ONYX_MAX_ITERATIONS` |
| `max_runtime_seconds` / `maxRuntimeSeconds` | `ONYX_MAX_RUNTIME_SECONDS` |
| `notify.openclaw.target` | `OPENCLAW_NOTIFY_TARGET` |
| `linear.team_id` / `linear.teamId` | `LINEAR_TEAM_ID` |
| `llm.model` | `ONYX_LLM_MODEL` |

The `.env` file's `KEY=value` lines pass through verbatim — useful for `OPENROUTER_API_KEY`, `LINEAR_API_KEY`, `ANTHROPIC_API_KEY`, `OPENCLAW_NOTIFY_TARGET`, etc.

## Precedence

Highest first:
1. **Env vars** already set in the calling shell.
2. `.env` file values.
3. `onyx.config.json` values.

The skill achieves this by emitting `export X="..."` only when `X` is unset (`[[ -n "${!X+x}" ]]`).

## Exit codes

- `0` — exports emitted.
- `2` — config file present but not valid JSON.
- `3` — `vault_root` unresolvable from any source.

## When to use

- The `onyx` dispatcher sources this on every invocation: `eval "$(config-load)"`.
- Standalone scripts that need vault-aware behaviour: same pattern.
- Shadow-mode tests that want to compare config resolution against the legacy TS path.

## Forbidden patterns

- **Don't** print to stdout anything other than `export ...` lines. Errors go to stderr.
- **Don't** override env vars that the caller set. The `[[ -n "${!var+x}" ]]` check is the contract.
- **Don't** quote-escape values incorrectly. Use the included `sed` escaper for backslashes + double quotes.
