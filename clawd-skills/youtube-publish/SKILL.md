---
name: youtube-publish
description: Upload a video file to YouTube (Shorts or long-form) with metadata, thumbnail, and optional scheduled-publish time. Use when a directive needs to publish video content to a YouTube channel. One skill, many channels — pass --account-ref to pick the credential set for the target channel.
metadata:
  clawdbot:
    emoji: "📺"
    requires: ["node"]
    credentials: "~/.credentials/youtube-<account-ref>.env — YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN / _CHANNEL_ID"
---

# YouTube Publish

General-purpose YouTube uploader. Every directive that publishes to YouTube (ManiPlus podcast episodes, Cartoon Remakes shorts, any future video project) calls this skill — passing its own channel's `--account-ref` and the video file to upload.

## Install

```bash
cd ~/clawd/skills/youtube-publish
pnpm install
pnpm run build
```

## Credentials

One `.env` file per YouTube channel at `~/.credentials/youtube-<account-ref>.env`:

```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_CHANNEL_ID=...        # optional — used for cross-check
```

You get these from:
1. Google Cloud Console → create an OAuth2 desktop client
2. One-time auth flow (e.g. `youtube-oauth` script, or Google's Playground) to get a refresh token scoped `https://www.googleapis.com/auth/youtube.upload`

## Usage

### Upload now (publish immediately as private → review → flip to public)

```bash
youtube-publish \
  --account-ref maniplus \
  --video ./output/E08.mp4 \
  --title "A New Beginning — Episode 8" \
  --description-file ./output/E08-description.md \
  --thumbnail ./output/E08-thumb.png \
  --category-id 22 \
  --privacy unlisted \
  --tags "health,kidney,transplant"
```

### Schedule for a specific time

```bash
youtube-publish \
  --account-ref maniplus \
  --video ./out.mp4 \
  --title "..." \
  --publish-at "2026-04-22T09:00:00Z"
```

When `--publish-at` is set, privacy auto-sets to `private` (required by the API for scheduled publishing) and YouTube flips it public at the given time.

Emits JSON on stdout on success:

```json
{
  "ok": true,
  "platform": "youtube",
  "video_id": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "channel_id": "UC123…",
  "title": "A New Beginning — Episode 8",
  "privacy": "unlisted",
  "scheduled": null
}
```

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--account-ref <ref>` | (falls back to process.env) | Loads `~/.credentials/youtube-<ref>.env` |
| `--video <path>` | **required** | Video file to upload |
| `--title <string>` | **required** | Title (up to 100 chars) |
| `--description <str>` | `""` | Inline description (use `--description-file` for long content) |
| `--description-file <path>` | — | Read description from a file (markdown is fine; YouTube strips it) |
| `--tags <a,b,c>` | — | Comma-separated |
| `--category-id <id>` | `22` | YouTube category (22 = People & Blogs; 24 = Entertainment; 28 = Science & Tech) |
| `--privacy <p>` | `private` | `public` / `private` / `unlisted` |
| `--publish-at <iso>` | — | ISO timestamp for scheduled publishing (auto-sets privacy to private) |
| `--thumbnail <path>` | — | Thumbnail image (JPG/PNG, ≤2MB) — uploaded separately |
| `--made-for-kids` | `false` | COPPA compliance flag |

## Error classification

| exit JSON `error` | Meaning |
|---|---|
| `auth` | 401/403 — bad or expired refresh token |
| `quota` | API quota exhausted (resets daily) |
| `policy` | YouTube rejected the upload (title/content rules) |
| `rate_limit` | 429 — back off + retry |
| `upstream` | YouTube 5xx |
| `config` | Bad arguments or missing creds |

## Callers

- ManiPlus — `maniplus-distributor` (publish episode long-form)
- Cartoon Remakes — `cartoon-launch-ops` (publish Shorts)

## See also

- `tiktok-publish`, `instagram-publish` — companion skills; same `--video` + metadata shape
- Vault Overview: `08 - System/Agent Skills/youtube-publish - Skill Overview.md`
