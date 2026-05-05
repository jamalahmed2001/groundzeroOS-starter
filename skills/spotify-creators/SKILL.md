---
name: spotify-creators
description: Upload, list, and manage podcast episodes on Spotify for Creators via CDP-attached browser automation. Spotify has no public upload API, so this skill drives the web UI under your signed-in account — same pattern as the suno skill.
metadata:
  clawdbot:
    emoji: "🎙️"
    requires: ["node", "browser-automate daemon"]
    credentials: "none at the skill level — sign in to creators.spotify.com in your daily Chrome (or the daemon profile) and the daemon inherits the session"
---

# Spotify for Creators

Per-episode podcast upload automation. Spotify (formerly Anchor / Spotify for Podcasters) does not offer a public API for creator-side operations. This skill drives the `creators.spotify.com` UI via `browser-automate` + CDP attach to your real Chrome session.

If you own the RSS feed instead (self-hosted or Transistor/Buzzsprout/Libsyn/etc.), prefer that path — submit the feed URL to Spotify once and let them auto-ingest. This skill is for when Spotify **is** your RSS source.

## Install

```bash
cd ~/clawd/skills/spotify-creators
pnpm install
pnpm run build
```

Requires `browser-automate` installed at `~/clawd/skills/browser-automate/` (auto-invoked).

## Prerequisites

1. Sign in to `creators.spotify.com` in your daily Chrome. The `browser-automate daemon` seeds from `~/.config/google-chrome/Default` on first start and inherits the session.
2. `browser-automate daemon` — auto-started when you call any `spotify-creators` verb.

## Verbs

### `show-list` — list shows you own

```bash
spotify-creators show-list
```

### `episode-list --show-id <id>`

```bash
spotify-creators episode-list --show-id <id> [--limit 50] [--output episodes.json]
```

### `episode-upload`

```bash
spotify-creators episode-upload \
  --show-id <id> \
  --audio ./full.mp3 \
  --title "Episode 8 - Becoming the Mentor" \
  --description "Assalamu alaikum — this week..." \
  [--description-file ./description.md] \
  [--art ./thumb.jpg] \
  [--publish-date 2026-04-22] \
  [--season 1] [--episode 8] \
  [--episode-type full|trailer|bonus] \
  [--schedule | --draft] \
  [--explicit] \
  [--dry-run]
```

On success: stdout JSON includes `episodeId`, `episodeUrl`, `state` (`published` | `scheduled` | `draft`).

## Output

```json
{
  "ok": true,
  "state": "published",
  "episodeUrl": "https://creators.spotify.com/pod/show/<id>/episode/<epid>",
  "episodeId": "<epid>"
}
```

## How it works

1. Skill shells out to `browser-automate run --recipe-file <temp>.mjs`.
2. Recipe attaches to daemon Chrome via CDP.
3. Recipe navigates to `creators.spotify.com/pod/dashboard/episode/wizard` (tries several URL variants because Spotify has shifted them multiple times).
4. For upload: waits for the file-input selector, uploads MP3, waits for the "Next" button to become enabled, fills title + description + art + episode metadata, then clicks Publish/Schedule/Save-as-draft per flags.
5. Captures the final URL to extract the episode ID.

## Known fragility

- **Selector drift.** Spotify redesigns their upload UI periodically. When selectors break, run with `BROWSER_AUTOMATE_HEADFUL=1` (via daemon config) and watch what the real UI does, then update the selector arrays in `src/cli.ts > writeEpisodeUploadRecipe()`.
- **Error screenshots** saved at `/tmp/browser-automate/spotify-creators-*/<timestamp>/error-*.png` on failure.
- **Metadata fields:** episode-type, season/episode number, explicit toggle — these live behind varying selectors. They'll be attempted; failures are logged to stderr but don't abort the upload. Verify in the UI after.

## Roadmap

- `episode-delete --episode-id`
- `episode-update --episode-id` (change metadata post-publish)
- `show-update` (show-level settings)
- **Direct HTTP** — when we capture the internal endpoints + auth flow, swap from DOM-driving to authenticated HTTP calls. The `bearerCaptured` hook in the recipes is there to grab the token the first time we see it.

## Related

- [[Spotify for Creators API]] — vault-facing doc (verb contract)
- [[Browser Automation for Services Without APIs]] — the general pattern
- [[Suno API]] — identical shape, different service
