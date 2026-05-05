---
name: notify
description: Fire a single openclaw notification per Master Directive §15. Always echoes to stdout in §15.4 format; also dispatches via openclaw CLI if OPENCLAW_NOTIFY_TARGET is set. Replaces src/notify/notify.ts (99 LOC); batching responsibility shifts to callers.
metadata:
  clawdbot:
    emoji: "📣"
    requires: ["bash", "openclaw"]
    credentials: "OPENCLAW_NOTIFY_TARGET (E.164 phone number), or stdout-only if unset"
---

# notify

Single-call openclaw wrapper. Each invocation = one notification.

## When to use

- Inside an operation directive that needs to surface state to the operator (phase complete, blocked, integrity error, scheduled event fired).
- Inside the heal sweep when a non-trivial repair was applied.

## Verbs

```
notify --event <name> --project <pid> --phase <pid|-> --severity <info|warn|alert> --message "<text>"
```

Required: `--event`, `--project`, `--message`. Optional: `--phase` (default `-`), `--severity` (default `info`).

`<event-name>` must be one of the canonical events from Master Directive §15.3 (`phase_completed`, `phase_blocked`, `phase_started`, `integrity_error`, `rate_limit_backoff`, `long_running`, `schedule_fired`, `heal_action`, plus the legacy events `linear_import_done`, `linear_uplink_done`, etc.).

## Behaviour

1. **Always** prints `[ONYX] <event> · <project> · <phase> · <message>` to stdout — this is the §15.4 format and never depends on configuration.
2. **If** `OPENCLAW_NOTIFY_TARGET` env var is set, fires `openclaw --event ... --project ... --phase ... --severity ... --message ...` with a 10s timeout. Failure is swallowed — notification failure must never block the caller.
3. Returns 0 unconditionally on success or stdout-only.

## Why this is bash, not TS

The 99 LOC of `src/notify/notify.ts` had 500ms batching that grouped events per `runId`. With agent-readable directives, each operation is its own logical unit — the per-call boundary is clearer than time-based batching. Bash + `openclaw` does the irreducible work; batching, if needed, becomes a caller concern (e.g. an aggregator directive that emits one summary at the end of a multi-step routine).

## Forbidden patterns

- **Don't block** on the openclaw call. The 10s timeout protects against this.
- **Don't fail the caller** on notification failure — this is fire-and-forget by design.
- **Don't call this for high-frequency events** (e.g. once per task in a phase loop). Aggregate at the phase boundary.
