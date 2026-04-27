---
project: Video — Animated Short
type: hub-project
tags:
  - hub-subdomain
  - phases-hub
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: Video — Animated Short - Overview
---
## 🔗 Navigation

**UP:** [[Video — Animated Short - Overview|Overview]]

# Video — Animated Short — Phases Hub

9 phases per episode. Each episode lives in `Episodes/<show>/E<NN> - <Title>/Phases/`. Phases reference per-episode artefacts; the Show Bible at the project root is read by every phase.

## Phases (per episode)

- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O1 - Premise|O1 — Premise]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O2 - Script|O2 — Script]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O3 - Audio|O3 — Audio]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O4 - Scene Composition|O4 — Scene Composition]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O5 - Visual Package|O5 — Visual Package]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O6 - Render|O6 — Render]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O7 - Export|O7 — Export]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O8 - Launch|O8 — Launch]]
- [[Episodes/Example Show/E01 - Example Episode/Phases/E01 - O9 - Engagement|O9 — Engagement]]

## Audio-first ordering

The audio phase (O3) runs **before** scene composition (O4). The scene composer reads the audio's actual durations to time the shot list. (See [[08 - System/Principles/audio-first-pipeline.md|audio-first-pipeline]] — this ordering is non-negotiable.)

```
O1 Premise
  → O2 Script
      → O3 Audio (target_duration_s set here)
          → O4 Scene Composition (timing derived from O3)
              → O5 Visual Package (per-shot keyframes)
                  → O6 Render (Veo / Kling / etc. drive each shot)
                      → O7 Export (post-render assembly + captions + LUFS pass)
                          → O8 Launch (publishing skills)
                              → O9 Engagement (post-publish triage)
```

## Default directives per phase

| Phase | Directive |
|---|---|
| O1 Premise | [[08 - System/Agent Directives/creative-director.md\|creative-director]] |
| O2 Script | [[08 - System/Agent Directives/script-writer.md\|script-writer]] |
| O3 Audio | [[08 - System/Agent Directives/audio-producer.md\|audio-producer]] |
| O4 Scene Composition | [[08 - System/Agent Directives/scene-composer.md\|scene-composer]] |
| O5 Visual Package | (project-specific — uses `nano-banana-compose` to compose keyframes from refs) |
| O6 Render | (project-specific — uses `fal` for video-gen per shot) |
| O7 Export | [[08 - System/Agent Directives/audio-producer.md\|audio-producer]] (final-mix pass) + ffmpeg assembly |
| O8 Launch | [[08 - System/Agent Directives/launch-ops.md\|launch-ops]] |
| O9 Engagement | [[08 - System/Agent Directives/engagement-manager.md\|engagement-manager]] |

QC reviewer ([[08 - System/Agent Directives/qc-reviewer.md|qc-reviewer]]) runs at every phase boundary.
