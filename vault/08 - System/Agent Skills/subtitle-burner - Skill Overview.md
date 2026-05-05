---
tags: [skill, status-active]
graph_domain: system
status: active
skill_name: subtitle-burner
source_skill_path: skills/subtitle-burner/SKILL.md
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# subtitle-burner

Take a finished video + per-segment script lines, transcribe with word-level timestamps via Whisper-via-fal, generate styled ASS subtitles, burn into the video via ffmpeg. Default style is short-form-vertical-friendly (TikTok-style chunks + speaker chips); `alt` style is compact for landscape / longform.

## Verbs

| Bin | Purpose |
|---|---|
| `bin/subtitle-burner` | Transcribe → align → chunk → ASS → ffmpeg burn |

## Inputs

| Flag | Default | Notes |
|---|---|---|
| `--video <path>` | required | Source video |
| `--output <path>` | required | Destination video |
| `--scripts <path>` | none | Per-segment script JSON for accurate alignment |
| `--aspect <ratio>` | source | `9:16`, `16:9`, `1:1`, etc. |
| `--style <name>` | `default` | `default` (TikTok chunks + speaker chips) or `alt` (compact) |
| `--chunk-size <n>` | 3 | Words per displayed chunk |
| `--pop-in-ms <n>` | 100 | Per-chunk fade-in |
| `--end-pad-ms <n>` | 120 | Hold after last chunk |
| `--no-speaker-chip` | off | Suppress speaker chips |

## Scripts JSON shape

```json
[
  { "text": "First spoken line", "speaker": "narrator", "audioPath": "./seg-01.mp3" },
  { "text": "Second spoken line", "speaker": "alice",    "audioPath": "./seg-02.mp3" }
]
```

## Output

Burned-in video at `--output`. Intermediate ASS file at `<output>.ass`.

## Used by

- my-show pipelines that ship short-form vertical content (TikTok / Reels / Shorts)
- audio-production pipelines that ship a video version of a podcast episode

## Prerequisites

- `bun` on PATH
- `ffmpeg` on PATH
- `fal` skill installed + `FAL_KEY` configured (Whisper-via-fal for transcription)

## Forbidden patterns

- Editing script content during alignment to "fix" mismatches with the transcript.
- Burning subs onto a video before the audio is finally mastered (word boundaries can shift after a final loudnorm pass).
- Using `default` style for landscape / longform — chunk style is short-form-vertical-friendly. Use `alt` for landscape.
