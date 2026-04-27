---
title: narrator-no-stage-directions
tags: [principle, storytelling, content, audio]
type: principle
up: Principles Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Principles/Principles Hub.md|Principles Hub]]

# narrator-no-stage-directions

**Rule.** Strip stage directions, action descriptions, parentheticals, and speaker tags from the text sent to a TTS narrator. The narrator voices the spoken words only.

**Why.** TTS engines voice every character of the input. A line written as `(long silence)` becomes the narrator literally saying "long silence". A speaker tag like `Host:` becomes the narrator reading "Host" before the line. Brackets, stage directions, italics-as-emphasis-markers — they all get spoken. The script-as-read-by-a-human assumes the human filters; the script-as-read-by-TTS doesn't get that filter for free.

**How to apply.**
- Before sending any segment to the TTS provider, sanitise it: strip `(parentheticals)`, strip `**markdown emphasis**` markers, strip `[Hook]` / `[Insight 1]` / `[Story]` segment labels, strip `Speaker:` prefixes, strip `*(Source: …)*` inline citations, strip `✂️` or `▶` editorial markers.
- Real silence is encoded as a duration in the audio mix, not as text in the script.
- Real emphasis is encoded as voice settings (provider-specific stability / similarity-boost) or as scene composition, not as `**bold**` in the input string.
- The audio-producer directive owns this scan; encode it as a step the directive runs every time, not as an ad-hoc check.
- Test before mass-producing: TTS one short segment with the sanitisation, listen, confirm nothing leaked.
