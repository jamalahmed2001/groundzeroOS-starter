---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: instagram-publish
source_skill_path: ~/clawd/skills/instagram-publish/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# instagram-publish

> Publish a Reel via the Instagram Graph API. Instagram fetches from a publicly-accessible video URL — there's no direct file upload.

## When a directive should call this

- Publishing short-form vertical video to an Instagram Business / Creator account
- Reels that should also appear in the main feed (`--share-to-feed`)
- Custom thumbnail (`--cover-url` or `--thumb-offset-ms`)

## When NOT to call this

- Instagram Story posting — different endpoint, not covered by this skill
- Anything needing a direct file upload — use a CDN or pre-upload path; this skill requires a public URL

## How to call it

```bash
~/clawd/skills/instagram-publish/bin/instagram-publish \
  --account-ref example-podcast \
  --video-url https://cdn.example.com/e08-9x16.mp4 \
  --caption-file ./caption.txt \
  --cover-url https://cdn.example.com/e08-thumb.jpg \
  --share-to-feed
```

Emits structured JSON on stdout (success) or stderr (error with classification).

## Credentials

`~/.credentials/instagram-<account-ref>.env` with `INSTAGRAM_IG_USER_ID` (the Business/Creator IGID) + `INSTAGRAM_ACCESS_TOKEN` (long-lived Page token with `instagram_content_publish`). Tokens expire after 60 days — schedule rotation.

## Currently used by

| Project | Directive | Which video(s) |
|---|---|---|
| Example Podcast | `example-distributor` | Reels companion clips |
| Example Cartoon Series | `cartoon-launch-ops` | Every episode as IG Reel (tertiary — carryover audience) |

## See also

- [[youtube-publish - Skill Overview|youtube-publish]]
- [[tiktok-publish - Skill Overview|tiktok-publish]]
