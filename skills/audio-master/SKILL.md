---
name: audio-master
description: Master audio to streaming-spec LUFS (two-pass ffmpeg loudnorm) and concatenate multiple mastered files into one with silence gaps. Use when a directive needs podcast/album/narration audio prepared for Spotify, YouTube, Apple Podcasts, etc. One skill, many callers — pass --codec and --target-lufs to tune per platform.
metadata:
  clawdbot:
    emoji: "🔊"
    requires: ["node", "ffmpeg"]
    credentials: "none — reads/writes local files only"
---

# Audio Master

General-purpose audio mastering. Every directive that finishes raw TTS or recorded audio and needs a clean, loudness-normalised output calls this skill.

## Install

```bash
cd ~/clawd/skills/audio-master
pnpm install
pnpm run build
```

Requires `ffmpeg` on PATH.

## Usage

### Master a single file to Spotify-spec (-14 LUFS integrated)

```bash
audio-master master \
  --input ./raw/segment-03.mp3 \
  --output ./out/segment-03.mp3 \
  --target-lufs -14 \
  --true-peak-db -1 \
  --codec mp3
```

Two-pass loudnorm: pass 1 measures integrated loudness/true-peak/LRA/threshold, pass 2 applies normalisation with the measured values for accurate targeting.

### Concatenate multiple mastered files with silence between them

```bash
audio-master concat \
  --inputs "./segments/seg-01.mp3,./segments/seg-02.mp3,./segments/seg-03.mp3" \
  --output ./full.mp3 \
  --gap-ms 500 \
  --codec mp3
```

Re-encodes on concat (not `-c copy`) and inserts a silence file matching the output codec/sample-rate/channels to avoid the "stereo-silence + mono-segments = malformed MP3" bug.

Emits JSON on stdout on success:

```json
{ "ok": true, "op": "master", "path": "./out/segment-03.mp3",
  "measured": { "input_i": "-23.1", "input_tp": "-5.4", "input_lra": "7.3", "input_thresh": "-33.1", "target_offset": "0.15" } }
```

```json
{ "ok": true, "op": "concat", "path": "./full.mp3", "segments": 3, "gap_ms": 500 }
```

## Flags

### `master`

| Flag | Default | Notes |
|---|---|---|
| `--input <path>` | **required** | Source audio file |
| `--output <path>` | **required** | Destination (parent dirs auto-created) |
| `--target-lufs <n>` | `-14` | Spotify/YouTube/Apple default. Broadcast uses -23. |
| `--true-peak-db <n>` | `-1` | dBTP ceiling |
| `--lra <n>` | `11` | Loudness range target (LU) |
| `--sample-rate <hz>` | `44100` | Output sample rate |
| `--codec <mp3\|wav>` | `mp3` | mp3 = libmp3lame 128k mono. wav = PCM 16-bit. |

### `concat`

| Flag | Default | Notes |
|---|---|---|
| `--inputs <a,b,c>` | **required** | Comma-separated paths, in order |
| `--output <path>` | **required** | Destination |
| `--gap-ms <n>` | `500` | Silence duration between segments |
| `--sample-rate <hz>` | `44100` | |
| `--codec <mp3\|wav>` | `mp3` | Must match the format of the input segments for best results |

## Error classification

| exit JSON `error` | Meaning |
|---|---|
| `config` | Bad arguments, missing input files, or `ffmpeg not found on PATH` |
| `upstream` | ffmpeg ran but exited non-zero — content error (unsupported codec, corrupt input, etc.) |
| `unknown` | Unexpected — check stderr |

## Callers

- My Podcast — `my-podcast-audio-producer` (concat ElevenLabs segments → episode MP3)
- My Album — `suno-track-master` (master each generated track to album LUFS)
- My Show — `cartoon-voice-director` (optional: master polished voice lines)

## See also

- `elevenlabs-tts` — upstream TTS that produces the raw segments
- Vault Overview: `08 - System/Agent Skills/audio-master - Skill Overview.md`
