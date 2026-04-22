---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: youtube-publish
source_skill_path: ~/clawd/skills/youtube-publish/SKILL.md
updated: 2026-04-17
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# youtube-publish

> Upload a video to YouTube (Shorts or long-form). One skill, many channels — the channel is picked by `--account-ref`.

## When a directive should call this

- Publishing a rendered video (pilot, episode, short, ad, promo) to a specific YouTube channel
- Scheduling a release for a future timestamp
- Replacing an existing per-project YouTube uploader with a shared connector

## When NOT to call this

- TikTok / Instagram uploads → use the respective sister skills
- Live streaming → different API path; out of scope here
- Anything that needs to *query* existing video stats → use `youtube-analytics` (future)

## How to call it

```bash
# Account management
youtube-publish account list
youtube-publish account show <ref>
youtube-publish account add <ref> --backend api|browser \
  --field YOUTUBE_CLIENT_ID=... --field YOUTUBE_CLIENT_SECRET=... \
  --field YOUTUBE_REFRESH_TOKEN=... --field YOUTUBE_CHANNEL_ID=UC...
youtube-publish account remove <ref>

# Upload
~/clawd/skills/youtube-publish/bin/youtube-publish \
  --account-ref maniplus \
  --video ./out.mp4 \
  --title "Episode 8" \
  --description-file ./desc.md \
  --privacy unlisted \
  --publish-at "2026-04-22T09:00:00Z"
```

### Adding a new channel

1. **Create a Google Cloud project** (reusable across all your channels): enable YouTube Data API v3, create OAuth 2.0 client (Desktop app type).
2. **Generate a refresh token** for the target channel — log in as the channel's owner, authorize scope `https://www.googleapis.com/auth/youtube.upload` (plus `youtube.readonly` for channel ID lookup). Save the refresh token.
3. `youtube-publish account add my-channel --backend api \\
     --field YOUTUBE_CLIENT_ID=... --field YOUTUBE_CLIENT_SECRET=... \\
     --field YOUTUBE_REFRESH_TOKEN=... --field YOUTUBE_CHANNEL_ID=UC...`
4. Test: `youtube-publish --account-ref my-channel --video ./test.mp4 --title Test --privacy private`
5. Delete the test video from the channel when done.

Emits structured JSON on stdout (success) or stderr (error with classification).

## Credentials

`~/.credentials/youtube-<account-ref>.env` with `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, and optional `YOUTUBE_CHANNEL_ID`. OAuth refresh-token grants long-lived access; rotate when keys are revoked.

## Currently used by

| Project | Directive | Which video(s) |
|---|---|---|
| ManiPlus | `maniplus-distributor` | Long-form episode + Short |

## See also

- [[tiktok-publish - Skill Overview|tiktok-publish]] — same video, TikTok side
- [[instagram-publish - Skill Overview|instagram-publish]] — same video, Reels side
