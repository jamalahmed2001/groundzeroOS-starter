---
name: elevenlabs-tts
description: Synthesize speech audio from text using ElevenLabs. Use when a directive needs to turn written script segments into MP3/WAV for podcasts, cartoon voice tracks, narration, or any voiced content. Accepts voice ID, model, and voice settings per call so multiple personas/characters can share one skill.
metadata:
  clawdbot:
    emoji: "🗣️"
    requires: ["node"]
    credentials: "ELEVENLABS_API_KEY env (or ~/.credentials/elevenlabs/<account-ref>.env)"
---

# ElevenLabs TTS

General-purpose text-to-speech connector. One binary, many voices. Each caller supplies its own voice ID + voice settings, so My Podcast's podcast voice, My Show's character voices, and any future narration project share one implementation.

## When to use

- A phase needs to produce a voice track from text (episode script segment, character line, narration).
- You already know which **voice ID** and **model** to use — typically declared on the project's profile or per-character in a Character Bible.

## Not when

- You need music or sound effects — this is speech only. Use `suno-generate` for music, Epidemic/Artlist for SFX.
- The text contains SSML pronunciation markup — apply pronunciation substitutions *before* calling this skill (it doesn't know about your project's pronunciation dict).
- You want a transcript *of* audio — use `whisper-groq` for speech-to-text.

## Install

```bash
cd ~/clawd/skills/elevenlabs-tts
pnpm install
```

## Credentials

Set `ELEVENLABS_API_KEY` in the caller's environment. Commercial use requires the Pro/Premier tier — `ELEVENLABS_COMMERCIAL_TIER=true` is an optional self-attest flag the skill will record in output metadata (not enforced).

## Usage

### Single text → single file

```bash
elevenlabs-tts \
  --text "Assalamu alaikum, welcome back." \
  --voice-id "<voice-id>" \
  --model-id "eleven_multilingual_v2" \
  --stability 0.5 \
  --similarity-boost 0.75 \
  --output ./out.mp3
```

Emits JSON on stdout:

```json
{
  "ok": true,
  "outputs": ["./out.mp3"],
  "voice_id": "<voice-id>",
  "model_id": "eleven_multilingual_v2",
  "total_chars": 33,
  "bytes": 48192
}
```

Exit code: 0 on success, non-zero with a JSON error on stderr on failure.

### Text from file

```bash
elevenlabs-tts \
  --text-file ./line.txt \
  --voice-id <voice-id> \
  --output ./out.mp3
```

### Multiple segments → multiple files

Input JSON: an array of `{id, text}`. Each segment becomes `<output-dir>/<NN>-<id>.mp3`.

```bash
echo '[
  {"id": "hook",     "text": "Welcome back to the show."},
  {"id": "story",    "text": "Today I want to share a story…"},
  {"id": "insight-1","text": "Published research shows that…"}
]' > segments.json

elevenlabs-tts \
  --segments-file segments.json \
  --voice-id <voice-id> \
  --model-id eleven_multilingual_v2 \
  --output-dir ./out/
```

Emits:

```json
{
  "ok": true,
  "outputs": [
    "./out/01-hook.mp3",
    "./out/02-story.mp3",
    "./out/03-insight-1.mp3"
  ],
  "voice_id": "<voice-id>",
  "model_id": "eleven_multilingual_v2",
  "total_chars": 118,
  "segments": 3
}
```

## Flags

| Flag | Default | Description |
|---|---|---|
| `--text <string>` | — | One-shot text (mutually exclusive with `--text-file` and `--segments-file`) |
| `--text-file <path>` | — | Read text from file |
| `--segments-file <path>` | — | Read a JSON array of `{id, text}` |
| `--voice-id <id>` | **required** | ElevenLabs voice ID |
| `--model-id <id>` | `eleven_multilingual_v2` | Any published ElevenLabs model |
| `--stability <0..1>` | `0.5` | Voice stability |
| `--similarity-boost <0..1>` | `0.75` | Similarity boost |
| `--output <path>` | — | Output file (single-text mode) |
| `--output-dir <path>` | — | Output directory (segments mode) |
| `--output-format <fmt>` | `mp3_44100_128` | ElevenLabs output format string |
| `--retries <n>` | `3` | Max retries on rate-limit / 5xx |
| `--api-key <key>` | `$ELEVENLABS_API_KEY` | Override the env var |

## Error handling

- **Transient failures** (HTTP 429 / 5xx): auto-retry with exponential backoff (1s → 2s → 4s) up to `--retries` attempts.
- **Auth failures** (401): no retry; exit 1 with `{"error":"auth","message":"..."}`.
- **Quota exhausted**: no retry; exit 1 with `{"error":"quota","message":"..."}`.
- **Policy rejection**: no retry; exit 1 with `{"error":"policy","message":"..."}`.
- **Empty buffer returned**: exit 1 with `{"error":"empty_audio"}`.

## Callers

Directives currently referencing this skill:

- My Podcast — `my-podcast-audio-producer` (R3)
- My Show — `cartoon-voice-director` (R4)

Future: My Album persona voiceovers, any narration-driven project.

## See also

- `whisper-groq` — the inverse skill (audio → text)
- Vault Overview at `08 - System/Agent Skills/elevenlabs-tts - Skill Overview.md`
