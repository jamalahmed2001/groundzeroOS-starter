---
tags: [skill, status-active]
graph_domain: system
status: active
skill_name: suno-generate
source_skill_path: skills/suno-generate/SKILL.md
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# suno-generate

Generate music tracks via Suno through a pluggable HTTP backend. Use from any project that needs music — backing soundbeds, intro/outro stings, full-track album generation. Switches between paid Suno gateways (PiAPI, GoAPI, SunoAPI.org) and self-hosted wrappers via one env var.

## Verbs

| Verb | Purpose |
|---|---|
| `generate` | Submit a prompt + style description, return track URL(s) |
| `download` | Fetch generated track to local disk |
| `library` | List tracks in the configured workspace (browser-mode only) |

## Inputs (generate)

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--prompt <text>` | string | yes | Lyric / theme content |
| `--style <text>` | string | yes | Genre / mood / instrumentation |
| `--output-dir <path>` | path | no | Where to save the resulting track(s) |
| `--instrumental` | flag | no | Music-only, no vocals |
| `--workspace <id>` | string | no | Browser mode: target workspace |

## Output

JSON on stdout with track ID(s) and URLs. On `download`: file path and bytes.

## Provider selection

Set `SUNO_PROVIDER`:
- `browser` (recommended) — drives the operator's paid Suno Pro session via CDP-attached Chrome
- `gateway` — paid SaaS (PiAPI / GoAPI / SunoAPI.org), set `SUNO_API_KEY`
- `selfhosted` — gcui-art/suno-api wrapper, set `SUNO_API_BASE` and `SUNO_COOKIE`

See SKILL.md in `skills/suno-generate/` for full provider config.

## Used by

- audio-production pipelines (music beds for podcast / video / album projects)
- music-production pipelines (full-track album generation)
- launch-ops phases that need stings / promo audio

## Prerequisites

- `node` on PATH
- Provider-specific credential (per `SUNO_PROVIDER`)
- For `browser` mode: a CDP-attached daemon Chrome with the operator logged into Suno Pro

## Forbidden patterns

- Auto-publishing generated tracks. The operator reviews before any track ships.
- Over-running quota — gateway providers have hard limits per day; check before mass-generating.
- Using `gateway` mode for an album project that demands consistent voice/style — browser mode preserves the operator's curated style guides.
