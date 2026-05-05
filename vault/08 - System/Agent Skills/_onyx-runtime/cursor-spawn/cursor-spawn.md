# Cursor Spawn

## Purpose
Spawn a Cursor Composer CLI agent to execute a coding task.

## When to invoke
When `agent_driver: "cursor"` is set in `onyx.config.json` and the executor needs to run a task.

## Prerequisites
- Cursor must be installed: https://cursor.sh
- `cursor` binary must be in PATH

## How it works
```bash
cursor --headless --prompt "<task>" --working-dir <repo_path>
# Linux only (headless Electron requires --no-sandbox):
cursor --no-sandbox --headless --prompt "<task>" --working-dir <repo_path>
```

Key flags:
- `--headless` — run without GUI; required for unattended spawned operation
- `--prompt "<prompt>"` — the task to execute
- `--working-dir <path>` — the repo the agent works in
- `--no-sandbox` — added automatically on Linux (Electron cannot use the sandbox without a display server)
- stdin is closed (`'ignore'`) so the process never hangs waiting for input
- Model flag is NOT passed — Cursor Agent uses its own configured default model

The executor:
1. Builds the prompt from the task line + phase context
2. Spawns `cursor` with a 10-minute timeout, stdin closed
3. Captures stdout as the task output
4. Reads `git diff` to determine files changed
5. Returns success/failure + output + filesChanged

## Timeout
Default: 10 minutes (600000ms). Override via `agent_driver_timeout_ms` in config.
On timeout: task marked as blocked, executor sets phase-blocked.

## To switch to Cursor
Edit `onyx.config.json`:
```json
{
  "agent_driver": "cursor"
}
```
