---
name: agent-spawn
description: Spawn a Claude Code or Cursor agent in non-interactive mode (`--print` style) with a prompt + repo workspace. Replaces src/agents/{claudeCodeSpawn,cursorSpawn,spawnAgent}.ts (179 LOC).
metadata:
  clawdbot:
    emoji: "🤖"
    requires: ["bash", "claude or cursor", "timeout"]
---

# agent-spawn

Single bash entry point for spawning a sub-agent. Used by orchestration directives that need to delegate a phase's work to a fresh Claude Code or Cursor process — for example, when execute-phase's task loop hits a task that's better handled by a separate agent context.

## Verbs (one)

```
agent-spawn --driver <claude-code|cursor> --prompt "<text>" --repo <path> [--timeout 600]
```

Or pipe prompt via stdin:

```bash
echo "$prompt" | agent-spawn --driver claude-code --repo "$repo"
```

## Output

Whatever the agent writes to stdout (text-format output from `--print` mode). Exit code is the agent's exit code, except:

- 124 — timeout
- 2 — usage error

## Drivers

### claude-code (default)

```
claude --dangerously-skip-permissions --output-format text --print <prompt> --add-dir <repo>
```

Uses Claude Code's session auth (or `ANTHROPIC_API_KEY`) automatically. Repo is scoped via `--add-dir` so the spawned agent can read files from there.

### cursor

```
cursor agent --print --yolo --output-format text --workspace <repo> <prompt>
```

Uses Cursor's configured model (no `--model` flag — that's a Cursor account setting). `--yolo` skips per-tool-call permission prompts; only safe inside a controlled flow.

## When to use

- Inside `execute-phase` Step 5.2 (sub-agent delegation) when a task isn't a simple shell command.
- Inside `decompose-project` if you want to delegate per-phase planning to a subagent rather than running it inline.
- Inside `research` if the running agent's context is full and a fresh subagent should do the scout.

## Forbidden patterns

- **Don't** spawn agents recursively without a depth limit. The directive driving execute-phase loops on its own; spawning agents from inside spawned agents is rarely intended.
- **Don't** bypass the timeout. The default 600s (10 min) catches runaway agents; raise only if you have a specific long-running need.
- **Don't** write to the repo from the spawning side while a subagent is mid-flight. The subagent owns the working tree; concurrent writes are race conditions.
