# clawd-skills

General-purpose agent skills shipped alongside the ONYX runtime. Each one is the source-of-truth implementation that the matching [Skill Overview](../vault/08%20-%20System/Agent%20Skills/) doc in the vault describes.

These are **not** ONYX-internal skills (which live under [`../skills/`](../skills/) — they're the phase loop itself). They're the capability layer — music generation, publishing, TTS, DNS, comment moderation, RSS, etc. — that agents invoke from inside phase execution.

## Install

The skills expect to be resolved under `~/clawd/skills/<name>/` (that's what every Skill Overview in the vault references). Copy or symlink them in:

```bash
# Copy everything
cp -r clawd-skills/* ~/clawd/skills/

# Or symlink (recommended for development — edit in repo, use from ~/clawd)
mkdir -p ~/clawd/skills
for d in clawd-skills/*/; do
  ln -sfn "$PWD/$d" "$HOME/clawd/skills/$(basename "$d")"
done
```

Then build each one:

```bash
cd ~/clawd/skills/<name>
pnpm install   # or npm install — lockfiles vary by skill
pnpm build     # → dist/cli.js; bin/<name> picks it up automatically
```

Each skill's `bin/<name>` is the entry point; add `~/clawd/skills/*/bin/` to `PATH` if you want to call them as bare commands, otherwise invoke by absolute path.

## Credentials

Skills that need API keys or OAuth tokens read them from one of:

- `$ENV_VAR` set in the calling shell (checked first)
- `~/.credentials/<name>.env` or `~/.credentials/<name>/<account-ref>.env` (multi-account skills)

Each skill's `SKILL.md` documents its exact credential shape. Nothing is committed — copy the `.env.example` if one ships, or follow the per-skill instructions.

## What's here

| Skill | What it does | External dependency |
|---|---|---|
| `audio-master` | FFmpeg-driven loudness normalisation + mastering | ffmpeg |
| `browser-automate` | CDP-attach to a signed-in daemon Chrome; recipe-driven interactions | Chrome |
| `captcha-solve` | 2Captcha-backed solver (image, recaptcha v2/v3, Turnstile) | 2Captcha API key |
| `cloudflare-dns-sync` | DDNS / record upsert via Cloudflare API | CF token |
| `comment-safety-filter` | LLM + rules comment moderation | OpenRouter or equivalent |
| `elevenlabs-tts` | Text-to-speech via ElevenLabs | 11labs API key |
| `fal` | fal.ai image/video model runner | fal API key |
| `headless-browser` | Quick-shot Puppeteer/Playwright screenshots + PDFs | Chrome |
| `housekeeping` | Backup pruning + disk/cache hygiene | — |
| `instagram-publish` | Reels + post uploader via Graph API | Meta Graph API token |
| `music-distro` | Music-release uploader for distributors without public APIs (browser-automate driven; DistroKid implementation initial) | account at the chosen distributor |
| `notion-context` | Pull Notion pages into vault markdown | Notion integration token |
| `obsidian` | Read/write/search Obsidian vaults from outside | — |
| `prompt-optimizer` | LLM prompt rewriter (style, length, structure) | OpenRouter |
| `pubmed-search` | PubMed E-utilities wrapper | — |
| `rss-fetch` | Multi-feed RSS/Atom reader → normalised JSON | — |
| `rss-publish` | Write RSS 2.0 / podcast feed from vault manifests | — |
| `spotify-creators` | Spotify for Creators (anchor) podcast uploader | Spotify Creators login |
| `suno` | Suno music generator + library/persona/workspace CRUD | Suno Pro login |
| `tiktok-publish` | TikTok Creator Studio or Content Posting API uploader | TikTok login / API app |
| `whisper-groq` | Speech-to-text via Groq-hosted Whisper | Groq API key |
| `youtube-comments` | Comment pull / reply via YouTube Data API | Google OAuth |
| `youtube-publish` | Video uploader (Shorts + long-form) | Google OAuth |

## How they slot into ONYX

A directive (e.g. `my-podcast-audio-producer`) invokes a skill by calling its `bin/` entry point. The Skill Overview in the vault is the contract: what flags the directive should pass, what the output JSON looks like, what credentials are required. The vault doc is the "interface"; this directory is the "implementation". If you change the CLI shape here, update the Skill Overview doc in the same PR.

Directives ship under [`../vault/08 - System/Agent Directives/`](../vault/08%20-%20System/Agent%20Directives/) — they're already tracked in this repo.
