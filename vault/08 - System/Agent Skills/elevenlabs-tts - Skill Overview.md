---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: elevenlabs-tts
source_skill_path: ~/clawd/skills/elevenlabs-tts/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# elevenlabs-tts

> General-purpose text-to-speech connector. Any directive that needs to turn text into voice audio calls this skill — passing the voice ID + settings that identify its persona / character.

## When a directive should call this

- Podcast / narration voice synthesis (e.g. Example Podcast `example-audio-producer`)
- Animated character voicing with a locked ElevenLabs voice per role (e.g. Example Cartoon Series `cartoon-voice-director`)
- One-off narration or sting generation in any future project

One skill handles every caller. Caller-specific details (which voice, which model, which format) are passed as CLI flags by the directive — never baked into the skill.

## When NOT to call this

- Need music or SFX → not this skill. Use `suno-generate` for music.
- Need to apply per-project pronunciation rules → apply them *before* calling this skill (it deliberately doesn't know about your project's pronunciation dictionary).
- Need transcripts of audio → use `whisper-groq` (the inverse direction).

## How to call it

From a project repo or a vault directive's agent session:

```bash
~/clawd/skills/elevenlabs-tts/bin/elevenlabs-tts \
  --text "Your line here" \
  --voice-id "<ElevenLabs voice id>" \
  --model-id eleven_multilingual_v2 \
  --stability 0.5 \
  --similarity-boost 0.75 \
  --output ./out.mp3
```

Batch mode — synthesize many segments in one call:

```bash
echo '[{"id":"hook","text":"..."},{"id":"story","text":"..."}]' > segs.json
~/clawd/skills/elevenlabs-tts/bin/elevenlabs-tts \
  --segments-file segs.json \
  --voice-id "<id>" \
  --output-dir ./out/
```

Emits structured JSON on stdout (`{ok, outputs[], voice_id, model_id, total_chars, ...}`); errors on stderr as `{ok:false, error, message}` with non-zero exit.

## Credentials

- `ELEVENLABS_API_KEY` in the caller's env
- Commercial use requires ElevenLabs Pro / Premier tier

## Voice IDs currently used in this vault

| Project | Directive | Voice | Notes |
|---|---|---|---|
| Example Podcast | `example-audio-producer` | `YOUR_VOICE_ID` (your voice profile) | Model: `eleven_multilingual_v2` |
| Example Cartoon Series | `cartoon-voice-director` | locked per character in the Character Bible (P03) | Per-character stability/similarity settings |

Add rows here when new voices are adopted.

## Known issues

- `eleven_v3` previously produced corrupted MP3s when concatenated with silence gaps — use `eleven_multilingual_v2` by default. See Example Podcast Episode 8 post-mortem.
- The SDK's `output_format` enum is restrictive; our client accepts any string at runtime and casts. If you pass an unknown format the API will reject it cleanly.

## Implementation + source

- Skill code: `~/clawd/skills/elevenlabs-tts/` (SKILL.md + src + bin + tests)
- 6 unit tests (mocked SDK) — cover retry, error classification, per-call overrides

## See also

- [[whisper-groq - Skill Overview|whisper-groq]] — speech-to-text, the inverse direction
