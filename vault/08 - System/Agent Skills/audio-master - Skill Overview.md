---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: audio-master
source_skill_path: ~/clawd/skills/audio-master/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# audio-master

> Master audio to streaming-spec LUFS and concatenate segments cleanly. One skill, many callers — tune via `--target-lufs` and `--codec`.

## When a directive should call this

- Finishing raw TTS segments into a publish-ready podcast/narration MP3
- Mastering Suno-generated tracks to a consistent album LUFS before export
- Concatenating multiple polished segments with clean silence gaps (no malformed MP3)

## When NOT to call this

- Stem mixing / multi-track production → use a DAW
- Format conversion only (no loudness work) → call `ffmpeg` directly
- Anything that needs subjective EQ/compression decisions — this is a loudness + concat tool only

## How to call it

```bash
# Master a single file
~/clawd/skills/audio-master/bin/audio-master master \
  --input ./raw/seg-01.mp3 \
  --output ./out/seg-01.mp3 \
  --target-lufs -14 \
  --codec mp3

# Concatenate mastered segments with 500ms silence between
~/clawd/skills/audio-master/bin/audio-master concat \
  --inputs "./seg-01.mp3,./seg-02.mp3,./seg-03.mp3" \
  --output ./full.mp3 \
  --gap-ms 500
```

Emits structured JSON on stdout (success) or stderr (error with classification).

## Credentials

None — reads/writes local files. Requires `ffmpeg` on PATH.

## Currently used by

| Project | Directive | What gets mastered |
|---|---|---|
| Example Podcast | `example-audio-producer` | ElevenLabs segments → full episode MP3 |
| Suno Albums | `suno-track-master` | Each track to album-consistent LUFS |
| Example Cartoon Series | `cartoon-voice-director` (polish) | Polished voice lines |

## See also

- [[elevenlabs-tts - Skill Overview|elevenlabs-tts]] — upstream TTS that produces the raw segments
- [[youtube-publish - Skill Overview|youtube-publish]] — downstream distribution
