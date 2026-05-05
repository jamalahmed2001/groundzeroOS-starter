---
name: suno-generate
description: Generate music tracks via Suno through a pluggable HTTP backend. Use from narration/podcast/video directives that need backing music or soundbeds. Configurable to use a paid Suno gateway (PiAPI, GoAPI, SunoAPI.org) or a self-hosted gcui-art/suno-api wrapper.
metadata:
  clawdbot:
    emoji: "🎵"
    requires: ["node"]
    credentials: "SUNO_API_KEY (gateway mode) OR SUNO_COOKIE (selfhosted mode). See env block below."
---

# Suno Generate

General-purpose AI music generator. Suno has no official public API, so this skill supports two real-world paths and lets you switch with one env var.

## When to use

- A narration/podcast phase needs a backing soundbed under the voice-over.
- A video phase needs an intro/outro/transition sting.
- Any project with a consistent musical identity across episodes (define the style once, re-use per episode).

## Not when

- You need specific licensed music (Epidemic Sound, Artlist, Audiio) — use their APIs directly.
- You need sound effects — Suno is music-focused; SFX libraries fit better.
- The music needs human oversight every time (hit/miss ratio varies — gateway providers often need 2–3 generations to get a usable take). This skill is fine with that; the caller decides.

## Install

```bash
cd ~/clawd/skills/suno-generate
pnpm install
pnpm run build
```

## Credentials & provider selection

Three modes. Set `SUNO_PROVIDER` to pick, then the matching vars.

### Browser mode (recommended — uses your paid Suno Pro via real UI)

Drives Suno's own web UI via the [browser-automate](../browser-automate/SKILL.md) skill. No third-party gateway, no unofficial API, clean commercial licence under your Pro/Premier subscription.

One-time setup:

```bash
# sign in — opens a visible browser, log in manually, close when done
~/clawd/skills/browser-automate/bin/browser-automate login suno
```

Then set the provider and use as normal:

```bash
export SUNO_PROVIDER=browser
suno-generate --prompt "..." --output-dir ./out --count 2
```

Session persists at `~/.cache/browser-automate/profiles/suno/`. Re-login only when Suno expires your cookie.

**Trade-offs:** slower per generation (~90–180s vs ~60s for API), fragile to Suno UI redesigns. The recipe captures a full-page screenshot on failure — check `/tmp/browser-automate/suno/<timestamp>/error-*.png` if selectors drift.

### Gateway mode (paid API proxy)

Uses a paid API gateway. Most gateways (PiAPI, GoAPI, SunoAPI.org, AceAPI) follow a similar POST-create / GET-poll pattern and this skill is written against that shape. If your gateway differs, see `src/providers.ts` and extend `gatewayProvider`.

```bash
export SUNO_PROVIDER=gateway
export SUNO_GATEWAY_URL=https://api.piapi.ai/api/v1/task
export SUNO_API_KEY=<your-gateway-key>
```

Pricing is ~$0.05–0.20 per 2-track generation depending on provider.

### Self-hosted mode

Uses the open-source [gcui-art/suno-api](https://github.com/gcui-art/suno-api) Node server, which reverse-engineers Suno's web frontend using your browser cookie. Fragile — breaks when Suno ships a frontend update — but free.

```bash
export SUNO_PROVIDER=selfhosted
export SUNO_SELFHOST_URL=http://localhost:3000
export SUNO_COOKIE="<full Suno cookie string>"
```

## Usage

### Single track

```bash
suno-generate \
  --prompt "warm introspective piano, slow tempo, British autumn, sparse" \
  --style "cinematic, minimal, ambient piano" \
  --title "mentor-bed-01" \
  --instrumental \
  --output-dir ./out
```

### Multiple attempts, keep first

```bash
suno-generate \
  --prompt "..." \
  --style "..." \
  --count 2 \
  --output-dir ./out
```

(Most providers return 2 variants per call; `--count 2` keeps both.)

### Dry run (preview the payload without calling the API)

```bash
suno-generate --prompt "..." --output-dir ./out --dry-run
```

## Output (stdout JSON)

```json
{
  "ok": true,
  "provider": "gateway",
  "outputs": ["./out/track-01.mp3", "./out/track-02.mp3"],
  "tracks": [
    { "id": "abc...", "title": "mentor-bed-01", "durationSeconds": 112, "style": "cinematic, minimal, ambient piano" }
  ]
}
```

## Licensing note

For commercial podcast/video use, you need Suno's **Pro** or **Premier** tier regardless of which backend you use. The skill doesn't enforce this — the caller is responsible. Set `SUNO_COMMERCIAL_TIER=true` in your env for self-documentation (it's recorded in metadata but not validated).
