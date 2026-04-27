---
name: video-production
type: profile
version: 1.0
required_fields:
  - aspect_ratio
  - target_duration_s
  - render_engine
phase_fields:
  - shot_list_path
  - keyframe_dir
  - render_output
init_docs:
  - Show Bible
tags: [onyx-profile]
up: Profiles Hub
allowed_shell:
  - ls
  - test
  - grep
  - cat
  - mkdir
  - find
  - which
  - ffmpeg
  - ffprobe
  - bun
  - node
  - npm
denied_shell:
  - rm
  - mv
  - cp
  - dd
  - mkfs
  - chmod
  - chown
  - sudo
---
## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: video-production

> For phases that produce video — animated shorts, serial cartoons, scripted live-action with synthesised audio, music videos, mixed-media. This profile sits between `content` and `audio-production`: video pipelines are content pipelines that also produce audio that also produce visuals. It pulls disciplines from both.

---

## When to use this profile

- A phase calls a video-gen model (Veo, Kling, Sora, Runway, etc.).
- A phase composes multi-reference keyframes (`nano-banana-compose`).
- A phase renders Remotion / After Effects / Blender output.
- A phase burns subtitles (`subtitle-burner`).
- A phase mixes voice + music + SFX into a video soundtrack.

Use *with* `audio-production` for video pipelines (the audio side runs on audio-production rules; the visual side runs on this profile's rules). Use this profile alone if the project is silent / music-only video.

---

## Required Overview fields

```yaml
profile: video-production
aspect_ratio: 16:9                       # 16:9 | 9:16 | 1:1 | 4:5 — drives every shot, render, and export
target_duration_s: 60                    # sum of all shot durations; audio drives this
render_engine: remotion                  # remotion | ffmpeg-only | external
voice_profile: "Voices/<voice-name>.md"  # narrator voice (if any)
lufs_target: -14                         # final mix loudness; -14 LUFS for streaming, -23 for broadcast
```

---

## Phase fields

Per-phase frontmatter:

```yaml
shot_list_path: Shots/                   # where the scene-composer's shot files live
keyframe_dir: output/keyframes/E03/      # where per-shot keyframes get written
render_output: output/video/E03.mp4      # final video target
```

---

## Acceptance gate

Before a video-production phase transitions to `completed`:

1. **Audio-first invariant.** The shot list's total duration matches the audio segment's actual duration ±100ms. (See [[08 - System/Principles/audio-first-pipeline.md|audio-first-pipeline]].)
2. **Aspect ratio honoured.** Every keyframe and the final render are exactly the declared `aspect_ratio`.
3. **Continuity stack.** Each character close-up shot uses the verbatim Bible description and the negative-prompt stack from the character's Bible entry.
4. **No leaked tokens.** No on-screen text from the model; any text overlays are post-render via ffmpeg.
5. **Final render exists** at `render_output` and is ≥ 90% of `target_duration_s` (allowing for fade-outs).

---

## Bundle structure

When `onyx init` creates a video-production project, it generates:

```
01 - Projects/<Show>/
├── <Show> - Overview.md             # this profile, this Bible
├── <Show> - Knowledge.md
├── <Show> - Bible.md                # universe / characters / locations / tone
├── Episodes/
│   └── E01 - <Title>/
│       ├── E01 - <Title>.md         # episode overview + ledger
│       ├── Phases/                  # premise, script, scene-comp, render, etc.
│       ├── Logs/
│       ├── Shots/                   # per-shot files from scene-composer
│       ├── Refs/                    # locked character/location PNGs
│       └── Reviews/                 # qc-reviewer outputs per phase boundary
├── Voices/                          # voice profile per character / narrator
├── Phases/                          # season-level phases (universe expansion, format pivots)
└── Logs/
```

---

## Default directives

Phases in this profile default to (override per-phase via `directive:`):

| Phase shape | Default directive |
|---|---|
| Concept selection | [[08 - System/Agent Directives/creative-director.md\|creative-director]] |
| Script writing | [[08 - System/Agent Directives/script-writer.md\|script-writer]] |
| Scene composition | [[08 - System/Agent Directives/scene-composer.md\|scene-composer]] |
| Audio production | [[08 - System/Agent Directives/audio-producer.md\|audio-producer]] |
| QC at each phase boundary | [[08 - System/Agent Directives/qc-reviewer.md\|qc-reviewer]] |
| Launch day | [[08 - System/Agent Directives/launch-ops.md\|launch-ops]] |
| Engagement | [[08 - System/Agent Directives/engagement-manager.md\|engagement-manager]] |

---

## Skills the profile expects on PATH

- `nano-banana-compose` — multi-ref keyframe composition
- `fal` — video-gen models (Veo / Kling / Sora / Runway)
- `elevenlabs-tts` — narrator / character voices
- `audio-master` — per-segment loudness conformance
- `suno-generate` — music beds
- `subtitle-burner` — burned-in captions for short-form export
- `whisper-groq` — transcription for caption alignment
