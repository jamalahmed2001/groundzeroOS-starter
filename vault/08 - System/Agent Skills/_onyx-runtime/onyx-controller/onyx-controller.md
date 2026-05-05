# ONYX Controller

## Purpose
Autonomous orchestration loop. Discovers executable work across all project bundles, routes to the correct agent, executes, and repeats until done or halted.

## When to invoke
- `npm run onyx:run` — start the full controller loop
- Triggered automatically on schedule (configure your own cron)

## What it does
1. **Heal** — run self-healer to clear stale locks and fix drift
2. **Discover** — scan vault for `phase-ready` and `phase-active` notes
3. **Route** — for each phase, determine the correct operation (atomise/execute/consolidate/surface)
4. **Act** — execute the operation
5. **Notify** — send WhatsApp message for every action (if configured)
6. **Repeat** — loop until no work found or `max_iterations` hit

## Hard limits
- Maximum 20 iterations per run (configurable in `onyx.config.json`)
- Exceeding limit: halt + notify human + surface in log

## Config
```json
{
  "max_iterations": 20,
  "agent_driver": "claude-code",
  "stale_lock_threshold_ms": 300000
}
```
