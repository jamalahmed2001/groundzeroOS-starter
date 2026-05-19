---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: music-distro
source_skill_path: ~/clawd/skills/music-distro/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# music-distro

> Music release distribution across services without public upload APIs (DistroKid, TuneCore, Amuse, RouteNote, UnitedMasters, Ditto). Pluggable provider via `MUSIC_DISTRO_PROVIDER`. Default: DistroKid.

## When a directive should call this

- Shipping a finished master (Suno or otherwise) to streaming platforms via an indie distributor the user pays for
- Listing or checking status of releases in the distributor's dashboard

## When NOT to call this

- Podcast distribution → `spotify-creators`
- Label/enterprise distribution with a real contract → use the label's provided tools
- Large batch (50+ releases in a week) — distributors throttle this

## How to call it

```bash
export MUSIC_DISTRO_PROVIDER=distrokid   # default; or tunecore, amuse, etc.

music-distro release-create \
  --audio ./mastered.mp3 \
  --title "Quiet Resolve" \
  --artist "Mani+" \
  --art ./cover-3000.jpg \
  --release-date 2026-05-20 \
  --genre "Alternative" \
  --language "English" \
  --ai-generated

music-distro release-list [--limit 50] [--output releases.json]
music-distro release-status --release-id <id>

# Multi-track album release under any artist name — driven by a manifest
music-distro album-create --manifest ./album.json
```

### Album manifest shape

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
    { "number": 1, "title": "Porch Light Still On", "audio": "/abs/01.mp3" },
    { "number": 5, "title": "Keep The Kettle On",   "audio": "/abs/05.mp3", "instrumental": true },
    { "number": 9, "title": "First Birds",          "audio": "/abs/09.mp3" }
  ]
}
```

Per-track optional: `explicit`, `instrumental`, `featuring: [string]`, `songwriters: [string]`, `isrc`.

### Multi-artist distribution

`artist` is per-release (not per-account), so one DistroKid login can ship under multiple artist names — Musician Plus ($35/yr) or Label plan allows unlimited artist profiles. Release "Low Light Hours" as *Scrim Johnson* and "Slow Tide" as *Delia Cole* from the same DK session.

## Safety defaults

- **Does NOT auto-click "Confirm & Distribute"** — fills the form and leaves the wizard open in the daemon Chrome for manual review. Prevents accidental release of misconfigured tracks.
- **Release date** defaults to today + 4 weeks (DistroKid's minimum for Spotify editorial + pre-save).

## Providers

Implemented: **distrokid** ✅
Stubs: tunecore, amuse, routenote, unitedmasters, ditto (add recipe function in `src/cli.ts` to activate)

## Prerequisites

- Signed in to your distributor in daily Chrome (daemon inherits)
- `browser-automate daemon` running (auto-starts)
- Cover art ≥ 3000×3000 (most distributors enforce)
- AI disclosure flag required since 2025 — use `--ai-generated`

See `~/clawd/skills/music-distro/SKILL.md` for full reference.
