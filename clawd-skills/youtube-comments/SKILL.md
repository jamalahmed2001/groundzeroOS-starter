---
name: youtube-comments
description: Fetch top-level comment threads for a YouTube video (API key) and post replies (OAuth2). Pass --account-ref to pick the credential set for the target channel. Used by directives that run community engagement — fetch → filter → approve → reply.
metadata:
  clawdbot:
    emoji: "💬"
    requires: ["node"]
    credentials: "~/.credentials/youtube-<account-ref>.env — YOUTUBE_API_KEY (read) and YOUTUBE_CLIENT_ID/_SECRET/_REFRESH_TOKEN (post)"
---

# YouTube Comments

General-purpose YouTube comment fetcher + reply poster. Every directive that does community engagement on YouTube calls this skill.

## Install

```bash
cd ~/clawd/skills/youtube-comments
pnpm install
pnpm run build
```

## Credentials

Same `~/.credentials/youtube-<account-ref>.env` file as `youtube-publish`, but requires `YOUTUBE_API_KEY` additionally for read access:

```
YOUTUBE_API_KEY=...            # required for --video-id (read)
YOUTUBE_CLIENT_ID=...          # required for --post-reply
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...      # scope: youtube.force-ssl
```

## Usage

### Fetch comments

```bash
youtube-comments \
  --account-ref maniplus \
  --video-id dQw4w9WgXcQ \
  --max 50 \
  --since "2026-04-10T00:00:00Z" \
  --output comments.json
```

Writes an array of `{id, author, text, timestamp, likeCount}` to the output file. Without `--output`, the comments are included inline in the stdout JSON.

### Post a reply

```bash
youtube-comments \
  --account-ref maniplus \
  --post-reply \
  --comment-id UgkxXXXXXX \
  --text "Thank you for sharing!"
```

Emits `{ok: true, op: "post-reply", reply_id, parent_id, text}` on success.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--account-ref <ref>` | (falls back to process.env) | Loads `~/.credentials/youtube-<ref>.env` |
| `--video-id <id>` | — | Required for fetch mode |
| `--max <n>` | `100` | Total cap (paginates up to this many) |
| `--since <ISO>` | — | Excludes comments older than the ISO timestamp |
| `--output <path>` | — | Write comments JSON to this file (otherwise inline in stdout) |
| `--post-reply` | — | Switch to post-reply mode |
| `--comment-id <id>` | — | Required with `--post-reply` |
| `--text <string>` | — | Required with `--post-reply` |

## Error classification

| `error` | Meaning |
|---|---|
| `auth` | 401/403 — bad API key or expired OAuth token |
| `quota` | YouTube daily quota exhausted |
| `rate_limit` | 429 — back off and retry |
| `upstream` | 5xx |
| `policy` | 400/422 — rejected by content rules |
| `config` | Bad args or missing creds |

## Callers

- ManiPlus — `universal-engagement` (replaces the per-project `engage:fetch` and `engage:post` scripts)
- Cartoon Remakes — `cartoon-engagement-manager` (when that directive wires through)

## See also

- `comment-safety-filter` — the downstream skill every reply flow pipes through
- `youtube-publish` — shares the credential file; same `--account-ref` convention
- Vault Overview: `08 - System/Agent Skills/youtube-comments - Skill Overview.md`
