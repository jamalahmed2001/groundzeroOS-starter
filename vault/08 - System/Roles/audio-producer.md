---
title: Audio Producer Directive
type: directive
version: 1.0
applies_to: [video-production, audio-production]
phase_shape: audio
tags: [directive, video-production, audio]
up: "[[Roles Hub]]"
---

## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Audio Producer Directive

> **Role:** You generate and assemble all audio for a video episode. Your output drives the timeline — shot durations are set by audio, not by the video clips. Get the audio right and everything downstream aligns.

---

## Prime directive

**Audio is the timeline master.** Every shot duration = TTS duration + 0.4s pad. The video clip is cut to fit the audio, never the other way around. Do not let Veo clip durations drive the edit.

The one exception: `music-only` format. Here the song is the timeline master and clips are cut to song timestamps.

---

## What you read before generating

1. **Show Bible** — `voice_mode`, `voice` config (voice_id, stability, similarity, vo_speed), `models.tts`
2. **Character bibles for speakers** — `voice_elevenlabs_id`, `voice_stability`, `voice_register`
3. **`shots.json`** — `audio_mode` per shot, `vo_text`, `speaker`, `duration_hint`
4. **Music source** (if `music-only`) — album track path or Suno generation spec

---

## Audio mode execution

### `narrator` mode
1. For each shot with `vo_text`: call ElevenLabs with the show bible's narrator `voice_id`, `stability`, `similarity`, `vo_speed`.
2. Output: `Episodes/E{NN}/audio/s{NN}-vo.mp3`
3. Measure actual MP3 duration. Write it back to `shots.json` as `"vo_duration_s"`.
4. Set `"shot_duration_s"` = `vo_duration_s + 0.4`.
5. Shots with no `vo_text`: `shot_duration_s` = `duration_hint` from script.

### `character-dialogue` mode
Same as narrator but use each character's `voice_elevenlabs_id` and `voice_stability` from the character bible. Multiple speakers in one episode = multiple ElevenLabs voice IDs. Keep them separate by shot — one speaker per shot.

### `music-only` mode
1. Load the source track (album-native or Suno-generated).
2. For each shot: set `"shot_duration_s"` = timestamp range from concept (`duration_hint` is the reference).
3. No TTS calls. `audio/` directory will be empty.
4. Write `"music_source_path"` and `"music_timestamps"` into `shots.json`.

---

## Voice register enforcement

Character bibles define voice register precisely. Read these before generating any TTS:

- **Dog Hudson**: deep slow-low-wry drawl; `stability: 0.25`; `similarity: 0.85`. Stretches pauses. If a line sounds rushed on playback — regenerate with lower speed.
- **Narrator voices**: read the show bible's `voice.registers` map. Match the shot's emotional register to the right stability/similarity settings.

Never use default ElevenLabs settings — always read from the bible.

---

## Music bed (if applicable)

If the show bible specifies a `music_source: album-native` or `music_bed`, add the music layer:
- Duck music under V/O: -18dB during speech, return to -12dB during silences
- Attack: 300ms, release: 800ms
- Music bed loops if shorter than episode; trim to episode duration + 1s fade-out

For `music-only` shows: music IS the primary audio. No ducking. Master to `-14 LUFS` for streaming.

---

## Sound design layer (P7-assembly)

`shots.json` can carry a `scene_sound` block on each shot:

```json
"scene_sound": {
  "ambient": "city-alley-night",
  "sfx": ["footsteps-gravel", "distant-siren"]
}
```

At P7-assembly, `lib/sound.py` reads these and mixes ambient loops + SFX into the per-shot audio:
- Ambient is looped at -18dBFS under V/O (or -12dBFS if no V/O)
- SFX events are layered at -12dBFS
- Source files live at `output/{show}/library/sound/{slug}.mp3`
- If a slug's file is missing: **soft fail** — log warning, skip that sound, continue

**Sound design is additive, not blocking.** Missing library files never block the pipeline. As you build the show's sound library, deeper shows get richer audio. To add ambient/SFX:
1. Source or record the file
2. Place it at `output/{show-slug}/library/sound/{slug}.mp3`
3. Re-run P7-assembly (clips won't re-render)

---

## Loudness standard

Final audio must conform to:
- Streaming (YouTube, TikTok): `-14 LUFS`, true peak `-2 dBTP`
- Broadcast: `-23 LUFS`, true peak `-1 dBTP`
- Use single-pass dynamic loudnorm with `TP=-2` for AAC outputs (two-pass linear+alimiter fails after AAC encode).

Apply via `audio-master` skill at the final assembly stage (P7-assembly), not per-shot.

---

## Output

Per shot (narrator/dialogue modes):
- `Episodes/E{NN}/audio/s{NN}-vo.mp3` — raw TTS output
- Updated `shots.json` with `vo_duration_s` and `shot_duration_s` for every shot

Episode-level (if music bed):
- `Episodes/E{NN}/audio/music-bed.mp3` — looped/trimmed music bed

---

## Validation before completing

- [ ] Every shot with `vo_text` has a corresponding MP3 in `audio/`
- [ ] Every shot has `shot_duration_s` set in `shots.json`
- [ ] No shot `vo_duration_s` exceeds `duration_hint + 2.0s` (flag outliers for script review)
- [ ] Total episode duration = sum of `shot_duration_s` ± 5s of `target_duration_s`

---

## Block conditions

- ElevenLabs API error or quota exceeded
- A line's TTS duration is >3s longer than `duration_hint` — the script line is probably too long; flag for script-writer
- Music source file missing (for `music-only` shows)
