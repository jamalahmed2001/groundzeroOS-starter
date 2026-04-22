---
name: music-distro
description: Music distribution skill with pluggable provider recipes. Upload tracks to streaming services (Spotify, Apple Music, etc.) via distributors like DistroKid, TuneCore, Amuse, RouteNote. No provider has a public upload API for individual artists — this skill drives their UIs via CDP-attached browser automation.
metadata:
  clawdbot:
    emoji: "💿"
    requires: ["node", "browser-automate daemon"]
    credentials: "none at skill level — sign in to your distributor in your daily Chrome or daemon Chrome"
---

# Music Distro

Generic music-release automation. Default provider: DistroKid. Swap via `MUSIC_DISTRO_PROVIDER` env var.

Pattern mirrors `spotify-creators` and `suno` — shell out to `browser-automate` via CDP attach. No API keys, no paid gateways, uses your already-signed-in browser session under your paid distributor account.

## Install

```bash
cd ~/clawd/skills/music-distro
pnpm install
pnpm run build
```

## Prerequisites

1. Sign in to your distributor's website in your daily Chrome. The `browser-automate daemon` seeds from that profile on first start.
2. `browser-automate daemon` auto-starts on first verb call.

## Providers

Select via env:
```bash
export MUSIC_DISTRO_PROVIDER=distrokid  # default
# or: tunecore | amuse | routenote | unitedmasters | ditto
```

Currently implemented: **distrokid**. Other providers are stubs that throw — add a recipe function in `src/cli.ts` to activate each one.

## Verbs

### `release-create` — submit a new single/EP/album

```bash
music-distro release-create \
  --audio ./final-master.mp3 \
  --title "Song Title" \
  --artist "Your Artist Name" \
  --art ./cover.jpg \
  --release-date 2026-05-20 \
  --genre "Electronic" \
  --secondary-genre "Ambient" \
  --language "English" \
  --ai-generated \
  --explicit
```

Defaults:
- `--release-date` — 4 weeks from today (DistroKid's minimum for Spotify editorial pitching + pre-save campaigns).
- `--release-type single` — use `album` or `ep` for multi-track releases.

Safety: the DistroKid recipe **does not** auto-click the final "Confirm & Distribute" button. It fills everything then leaves the wizard open in the daemon Chrome so you can review and submit manually. This prevents accidental release of a half-configured track.

### `album-create` — multi-track album release from a manifest

Distribute a full album (or EP) under ANY artist name. One DistroKid account can ship for multiple artist projects — each run uses the manifest's `artist` field, so you can release as "Scrim Johnson" today and "Delia Cole" tomorrow on the same DK login (requires Musician Plus ~$35/yr or Label tier).

```bash
music-distro album-create --manifest ./album.json
music-distro album-create --manifest ./album.json --dry-run
```

Manifest JSON shape:

```json
{
  "releaseType": "album",
  "title": "Low Light Hours",
  "artist": "Scrim Johnson",
  "art": "/abs/path/cover.jpg",
  "releaseDate": "2026-05-20",
  "genre": "Reggae",
  "secondaryGenre": "Lounge",
  "language": "English",
  "aiGenerated": true,
  "explicit": false,
  "tracks": [
    { "number": 1, "title": "Porch Light Still On",   "audio": "/abs/01.mp3" },
    { "number": 2, "title": "Her Coat, Your Chair",   "audio": "/abs/02.mp3" },
    { "number": 5, "title": "Keep The Kettle On",     "audio": "/abs/05.mp3", "instrumental": true },
    { "number": 9, "title": "First Birds",            "audio": "/abs/09.mp3" }
  ]
}
```

Per-track optional fields: `explicit`, `instrumental`, `featuring: [string]`, `songwriters: [string]`, `isrc`.

Same "stops before Confirm & Distribute" safety as `release-create` — matters even more for albums since a 9-track mistake is expensive to retract. The recipe selectors target DistroKid's album wizard; minor selector drift may need tweaks on first real run.

### `release-list` — list your releases

```bash
music-distro release-list [--limit 50] [--output releases.json]
```

### `release-status --release-id <id>`

```bash
music-distro release-status --release-id <id>
```

## Example flow

```bash
# Generate a song with Suno, download it
suno generate --prompt "warm British piano ballad" --output-dir ./
# Pick a take, master it with your preferred tool
# Generate cover art (midjourney, suno image, etc.)

# Submit to DistroKid
music-distro release-create \
  --audio ./track-01.mp3 \
  --title "Quiet Resolve" \
  --artist "Mani+" \
  --art ./cover-3000x3000.jpg \
  --release-date 2026-05-20 \
  --genre "Alternative" \
  --language "English" \
  --ai-generated

# The daemon Chrome will have the DistroKid wizard open at the review step.
# Open localhost:9222 in another Chrome tab or visually check the daemon window.
# Review, click Confirm & Distribute manually.
```

## Roadmap

- Add provider recipes for TuneCore, Amuse, RouteNote, UnitedMasters, Ditto
- `release-update` — change metadata on live releases
- `release-takedown` — pull a release
- Auto-fill songwriter/producer/featuring credits (currently skipped for safety)
- `--auto-submit` flag that clicks Confirm & Distribute (off by default)

## Related

- [[Music Distribution API]] — vault-facing doc
- [[Browser Automation for Services Without APIs]] — the pattern
- [[Spotify for Creators API]] — sibling skill for podcasts
