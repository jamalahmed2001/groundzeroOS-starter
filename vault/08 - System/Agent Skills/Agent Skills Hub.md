---
tags: [hub-subdomain, status-active]
graph_domain: system
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Agent Skills Hub

> Active skills registered in the ONYX vault. Each skill is a reference document for a capability available to agents. If a capability is covered by the ONYX CLI (`onyx run`, `onyx plan`, `onyx heal`, etc.), it does not get a skill here.

---

## Agent Execution

- [[08 - System/Agent Skills/agent-spawn - Skill Overview.md|agent-spawn]] — Spawn Claude Code or Cursor agent against a repo. Driver selectable per project via `agent_driver` frontmatter.
- [[08 - System/Agent Skills/onyx-controller - Skill Overview.md|onyx-controller]] — Top-level ONYX orchestrator: placement → sync → atomiser → planner → executor → notify.
- [[08 - System/Agent Skills/context-orchestrator - Skill Overview.md|context-orchestrator]] — Generate compact QMD context packets for ONYX phase tasks.

## Integrations

- [[08 - System/Agent Skills/linear-fetch - Skill Overview.md|linear-fetch]] — Fetch Linear projects and issues via GraphQL with deep context.
- [[08 - System/Agent Skills/linear-uplink - Skill Overview.md|linear-uplink]] — Bidirectional sync from vault to Linear (create issues, update states, add comments).
- [[08 - System/Agent Skills/notify-phase - Skill Overview.md|notify-phase]] — Compose and deliver WhatsApp-friendly ONYX run summaries.
- [[08 - System/Agent Skills/notion-context - Skill Overview.md|notion-context]] — Fetch project-scoped context from Notion via REST API.
- [[08 - System/Agent Skills/mailcow-imap - Skill Overview.md|mailcow-imap]] — Check Mailcow email via IMAP (status, list, search).
- [[08 - System/Agent Skills/whatsapp-patch - Skill Overview.md|whatsapp-patch]] — Diagnose and patch OpenClaw WhatsApp "No active listener" bugs.

## Media & Content

- [[08 - System/Agent Skills/whisper-groq - Skill Overview.md|whisper-groq]] — Transcribe audio files using Groq's Whisper API.
- [[08 - System/Agent Skills/remotion-best-practices - Skill Overview.md|remotion-best-practices]] — Best practices for Remotion video creation in React.
- [[08 - System/Agent Skills/suno - Skill Overview.md|suno]] — Music generation via Suno (library, track, download, generate) over CDP-attached Chrome.
- [[08 - System/Agent Skills/fal - Skill Overview.md|fal]] — fal.ai API layer for video / image / audio generation. One CLI, every fal model (Veo, Kling, Flux, etc.), multi-account.

## Distribution

- [[08 - System/Agent Skills/spotify-creators - Skill Overview.md|spotify-creators]] — Upload/list podcast episodes on Spotify for Creators (canonical RSS host).
- [[08 - System/Agent Skills/music-distro - Skill Overview.md|music-distro]] — Ship music releases to DistroKid / TuneCore / Amuse / etc. (pluggable providers).

## Personal & Productivity

- [[08 - System/Agent Skills/plan-my-day - Skill Overview.md|plan-my-day]] — Generate energy-optimized, time-blocked daily plan (ONYX-native).
- [[08 - System/Agent Skills/prayer-times - Skill Overview.md|prayer-times]] — Accurate Islamic prayer times for Preston, UK (ISNA method).
- [[08 - System/Agent Skills/remind-me - Skill Overview.md|remind-me]] — Set reminders delivered via WhatsApp.
- [[08 - System/Agent Skills/fitbit - Skill Overview.md|fitbit]] — Access Fitbit health and activity data from Pixel Watch 3.

## Infrastructure & Tooling

- [[08 - System/Agent Skills/headless-browser - Skill Overview.md|headless-browser]] — Launch and control headless Chrome for screenshots, PDFs, debugging.
- [[08 - System/Agent Skills/browser-automate - Skill Overview.md|browser-automate]] — Generic Playwright engine with per-site recipes (Suno, Spotify for Creators, DistroKid, etc.); CDP daemon mode.
- [[08 - System/Agent Skills/captcha-solve - Skill Overview.md|captcha-solve]] — Detect + solve reCAPTCHA / hCaptcha / Turnstile / Arkose. Multi-provider (2Captcha + HITL human). Always `detect` first — most blocks aren't captchas.
- [[08 - System/Agent Skills/cloudflare-dns-sync - Skill Overview.md|cloudflare-dns-sync]] — Idempotent Cloudflare DNS record upsert (DDNS, static MX/SPF/DMARC).
- [[08 - System/Agent Skills/novnc-control - Skill Overview.md|novnc-control]] — Start/stop/restart noVNC + x11vnc desktop server.
- [[08 - System/Agent Skills/housekeeping - Skill Overview.md|housekeeping]] — Run local cleanup scripts (backups, logs, disk usage, cron sanity checks).
- [[08 - System/Agent Skills/obsidian - Skill Overview.md|obsidian]] — Read, write, search Obsidian vault markdown files directly.
- [[08 - System/Agent Skills/project-health - Skill Overview.md|project-health]] — Run health checks on ONYX setup, trading bot, usage snapshots.

## Utilities

- [[08 - System/Agent Skills/prompt-optimizer - Skill Overview.md|prompt-optimizer]] — Evaluate and optimize prompts using proven prompting techniques.
- [[08 - System/Agent Skills/clawdbot-cost-tracker - Skill Overview.md|clawdbot-cost-tracker]] — Track token usage and estimate API costs across sessions.
- [[08 - System/Agent Skills/image-resize - Skill Overview.md|image-resize]] — Resize / crop / format-convert images.
- [[08 - System/Agent Skills/pdf-extract - Skill Overview.md|pdf-extract]] — Extract text and structure from PDF files.
- [[08 - System/Agent Skills/analytics-pull - Skill Overview.md|analytics-pull]] — Pull per-episode metrics (views, watch time, retention) from YouTube.
- [[08 - System/Agent Skills/video-render - Skill Overview.md|video-render]] — Render video compositions (project-specific Remotion pipelines).
- [[08 - System/Agent Skills/rss-publish - Skill Overview.md|rss-publish]] — Generate / update a podcast RSS feed.xml (iTunes-compatible).
- [[08 - System/Agent Skills/notify - Skill Overview.md|notify]] — Send notification via WhatsApp / email / desktop.

## Native (Claude built-ins, documented for reference)

- [[08 - System/Agent Skills/vault-read - Skill Overview.md|vault-read]] — Built-in `Read` / `Grep` / `Glob` against the vault.
- [[08 - System/Agent Skills/vault-write - Skill Overview.md|vault-write]] — Built-in `Write` / `Edit` against vault markdown.
- [[08 - System/Agent Skills/web-fetch - Skill Overview.md|web-fetch]] — Built-in `WebFetch` for HTTP(S) GETs.
- [[08 - System/Agent Skills/web-search - Skill Overview.md|web-search]] — Built-in `WebSearch` for general queries.

