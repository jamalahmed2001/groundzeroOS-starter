# Claude Code Spawn

## Purpose
Spawn a Claude Code CLI agent to execute a coding task.

## When to invoke
When `agent_driver: "claude-code"` is set in `onyx.config.json` (this is the default).

## Prerequisites
- Claude Code must be installed: `npm install -g @anthropic-ai/claude-code`
- `claude` binary must be in PATH
- `ANTHROPIC_API_KEY` environment variable must be set

## How it works
```bash
claude --dangerously-skip-permissions --output-format text --print "<task>" --add-dir <repo_path> [--model <model>]
```

Key flags:
- `--dangerously-skip-permissions` — bypasses all permission prompts; required for unattended headless operation
- `--output-format text` — clean text output (not JSON)
- `--print "<prompt>"` — non-interactive mode; runs the prompt and exits
- `--add-dir <path>` — grants file system access to the repo directory
- stdin is closed (`'ignore'`) so the process never hangs waiting for input

The executor:
1. Builds the prompt from the task line + phase context
2. Spawns `claude` with a 10-minute timeout, stdin closed
3. Captures stdout as the task output
4. Reads `git diff` to determine files changed
5. Returns success/failure + output + filesChanged

## Authentication
Claude Code uses session auth by default. If you have run `claude login` on the machine, no API key is needed — the stored session is picked up automatically.

`ANTHROPIC_API_KEY` in `.env` is only required when running without a login session (e.g. fresh CI machine or container with no `claude login` performed).

## Timeout
Default: 10 minutes (600000ms). Override via `agent_driver_timeout_ms` in config.
On timeout: task marked as blocked, executor sets phase-blocked.
