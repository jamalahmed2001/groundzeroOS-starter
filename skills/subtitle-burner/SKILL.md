---
name: subtitle-burner
description: Take a video + per-segment script lines, transcribe via Whisper for word-level timestamps, generate styled ASS subtitles, and burn them into the video via ffmpeg. Default style is TikTok-friendly (large pop-in chunks, speaker chips); pass --style alt to use the alternate compact style. Use from video-production directives that need on-screen captions.
metadata:
  clawdbot:
    emoji: "📝"
    requires: ["bun", "ffmpeg", "fal skill"]
    credentials: "FAL_KEY (Whisper-via-fal) via fal skill credentials"
---

# subtitle-burner

Burn-in subtitles for finished videos. Three steps:

1. Transcribe the video's audio with word-level timestamps (Whisper-via-fal).
2. If a `scripts.json` is provided, align the spoken script to the Whisper timestamps (more accurate than raw transcript).
3. Chunk into display-sized blocks, render to ASS, burn into the video via ffmpeg subtitle filter.

## When to use

- A finished short-form video needs captions for accessibility / engagement.
- Captions need to be *burned in* (always-visible) — for social platforms that don't display sidecar SRT/VTT, or for export to platforms that re-encode and may lose softsubs.
- The script is known per-segment (cleaner alignment than transcribing fresh).

## Not when

- The platform supports softsubs and you don't need the visual treatment — emit SRT directly via `whisper-groq` and let the platform render.
- Live-recorded interview / unscripted dialogue without per-line scripts — `whisper-groq` for raw transcription is closer to the right tool.

## Install

```bash
cd ~/clawd/skills/subtitle-burner
# nothing to install; bun runs the .ts files directly
```

Requires: `bun` and `ffmpeg` on PATH, and the `fal` skill installed at the standard sibling path.

## Credentials

Inherits from `fal` skill — set `FAL_KEY` in the fal account file.

## Usage

```bash
~/clawd/skills/subtitle-burner/bin/subtitle-burner \
  --video ./input.mp4 \
  --output ./output.mp4 \
  --scripts ./scripts.json \
  --aspect 9:16 \
  --style default \
  --chunk-size 3 \
  --pop-in-ms 100 \
  --end-pad-ms 120
```

`scripts.json` shape:

```json
[
  { "text": "First spoken line", "speaker": "narrator", "audioPath": "./seg-01.mp3" },
  { "text": "Second spoken line", "speaker": "alice", "audioPath": "./seg-02.mp3" }
]
```

Flags:

| Flag | Default | Notes |
|---|---|---|
| `--video <path>` | **required** | Source video file |
| `--output <path>` | **required** | Destination file (parent dirs auto-created) |
| `--scripts <path>` | none | Optional per-segment script JSON for accurate alignment |
| `--aspect <ratio>` | source | Optional aspect ratio override (e.g. `9:16`, `16:9`) |
| `--style <name>` | `default` | `default` (TikTok-style chunks + speaker chips) or `alt` (compact, no chips) |
| `--chunk-size <n>` | 3 | Words per displayed chunk |
| `--pop-in-ms <n>` | 100 | Per-chunk fade-in duration |
| `--end-pad-ms <n>` | 120 | Hold duration after last chunk |
| `--no-speaker-chip` | off | Suppress speaker name chips even with default style |

## Outputs

The burned-in video at `--output`. Intermediate ASS file at `<output>.ass` (kept for diff / reuse).

## Forbidden patterns

- Editing the script content during alignment to "fix" mismatches with the transcript. Whisper transcript drift is the reason the alignment step exists; don't reach into the script.
- Burning subs onto a video that hasn't been mastered yet — final-pass loudness changes can shift word boundaries slightly. Master the audio first; transcribe and burn against the final.
- Using `--style default` for non-TikTok platforms — the chunk style and speaker chips are short-form-vertical-friendly. Use `--style alt` for landscape / longform.
