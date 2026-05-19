---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: youtube-comments
source_skill_path: ~/clawd/skills/youtube-comments/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# youtube-comments

> Fetch top-level comment threads (API key) and post replies (OAuth2) for a specific YouTube video. One skill, many channels — the channel is picked by `--account-ref`.

## When a directive should call this

- Reading recent comments on a published video for engagement triage
- Posting an approved reply to a specific comment (after human approval phase)
- Migrating a project off a per-project `engage:fetch` / `engage:post` script to the shared skill

## When NOT to call this

- Fetching video statistics (views/likes) → use `youtube-analytics` (future)
- Moderating comments (hide/delete) → different API scope, separate skill needed
- Fetching comments from many videos at once → call this once per video; orchestration is directive-level

## How to call it

```bash
# Fetch
~/clawd/skills/youtube-comments/bin/youtube-comments \
  --account-ref example-podcast \
  --video-id <id> \
  --since "2026-04-10T00:00:00Z" \
  --output comments.json

# Post reply
~/clawd/skills/youtube-comments/bin/youtube-comments \
  --account-ref example-podcast \
  --post-reply \
  --comment-id <parent> \
  --text "Thanks for the feedback!"
```

Emits structured JSON on stdout (success) or stderr (error with classification).

## Credentials

`~/.credentials/youtube-<account-ref>.env` with:
- `YOUTUBE_API_KEY` — for read-only fetch
- `YOUTUBE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` — for reply post (scope: `youtube.force-ssl`)

## Currently used by

| Project | Directive | What it does |
|---|---|---|
| Example Podcast | `universal-engagement` | Fetch comments, post approved replies |
| Example Cartoon Series | `cartoon-engagement-manager` (when wired) | Same |

## See also

- [[comment-safety-filter - Skill Overview|comment-safety-filter]] — the downstream skill every reply flow pipes through
- [[youtube-publish - Skill Overview|youtube-publish]] — shares the credential file
