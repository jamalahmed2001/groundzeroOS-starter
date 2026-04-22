---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: tiktok-publish
source_skill_path: ~/clawd/skills/tiktok-publish/SKILL.md
updated: 2026-04-17
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# tiktok-publish

> Upload to TikTok, multi-account. Default backend is **browser** (CDP-attach to signed-in Creator Studio) since TikTok's Content Posting API requires app approval that's hard to get. API backend is still available for approved apps.

## When a directive should call this

- Publishing a 9:16 clip to a specific TikTok account
- Draft mode (`--privacy SELF_ONLY`) — safest default, video lands in drafts for human review
- Public mode — requires the TikTok app to be approved for public posting

## When NOT to call this

- Anything requiring a live URL immediately — TikTok processes asynchronously; use status polling
- Cross-posting to other platforms — call the sister skills separately

## How to call it

```bash
# Account management
tiktok-publish account list
tiktok-publish account show <ref>
tiktok-publish account add <ref> --backend browser \
  --field TIKTOK_HANDLE=@your_handle \
  --field TIKTOK_PROFILE_URL=https://www.tiktok.com/@your_handle
tiktok-publish account remove <ref>

# Upload (browser or api backend decided from the env file's BACKEND= line)
~/clawd/skills/tiktok-publish/bin/tiktok-publish \
  --account-ref maniplus \
  --video ./out-9x16.mp4 \
  --title "Episode 8 — 60s preview" \
  --privacy PUBLIC_TO_EVERYONE \
  --cover-timestamp-ms 1500

# API backend only — poll status
~/clawd/skills/tiktok-publish/bin/tiktok-publish \
  --account-ref maniplus \
  --check-status <publish_id>
```

### Adding a new account

**Browser backend (recommended):**
1. Sign in to the target TikTok account in the daemon Chrome (CDP 9222) — `studio.tiktok.com`.
2. `tiktok-publish account add my-channel --backend browser --field TIKTOK_HANDLE=@your_handle --field TIKTOK_PROFILE_URL=https://www.tiktok.com/@your_handle`
3. First upload triggers a sniff of the Creator Studio upload flow; selectors get baked into the recipe.

**API backend (needs approved TikTok Developers app):**
1. Register app at developers.tiktok.com. Request the `video.publish` scope. Wait for approval.
2. OAuth-flow per account → exchange code → get access token.
3. `tiktok-publish account add my-channel --backend api --field TIKTOK_ACCESS_TOKEN=...`

## Credentials

`~/.credentials/tiktok-<ref>.env` (mode 600). `BACKEND=browser|api` plus matching fields. Browser: `TIKTOK_HANDLE`, `TIKTOK_PROFILE_URL`. API: `TIKTOK_ACCESS_TOKEN`.

## Currently used by

| Project | Directive | Which video(s) |
|---|---|---|
| ManiPlus | `maniplus-distributor` | Short clips from each episode |

## See also

- [[youtube-publish - Skill Overview|youtube-publish]]
- [[instagram-publish - Skill Overview|instagram-publish]]
