---
name: suno
description: Read and write the user's Suno library through their real Suno Pro session — list, download, generate, organise tracks, workspaces, and personas. Drives suno.com via browser-automate (CDP-attached real Chrome), no third-party gateway. Use this for every Suno operation; suno-generate is the narrower generate-only fallback.
metadata:
  clawdbot:
    emoji: "🎵"
    requires: ["node", "browser-automate"]
    credentials: "Uses the user's real Suno Pro login via browser-automate's CDP-attached Chrome. One-time: ~/clawd/skills/browser-automate/bin/browser-automate login suno"
---

# Suno

The canonical Suno integration. Drives the real suno.com web app via the [browser-automate](../browser-automate/SKILL.md) skill's CDP attach to a debuggable Chrome that already has the user's Suno Pro session. No paid gateway, no unofficial API, clean commercial licence under the Pro/Premier subscription the user already pays for.

## When to use

- Listing or downloading tracks from the user's Suno library
- Generating new tracks (single or duet)
- Organising the library — workspaces, personas, moves, renames
- Any music-pipeline phase that needs to read or write Suno state

## Not when

- You only need to fire a generate and walk away — the narrower [suno-generate](../suno-generate/SKILL.md) skill works for that and supports gateway providers as a fallback. This `suno` skill is the richer toolkit when you need library reads or organisation.
- You need licensed library music (Epidemic Sound, Artlist) — use those APIs directly.

## Install

```bash
cd ~/clawd/skills/suno
pnpm install
pnpm run build
```

## One-time auth

```bash
# opens a visible Chrome — log in to suno.com manually, then close
~/clawd/skills/browser-automate/bin/browser-automate login suno
```

The session persists in the browser-automate-managed Chrome profile. You don't need to re-auth between runs unless Suno expires the session.

## Verbs

```
suno library [--limit N] [--workspace ID]    list tracks (newest first)
suno track <id>                              fetch one track's metadata
suno download <id> [--out PATH]              download MP3 (+ optional cover)
suno generate --prompt "..." [--style "..."] [--persona ID] [--workspace ID]
suno duet <track-id> --prompt "..."          extend/duet an existing track
suno groups                                  list track groups
suno workspaces                              list workspaces
suno personas                                list personas
suno create-workspace --name "..."           new workspace
suno delete-workspace <id>                   remove workspace
suno rename-track <id> --to "..."            rename a track
suno move <track-id> --workspace ID          move track to workspace
```

Every verb prints a single JSON line on stdout — `{ "ok": true, "data": ... }` on success, `{ "ok": false, "error": "..." }` on failure. Caller pipes to `jq`.

## How it works under the hood

- All verbs shell out to `browser-automate` with the `suno` recipe.
- browser-automate attaches to the user's debuggable Chrome via CDP (the same one used for `suno login`), navigates to the relevant suno.com page, sniffs the bearer token from the page's network calls, then issues authenticated XHRs against suno.com's internal API endpoints.
- For Turnstile-gated flows (generate, signup), the [captcha-solve](../captcha-solve/SKILL.md) skill solves the challenge using the page's site key (`0x4AAAAAABd64Cd9aq5C--VE` for generate, different for auth).
- Generate uses DOM-driven submission (browser-automate's `suno` recipe) rather than the bare API, because the API path requires solving Turnstile per request.

## Environment

- `BROWSER_AUTOMATE_BIN` — override the default `~/clawd/skills/browser-automate/bin/browser-automate` path.
- `CAPTCHA_SOLVE_BIN` — override the default captcha-solve binary path.

No other secrets. The skill never touches `SUNO_API_KEY` or third-party credentials.

## Forbidden patterns

- Don't call third-party Suno gateways from this skill — that's `suno-generate`'s responsibility, and only when explicitly configured.
- Don't bypass the user's Pro/Premier subscription by hammering the unofficial API; use the Suno-paid path.
- Don't auto-publish tracks (Suno's "make public" toggle) without explicit operator confirmation — published tracks consume distribution credits.

## Related

- [suno-generate](../suno-generate/SKILL.md) — narrower generate-only skill, supports gateway providers.
- [browser-automate](../browser-automate/SKILL.md) — the CDP-attach foundation this skill rides on.
- [captcha-solve](../captcha-solve/SKILL.md) — Turnstile solver for gated flows.
