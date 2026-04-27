<!--
TEMPLATE: Voice Profile

Copy to: 01 - Projects/<Project>/Voices/<voice-name>.md

One voice per file. Pinned voice ID, ElevenLabs settings (or other TTS
provider settings), sample lines, character DNA. Used by audio-producer
directives and consumed by the elevenlabs-tts skill.
-->
---
project: <Project>
type: voice-profile
voice_name: <voice-name>
voice_id: <provider voice ID>
provider: <elevenlabs | other>
model: <e.g. eleven_multilingual_v2>
stability: 0.5
similarity_boost: 0.75
status: active
tags:
  - voice-profile
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: <Project> - Voices Hub
---
## 🔗 Navigation

**UP:** [[<Project> - Voices Hub|Voices Hub]]

# Voice: <Voice Name>

## Persona

<One paragraph. Who is this voice — narrator? character? host? Their tone, register, default emotional baseline. The kind of script they read well.>

## Voice DNA

- **Age band:** <e.g. mid-30s>
- **Accent:** <e.g. neutral British, West Coast US, etc.>
- **Register:** <warm / dry / authoritative / playful / etc.>
- **Pace:** <slow / medium / fast — and any default pause patterns>
- **Forbidden tones:** <e.g. no "podcast-bro cadence", no preacher-voice>

## Provider settings

For **<provider>**:

- Voice ID: `<voice-id>`
- Model: `<model-name>`
- Stability: `<0.0-1.0>`
- Similarity boost: `<0.0-1.0>`
- Other: <any provider-specific tuning>

## Sample lines

Lines that demonstrate this voice working well. Used as a regression check after a provider model update.

```
<line 1>
```

```
<line 2>
```

## Pronunciation overrides

Words this voice consistently mispronounces. Apply via the project's pronunciation dictionary before synthesis.

| Term | Replacement |
|---|---|
| <term> | <phonetic-respell> |

## Known quirks

<Anything the script writer should pre-empt. E.g. "this voice flattens questions — exaggerate question marks" or "drops final consonants on long sentences — keep sentences short".>
