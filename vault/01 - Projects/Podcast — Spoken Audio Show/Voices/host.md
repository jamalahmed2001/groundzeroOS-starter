<!--
Host voice profile. Fill in voice ID and DNA before running the audio phase.
-->
---
project: Podcast — Spoken Audio Show
type: voice-profile
voice_name: host
voice_id: <provider voice ID>
provider: elevenlabs
model: eleven_multilingual_v2
stability: 0.5
similarity_boost: 0.75
status: draft
tags:
  - voice-profile
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Podcast — Spoken Audio Show - Overview
---
## 🔗 Navigation

**UP:** [[Podcast — Spoken Audio Show - Overview|Overview]]

# Voice: Host

## Persona

<one paragraph — see project Voice Guide for the show's broader voice rules; this file pins the provider settings>

## Provider settings

- Voice ID: `<voice-id>`
- Model: `eleven_multilingual_v2`
- Stability: `0.5`
- Similarity boost: `0.75`

## Pronunciation overrides

Project-level pronunciation dictionary lives at `pronunciation.json` in the project root (or this folder). Apply via `audio-producer` before synthesis. See [[08 - System/Templates/Pronunciation Dictionary Template.md|Pronunciation Dictionary Template]] for shape.

## Sample lines

```
<3-5 sample lines in the host's voice — used as a regression check
when the provider model updates>
```

## Known quirks

<provider-specific quirks for this voice — e.g. "drops final consonants on
long sentences", "flattens questions", "adds 'um' after long pauses">
