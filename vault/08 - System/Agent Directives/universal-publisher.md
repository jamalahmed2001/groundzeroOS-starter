---
title: Universal Publisher Directive
type: directive
version: 1.0
applies_to: [publishing, distribution, general]
tags: [directive, distribution, publishing, cross-project]
---

## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Universal Publisher Directive

> **Functions:** Publish finished media (audio or video) to one or more platforms using the shared publishing skills. Every directive that distributes content (e.g. podcast episodes, video shorts, music album tracks) — picks what to publish and where; this directive encodes *how* to call the skills safely, handle errors, and write back the resulting URLs.

This directive captures what is executable without human judgment. Creative decisions (which clips to post, what caption to use, when to schedule) are made upstream — this directive only runs the publish calls.

---

## When this directive is used

Set on a phase: `directive: universal-publisher`

Used on phases that:
- Upload a finished video to YouTube, TikTok, or Instagram
- Master raw audio to streaming-spec LUFS before hand-off to audio hosting
- Batch-publish a set of files to multiple platforms on a release day
- Schedule a future-dated publish via `--publish-at`

**Not appropriate for:**
- Platform-specific feed management (e.g. My Podcast's RSS — stays in the project repo, not a shared skill)
- Paid promotion / ads platforms (separate directive needed)
- Anything that needs to *query* existing posts — use analytics directives

---

## What you read first

1. **Project Overview** — voice/safety rules that apply to public-facing content
2. **Project Knowledge** — known platform gotchas (rate limits, format requirements, publishing windows)
3. **The phase file** — the list of files to publish, captions, target platforms, privacy levels
4. **Shared skill docs** (in this vault) — the current flag surface and error codes:
   - [[audio-master - Skill Overview|audio-master]]
   - [[youtube-publish - Skill Overview|youtube-publish]]
   - [[tiktok-publish - Skill Overview|tiktok-publish]]
   - [[instagram-publish - Skill Overview|instagram-publish]]

---

## Functions this agent executes

### 1. Master audio (optional — only if the phase calls for it)

```bash
~/clawd/skills/audio-master/bin/audio-master master \
  --input <raw.mp3> \
  --output <mastered.mp3> \
  --target-lufs -14 \
  --codec mp3
```

- Use `-14 LUFS` for streaming (Spotify, Apple, YouTube).
- Use `-23 LUFS` for broadcast.
- Parse stdout JSON — `path` is the mastered file.

### 2. Upload to YouTube

```bash
~/clawd/skills/youtube-publish/bin/youtube-publish \
  --account-ref <project-account-ref> \
  --video <path.mp4> \
  --title "<title>" \
  --description-file <desc.md> \
  --privacy unlisted \
  --category-id 22 \
  [--thumbnail <thumb.jpg>] \
  [--publish-at <ISO-timestamp>] \
  [--tags "a,b,c"]
```

- Default to `--privacy unlisted` for review before going public. Flip to `public` only when the phase explicitly calls for it.
- `--publish-at` requires `--privacy private` (the skill enforces this).
- Parse stdout — `url` is the YouTube watch URL, `video_id` is the bare ID.

### 3. Upload to TikTok

```bash
~/clawd/skills/tiktok-publish/bin/tiktok-publish \
  --account-ref <project-account-ref> \
  --video <path.mp4> \
  --title "<hook>" \
  --privacy PUBLIC_TO_EVERYONE
```

- Default privacy is `SELF_ONLY` — bump up explicitly per phase intent.
- TikTok is **async** — the initial call returns `publish_id`; the video is processing server-side. If the phase needs to confirm the upload finished, run:
  ```bash
  ~/clawd/skills/tiktok-publish/bin/tiktok-publish \
    --account-ref <ref> --check-status <publish_id>
  ```

### 4. Upload to Instagram Reels

```bash
~/clawd/skills/instagram-publish/bin/instagram-publish \
  --account-ref <project-account-ref> \
  --video-url https://<public-cdn>/<file>.mp4 \
  --caption-file <caption.txt> \
  --share-to-feed
```

- Instagram **fetches the video itself** — it needs a public URL, not a local file. Upload to a CDN first (project-specific step).
- Poll is built into the skill (IN_PROGRESS → FINISHED/ERROR); no manual loop needed.

---

## Credentials

Each skill loads `~/.credentials/<skill>-<account-ref>.env` when `--account-ref` is set; otherwise falls back to `process.env`. **Never** write credentials to any vault file or phase log. If a required env is missing, block with `## Human Requirements` naming the `<skill>-<account-ref>.env` file needed.

---

## Error handling

All publishing skills emit structured JSON errors on stderr. Classify and route as:

| `error` | Meaning | Action |
|---|---|---|
| `config` | Bad args or missing creds | Block — fix phase or add creds |
| `auth` | 401/403 — token expired/revoked | Block — operator must refresh `<ref>.env` |
| `quota` | API daily quota exhausted | Block — note "retry after Pacific midnight" (YouTube) |
| `policy` | Platform rejected the content | Block — surface the message verbatim for review |
| `rate_limit` | 429 | Back off, retry after 1h |
| `upstream` | 5xx | Retry once, then block |
| `timeout` | Instagram processing exceeded deadline | Block — check the video URL is reachable |
| `unknown` | Anything else | Block and escalate |

Non-JSON stderr → the skill itself is broken; block and escalate.

---

## Data access

| Resource | Setup | What it provides |
|---|---|---|
| YouTube Data API v3 | `~/.credentials/youtube-<ref>.env` | Upload + thumbnail set |
| TikTok Content Posting API | `~/.credentials/tiktok-<ref>.env` | Chunked upload |
| Instagram Graph API | `~/.credentials/instagram-<ref>.env` | Container publish |
| ffmpeg | On PATH | Required by `audio-master` |

---

## Output

**Write back to the phase file or linked episode/track note:**

- Paste every resulting `url` (YouTube watch URL, Instagram reel URL, TikTok post URL when available) into the outputs section.
- Record the `<platform>_id` alongside the URL so downstream engagement/analytics directives can find the post.
- If the phase published to multiple platforms, record each in its own row.

**Do not** re-save binaries into the vault — the vault holds links and IDs, not MP4s.

---

## Human handoff — when to block

Block and write `## Human Requirements` when:
- Credentials are missing or expired for a target platform
- A skill returned `error: policy` — operator must review the platform's rejection reason
- A scheduled publish target is in the past (likely a phase-writing bug)
- The phase's privacy level isn't explicitly set (default-to-private is safer — but ambiguity should surface)

Clean run: write ONLY `<!-- None — phase completed successfully -->` in `## Human Requirements`.

---

## Must not do

- Publish to `public` without explicit phase direction. Default to `unlisted` / `SELF_ONLY`.
- Write credentials into any vault file, phase log, or commit message.
- Modify the content being published (titles, captions, descriptions). Creative decisions are upstream — this directive only runs the publish calls.
- Use `--publish-at` without also setting `--privacy private` (YouTube). The skill enforces this but don't try to work around it.
- Auto-retry `policy` errors. Policy rejections need human review, not re-submission.
