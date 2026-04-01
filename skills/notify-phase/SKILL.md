# Notify Phase

## Purpose
Standard notification contract. Every controller action fires a notification.

## Channels
- **stdout** — always, every event, formatted as:
  ```
  [GroundZeroOS] event_type · Project · Phase · detail (#runId)
  ```
- **OpenClaw Gateway (WhatsApp)** — if `notify.openclaw` is configured (recommended)
- **WhatsApp (CallMeBot)** — if `notify.whatsapp` is configured (legacy/simple)

## OpenClaw setup (recommended)
Requires the `openclaw` CLI installed + logged in on the machine running GZOS.

Add to `groundzero.config.json`:
```json
{
  "notify": {
    "stdout": true,
    "openclaw": {
      "target": "+447743183601"
    }
  }
}
```

Optional fields:
- `channel`: override channel name (usually omit)
- `profile`: OpenClaw profile name (maps to `openclaw --profile <name>`)
- `account_id`: OpenClaw account id (best-effort; only used if your CLI supports `--account`)

Environment variable alternative (keep out of git):
- `OPENCLAW_NOTIFY_TARGET=+4477...`

## WhatsApp (CallMeBot) setup (legacy)
1. Get a free CallMeBot API key: https://www.callmebot.com/blog/free-api-whatsapp-messages/
2. Add to config:
```json
{
  "notify": {
    "stdout": true,
    "whatsapp": {
      "apiUrl": "https://api.callmebot.com/whatsapp.php",
      "recipient": "+447700900000"
    }
  }
}
```

## Events (fired on every action)

| Event | Emoji | When |
|---|---|---|
| `controller_started` | 🚀 | Loop begins |
| `heal_complete` | 🩹 | After self-healer runs |
| `lock_acquired` | 🔒 | Phase executor claims a phase |
| `task_started` | ⚙️ | Before agent spawns for a task |
| `task_done` | ✅ | Task completed + ticked |
| `task_blocked` | ⚠️ | Task failed |
| `phase_completed` | 🎉 | All tasks + acceptance done |
| `phase_blocked` | 🚨 | Phase set to blocked |
| `lock_released` | 🔓 | Lock cleared |
| `stale_lock_cleared` | 🧹 | Healer cleared a stale lock |
| `atomise_started` / `atomise_done` | ⚛️ | P2 Atomiser lifecycle |
| `linear_import_done` | 📥 | L1 import complete |
| `linear_uplink_done` | 📤 | Linear sync complete |
| `controller_idle` | 💤 | No work found |
| `controller_halted` | 🛑 | Max iterations hit |

## WhatsApp message format
```
🎉 GroundZeroOS
My Project · P1 — Example Phase
phase_completed — all 3 tasks done
Run: #gz-1234567-abc
```

## Non-blocking
WhatsApp calls are fire-and-forget with 1 retry.
If WhatsApp is not configured, stdout-only — zero extra latency.
