---
name: instagram-publish
description: Publish a video to Instagram as a Reel via the Graph API. Instagram fetches the video from a public URL — you don't upload the file directly. Use when a directive publishes short-form video to an Instagram Business / Creator account. One skill, many accounts — pass --account-ref to pick the credential set.
metadata:
  clawdbot:
    emoji: "📸"
    requires: ["node"]
    credentials: "~/.credentials/instagram-<account-ref>.env — INSTAGRAM_IG_USER_ID + INSTAGRAM_ACCESS_TOKEN"
---

# Instagram Publish

Publishes a video to Instagram as a Reel. Three-phase flow: (1) create media container pointing at a publicly-accessible video URL, (2) poll until Instagram finishes ingesting, (3) publish. Returns the live media ID + URL.

## Install

```bash
cd ~/clawd/skills/instagram-publish
pnpm install
pnpm run build
```

## Credentials

One `.env` file per IG Business account at `~/.credentials/instagram-<account-ref>.env`:

```
INSTAGRAM_IG_USER_ID=17841405309211844     # the IGID of the Business / Creator account
INSTAGRAM_ACCESS_TOKEN=EAAG...             # long-lived Page access token with instagram_content_publish scope
```

Required Facebook app setup (one-time):
1. Create a Facebook Developer app (Business type)
2. Add the Instagram Graph API product
3. Link the target Instagram Professional account
4. Request + get approved for `instagram_basic` + `instagram_content_publish` permissions
5. Exchange a short-lived user token for a long-lived (60-day) Page token

## Usage

### Publish a Reel

```bash
instagram-publish \
  --account-ref maniplus \
  --video-url "https://cdn.your-host.com/e08-9x16.mp4" \
  --caption-file ./caption.txt \
  --cover-url "https://cdn.your-host.com/e08-thumb.jpg" \
  --share-to-feed
```

Emits:

```json
{
  "ok": true,
  "platform": "instagram",
  "container_id": "17920...",
  "media_id": "18123...",
  "url": "https://www.instagram.com/reel/18123.../"
}
```

## Key constraint — video URL

Instagram Graph API **does not accept uploads**. The `--video-url` must be a publicly-accessible URL that Instagram's servers can GET. Typical hosts:

- S3 / R2 / GCS signed URL with ≥ 5-minute validity
- A CDN you control
- Pre-upload to your own `/tmp-public/` web server

The URL must remain available during the poll window (default 5 min).

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--account-ref <ref>` | env fallback | `~/.credentials/instagram-<ref>.env` |
| `--video-url <url>` | **required** | Publicly-accessible MP4 URL |
| `--caption <string>` | — | Inline caption |
| `--caption-file <path>` | — | Read caption from file |
| `--cover-url <url>` | — | Custom cover image URL |
| `--thumb-offset-ms <n>` | — | Alternative: pick a frame from the video at this offset |
| `--share-to-feed` | `false` | Also surface the Reel in the main feed |
| `--poll-interval-ms <n>` | `5000` | How often to check container status |
| `--poll-timeout-ms <n>` | `300000` | Total wait before giving up |

## Error classification

| `error` | Meaning |
|---|---|
| `auth` | 401/403 — expired or insufficient token (`190` Instagram-specific) |
| `policy` | Container ended in ERROR/EXPIRED (Instagram rejected content) |
| `timeout` | Container didn't reach FINISHED within poll budget |
| `rate_limit` | 429 / error codes 4, 17 (app rate limits) |
| `upstream` | Graph API 5xx |
| `config` | Bad args or missing creds |

## Callers

- ManiPlus — `maniplus-distributor` (Reels companion clips)
- Cartoon Remakes — `cartoon-launch-ops` (every episode as IG Reel)

## Known quirks

- Long-lived Page tokens expire after 60 days. Build a refresh cadence.
- Business accounts publishing > ~25 posts per 24h hit rate limits. Commercial cadence usually stays well under this.
- The Reel URL is a best-effort guess (`/reel/<media_id>/`) — it works in most cases but Instagram sometimes uses `/p/<shortcode>/`. Use the Graph API to fetch the canonical shortcode if needed.

## See also

- `youtube-publish`, `tiktok-publish` — companion publishers for the same video
