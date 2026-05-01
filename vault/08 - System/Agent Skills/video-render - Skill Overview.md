---
tool: video-render
type: npm
repo: <home>/clawd/openclaw/projects/my-podcast-agent
script: video:render
free: true
open_source: true
tags: [tool, media, npm]
up: Agent Skills Hub
---

# video-render

> Render a full episode video and short clips from a script using Remotion. Open source, runs locally.

## Invocation

```bash
cd <home>/clawd/openclaw/projects/my-podcast-agent
npm run video:render -- --episode <episode-id>
```

## Inputs

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--episode` | string | yes | Episode ID — must have audio already generated at `output/audio/<id>/` |

## Outputs

```
output/video/<episode-id>/
├── full.mp4           ← 1920×1080 full episode
├── captions.vtt       ← WebVTT captions
└── shorts/
    ├── clip-01.mp4    ← 1080×1920 vertical, 30–90s
    └── ...
```

## Notes

- Requires completed audio (run `tts-generate` first)
- Remotion renders in Node.js — no GPU needed, but expect 2–5 min for a full episode
- Short clip segments are extracted from the `highlight` segments in the script JSON
