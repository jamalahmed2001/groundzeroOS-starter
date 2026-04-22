---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: fal
source_skill_path: ~/clawd/skills/fal/SKILL.md
updated: 2026-04-20
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# fal

> fal.ai API layer — text-to-video, image-to-video, text-to-image, TTS. One CLI, every fal model, multi-account credentials via `~/.credentials/fal-<ref>.env`.

## When a directive should call this

- Generating short video clips (Cartoon Remakes backgrounds, establishing shots, motion passes)
- Generating stills (thumbnails, cover art, scene illustrations)
- Any fal-hosted inference: flux, veo, kling, ltx, wan, imagen, runway, pika, stable-audio, etc.

## When NOT to call this

- Music generation → use `suno` (Suno Pro gives more creative control)
- Podcast TTS → use `elevenlabs-tts` (already wired per-persona)
- Remotion-composed video sequences → use `video-render` (project-specific JSX)

## How to call it

```bash
# Account management
fal account list
fal account add cartoon-remakes --field FAL_KEY=<key>
fal account show cartoon-remakes
fal account remove cartoon-remakes

# Text-to-video (Veo 3 fast)
fal video-gen \
  --model fal-ai/veo3/fast \
  --prompt "<scene description>" \
  --aspect-ratio 16:9 \
  --duration 8 \
  --output-dir ./out/

# Image-to-video (Kling, canonical cartoon-remakes background-motion recipe)
fal video-gen \
  --account-ref cartoon-remakes \
  --model fal-ai/kling-video/v2/master/image-to-video \
  --image ./storyboard/panel-01.png \
  --prompt "<motion description — camera, parallax, wind, etc.>" \
  --aspect-ratio 9:16 --duration 5 \
  --output-dir ./out/

# Async + status polling (for long-running jobs, cron-safe)
fal video-gen --model fal-ai/veo3 --prompt "..." --async
fal status --model fal-ai/veo3 --request-id <id>
fal fetch  --model fal-ai/veo3 --request-id <id> --output-dir ./out/

# Image gen
fal image-gen --model fal-ai/flux-pro/v1.1-ultra --prompt "..." --count 4 --output-dir ./out/

# Per-model quirks: pass arbitrary extra keys via --input-json
fal video-gen --model <any-fal-model> --prompt "..." --input-json /tmp/extra.json
```

## Credentials

Priority when resolving `FAL_KEY`:
1. `--account-ref <ref>` → `~/.credentials/fal-<ref>.env`
2. `FAL_KEY` env var
3. `~/.credentials/fal.env` (default account)

Get a key at https://fal.ai/dashboard/keys. File mode 600.

## Canonical model list (`fal list-models`)

| Kind | Model | Notes |
|---|---|---|
| video | `fal-ai/veo3/fast` | Google Veo 3 fast — 5–8s, 720p, quick |
| video | `fal-ai/veo3` | Veo 3 full — highest quality |
| video | `fal-ai/kling-video/v2/master/text-to-video` | Kling 2.0 t2v |
| video | `fal-ai/kling-video/v2/master/image-to-video` | Kling 2.0 i2v — good for cartoon bg motion |
| video | `fal-ai/minimax/video-01` | MiniMax Hailuo — cinematic |
| video | `fal-ai/ltx-video` | LTX — fast, cheap, lower fidelity |
| video | `fal-ai/wan-25-preview/text-to-video` | Wan 2.5 — open-source, stylized |
| video | `fal-ai/runway-gen3/turbo/image-to-video` | Runway Gen-3 Turbo i2v |
| video | `fal-ai/pika/v1.5/pikaffects` | Pika — stylized motion passes |
| image | `fal-ai/flux-pro/v1.1-ultra` | Flux 1.1 Pro Ultra — photoreal |
| image | `fal-ai/flux/dev` | Flux Dev — fast |
| image | `fal-ai/imagen4` | Google Imagen 4 |
| image | `fal-ai/ideogram/v3` | Ideogram v3 — typography |
| image | `fal-ai/recraft-v3` | Recraft v3 — illustration |
| audio | `fal-ai/elevenlabs/tts/multilingual-v2` | ElevenLabs TTS via fal |
| audio | `fal-ai/stable-audio` | Stable Audio — music/SFX |

Any fal model ID is valid via `--model`; the catalog is a convenience list.

## Queue semantics

- `POST https://queue.fal.run/{model-id}` → `{request_id, status_url, response_url}`
- Poll status until `COMPLETED` or `ERROR`
- Fetch `response_url` for the final payload
- Default timeouts: 20 min for video-gen, 5 min for image-gen (override `--timeout-ms`)

## Output shape

```json
{
  "ok": true,
  "action": "completed",
  "model": "fal-ai/veo3/fast",
  "request_id": "abc-123",
  "video_url": "https://v3.fal.media/.../out.mp4",
  "file_path": "./out/abc-123.mp4",
  "result": { "...model-specific..." }
}
```

## Used by

- **Cartoon Remakes** — `cartoon-animator` directive. Image-to-video for backgrounds, motion passes, establishing shots.
- Future: any project needing ad-hoc video/image generation.

## See also

- [[suno - Skill Overview|suno]] — music generation
- [[elevenlabs-tts - Skill Overview|elevenlabs-tts]] — voice/TTS
- [[remotion-best-practices - Skill Overview|remotion-best-practices]] — compositional video rendering (complement, not competitor)
