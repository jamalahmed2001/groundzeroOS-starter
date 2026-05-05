---
name: tiktok-publish
description: Upload a video file to TikTok via the Content Posting API (FILE_UPLOAD flow). Use when a directive publishes short-form video to a TikTok account. Supports scheduled publish, privacy control, comment/duet/stitch lockdown. One skill, many accounts — pass --account-ref to pick the credential set.
metadata:
  clawdbot:
    emoji: "🎵"
    requires: ["node"]
    credentials: "~/.credentials/tiktok-<account-ref>.env — TIKTOK_ACCESS_TOKEN"
---

# TikTok Publish

Uploads a video to TikTok's Content Posting API. Because TikTok processes videos asynchronously, this skill returns a `publish_id` — not a "live" URL. Poll the status endpoint with `--check-status <publish-id>` until TikTok reports `PUBLISH_COMPLETE`.

## Install

```bash
cd ~/clawd/skills/tiktok-publish
pnpm install
pnpm run build
```

## Credentials

One `.env` file per TikTok account at `~/.credentials/tiktok-<account-ref>.env`:

```
TIKTOK_ACCESS_TOKEN=act.xxxxxxxxxxxxxxxxx
```

Access tokens expire — refresh via your TikTok OAuth flow (the token should come from the Content Posting scope `video.publish`).

## Usage

### Upload

```bash
tiktok-publish \
  --account-ref my-podcast \
  --video ./output/E08-9x16.mp4 \
  --title "A New Beginning — what surviving a transplant really looks like" \
  --privacy PUBLIC_TO_EVERYONE \
  --cover-timestamp-ms 1500
```

Emits:

```json
{
  "ok": true,
  "platform": "tiktok",
  "publish_id": "v_pub_url~abc123",
  "title": "…",
  "privacy": "PUBLIC_TO_EVERYONE",
  "note": "TikTok processes asynchronously. Use --check-status <publish_id> to poll."
}
```

### Check status (polling)

```bash
tiktok-publish --account-ref my-podcast --check-status v_pub_url~abc123
```

Status will progress: `PROCESSING_UPLOAD` → `SEND_TO_USER_INBOX` → `PUBLISH_COMPLETE`.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--account-ref <ref>` | env fallback | `~/.credentials/tiktok-<ref>.env` |
| `--video <path>` | **required** | Video file (MP4, H.264, ≤4 GB per API) |
| `--title <string>` | **required** | Caption + hashtags |
| `--privacy <level>` | `SELF_ONLY` | `PUBLIC_TO_EVERYONE` / `MUTUAL_FOLLOW_FRIENDS` / `FOLLOWER_OF_CREATOR` / `SELF_ONLY` |
| `--disable-duet` | `false` | Turn off Duet |
| `--disable-comment` | `false` | Turn off comments |
| `--disable-stitch` | `false` | Turn off Stitch |
| `--cover-timestamp-ms <n>` | `1000` | Frame used for the thumbnail |
| `--chunk-size <bytes>` | `5MB` | Upload chunk size (5–64 MB) |
| `--check-status <id>` | — | Fetch publish status instead of uploading |

### Privacy levels — key behaviour

- **`PUBLIC_TO_EVERYONE`** — live on your profile immediately (after async processing)
- **`SELF_ONLY`** — uploads to your drafts; you publish manually from the TikTok app (safest for first-pass / review gate)
- **`MUTUAL_FOLLOW_FRIENDS`** / **`FOLLOWER_OF_CREATOR`** — social-graph restricted

Unauthorised apps (not approved for public-posting) are forced to `SELF_ONLY` by TikTok regardless of this flag.

## Error classification

| `error` | Meaning |
|---|---|
| `auth` | 401/403 — token expired or missing scope |
| `policy` | TikTok rejected the post (title / privacy / content rule) |
| `rate_limit` | 429 |
| `upstream` | TikTok 5xx |
| `config` | Bad arguments / missing creds |

## Callers

- My Podcast — `my-podcast-distributor` (short clips per episode)
- My Show — `cartoon-launch-ops` (every episode as primary TikTok post)

## See also

- `youtube-publish`, `instagram-publish` — companion skills
- TikTok API reference: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
