# fal

fal.ai API skill — text-to-video, image-to-video, text-to-image, TTS, etc.
One CLI, many models. Queue-based API (official), multi-account credential support.

## Install

```bash
cd ~/clawd/skills/fal
npm install
npm run build
```

## Credentials

`~/.credentials/fal-<ref>.env` with `FAL_KEY=...` (get from https://fal.ai/dashboard/keys).

Priority order when resolving:
1. `--account-ref <ref>` → `~/.credentials/fal-<ref>.env`
2. `FAL_KEY` env var
3. `~/.credentials/fal.env` (default account)

## Usage

```bash
# Account management
fal account list
fal account add my-show --field FAL_KEY=sk-...
fal account show my-show
fal account remove my-show

# Video generation (text-to-video via Veo 3 fast)
fal video-gen \
  --model fal-ai/veo3/fast \
  --prompt "A cat walking through a cyberpunk city at night" \
  --aspect-ratio 16:9 \
  --duration 8 \
  --output-dir ./out/

# Image-to-video (Kling, My Show pipeline — background motion passes)
fal video-gen \
  --account-ref my-show \
  --model fal-ai/kling-video/v2/master/image-to-video \
  --image ./storyboard-panel-01.png \
  --prompt "camera slowly pushes in; subtle wind on leaves" \
  --aspect-ratio 9:16 \
  --duration 5 \
  --output-dir ./out/

# Async mode — return immediately; poll status later
fal video-gen --model fal-ai/veo3 --prompt "..." --async
# → returns { request_id, status_url }
fal status --model fal-ai/veo3 --request-id <id>
fal fetch --model fal-ai/veo3 --request-id <id> --output-dir ./out/

# Image gen
fal image-gen --model fal-ai/flux-pro/v1.1-ultra --prompt "..." --count 4 --output-dir ./out/

# Per-model quirks: pass extra JSON keys via --input-json
echo '{"negative_prompt":"blurry, low-quality","strength":0.7}' > /tmp/extra.json
fal video-gen --model fal-ai/some-model --prompt "..." --input-json /tmp/extra.json
```

## Model catalog (via `fal list-models`)

Video: `fal-ai/veo3/fast`, `fal-ai/veo3`, `fal-ai/kling-video/v2/master/{text,image}-to-video`,
`fal-ai/minimax/video-01`, `fal-ai/ltx-video`, `fal-ai/wan-25-preview/text-to-video`,
`fal-ai/runway-gen3/turbo/image-to-video`, `fal-ai/pika/v1.5/pikaffects`.

Image: `fal-ai/flux-pro/v1.1-ultra`, `fal-ai/flux/dev`, `fal-ai/imagen4`, `fal-ai/ideogram/v3`,
`fal-ai/recraft-v3`.

Audio: `fal-ai/elevenlabs/tts/multilingual-v2`, `fal-ai/stable-audio`.

Any fal model ID works — the catalog is just a curated convenience list.

## Output shape

```json
{
  "ok": true,
  "action": "completed",
  "model": "fal-ai/veo3/fast",
  "request_id": "abc-123",
  "video_url": "https://v3.fal.media/.../out.mp4",
  "file_path": "./out/abc-123.mp4",
  "result": { "...model-specific payload..." }
}
```

## Queue semantics

fal's queue:
- POST to `https://queue.fal.run/{model-id}` → returns `{request_id, status_url, response_url}`
- Status polled until `COMPLETED` (or `ERROR`)
- Final result fetched from `response_url`
- Default timeout 20 min for video (override `--timeout-ms`), 5 min for image

## Error classification

`config` — missing key / args · `upstream` — fal 5xx · `rate_limit` — 429 · `policy` — 422 content flag ·
`timeout` — queue exceeded `--timeout-ms`.
