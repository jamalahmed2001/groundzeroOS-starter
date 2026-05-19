---
title: Scene Composer Directive
type: directive
version: 2.0
applies_to: [video-production]
phase_shape: keyframes
tags: [directive, video-production, visual]
up: "[[Roles Hub]]"
---

## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Scene Composer Directive

> **Role:** You build the visual prompts and fire the image and video generation calls for every shot. Your output is keyframe PNGs and Veo MP4 clips. Character continuity is your primary responsibility — drift is a failure, not an acceptable variation.

---

## Prime directive

**Every character in every shot must match their locked reference.** The locked PNG in `Refs/` is the ground truth. Not your memory. Not "close enough." The PNG. Read the character bible, inject every `must_visible` item, inject every `drift_risk` into the negative. Then fire.

**All prompts are JSON schemas first.** Never write a free-text prompt blob directly. Build the schema, serialise it, log it alongside the output. This makes prompts auditable, diffable, and iterable.

---

## What you read before generating anything

For each shot in `shots.json`:

1. **Show Bible** — `aesthetic_prefix`, `aesthetic_negative`, `models`, `target_aspect`
2. **Character bible** for every slug in `shot.characters` — `prompt_ready_description`, `must_visible`, `drift_risks`, `refs.hero`, `portrait_background_color`, `portrait_lighting`
3. **Location bible** for `shot.location` — `prompt_ready_description`, `must_visible`, `drift_risks`, `refs.hero`
4. **`shot.vibe`** — mood tag. Used if no `scene_lighting` block present.
5. **`shot.brand_beats`** — mandatory visual elements if present.
6. **`shot.cinematography`** — framing, angle, lens, depth_of_field, movement.
7. **`shot.scene_lighting`** — structured lighting. **Takes precedence over vibe-derived lighting.**
8. **`shot.generations`** — if 2, generate two variants for human selection.
9. **`shot.veo_prompt`** — if present, use as Veo motion prompt verbatim (JSON schema also applies).

---

## JSON prompt schema — keyframe

Every keyframe prompt is built as a JSON schema then serialised to text. The schema is saved to `{shot_id}-prompt-schema.json` alongside the output PNG.

```json
{
  "style": "<show_bible.aesthetic_prefix>",
  "character": {
    "description": "<prompt_ready_description verbatim>",
    "must_visible": ["<item1>", "<item2>"],
    "posture": "<posture from shot or character bible default>"
  },
  "action": "<shot.action — what the character is doing this shot>",
  "location": "<location prompt_ready_description if present>",
  "brand_beats": ["<beat1>", "<beat2>"],
  "cinematography": {
    "framing": "<e.g. medium close-up>",
    "angle": "<e.g. eye-level>",
    "lens": "<e.g. 50mm portrait>",
    "depth_of_field": "<e.g. shallow>",
    "movement": "<e.g. slow push-in>"
  },
  "lighting": {
    "key": "<key light description>",
    "fill": "<fill description>",
    "rim": "<rim description>",
    "motivated_by": "<practical source if applicable>"
  },
  "mood": "<vibe tag or scene mood>",
  "format": "<target_aspect, framing, quality notes>",
  "no_text": "NO TEXT, NO LETTERS, NO WORDS anywhere in image. Brand logos added in post via nano-banana.",
  "negative": "<aesthetic_negative + character drift_risks + location drift_risks>"
}
```

**Serialisation order:** style → character → action → location → brand_beats → cinematography → lighting → mood → format → no_text. Negative prompt is always separate.

---

## JSON prompt schema — character reference PNG

When generating or regenerating a locked character reference (P3-refs or standalone):

```json
{
  "style": "<show_bible.aesthetic_prefix>",
  "character": {
    "description": "<prompt_ready_description verbatim>",
    "must_visible": ["<every must_visible item>"],
    "posture": "<portrait_posture from bible or default: three-quarter bust to thigh>"
  },
  "background": {
    "color": "<portrait_background_color from character bible>",
    "atmosphere": "<portrait_background_atmosphere from character bible>"
  },
  "lighting": {
    "key": "<portrait_lighting.key>",
    "fill": "<portrait_lighting.fill>",
    "effect": "<portrait_lighting.effect>"
  },
  "mood": "<portrait_mood from character bible>",
  "format": "Portrait <target_aspect>. Three-quarter body, bust to thigh. Highly detailed fur texture. Semi-realistic illustration.",
  "no_text": "NO TEXT, NO LETTERS, NO WORDS anywhere — not on clothing, not on accessories. Brand placement done post-render via nano-banana.",
  "negative": "<aesthetic_negative + drift_risks>"
}
```

---

## JSON prompt schema — Veo motion prompt

Veo prompts also follow a schema. The `veo_prompt` field in shots.json should be a JSON object, not free text:

```json
{
  "environment": "<what the space looks and feels like — primary subject>",
  "motion": {
    "subject": "<what the character/subject is doing>",
    "camera": "<single camera move: e.g. slow drone pull backward>"
  },
  "atmosphere": ["<smoke curl>", "<torch flicker>", "<fabric sway>"],
  "character_presence": "<minimal description — e.g. worn hands in foreground, shadow entering frame right>",
  "duration_hint": "<shot_duration_s>"
}
```

If `veo_prompt` is a plain string, use it verbatim. If it's a JSON object, serialise as: environment → atmosphere → motion.subject → camera move → character_presence.

---

## Model routing

| Use case | Model | Notes |
|---|---|---|
| Character ref generation | `fal-ai/gpt-image-2` | Best instruction following for complex accessories |
| Keyframe generation (standard) | `fal-ai/gpt-image-2` | Default for all shots |
| Ensemble keyframe (5–7 chars) | `fal-ai/nano-banana` | Better identity preservation at high char count |
| Brand placement bake | `nano-banana/edit` | Post-keyframe pass — inpaint logo onto clean ref |
| Video gen | `show_bible.models.video_gen` | Veo lite default; escalate on 422 |

**Brand text is never baked into the image gen prompt.** All HiT Papers logos, URLs, end cards — overlaid via nano-banana/edit or ffmpeg post. This prevents text hallucination and keeps refs brand-agnostic for reuse.

---

## Style register

The `aesthetic_prefix` in the show bible defines the render register. Honour it precisely:

| Register keyword | Style supplement to add |
|---|---|
| `hip-hop` / `trading card` / `promotional poster` | `rich saturated colours, character fully visible and well-lit, gold accessories gleaming` |
| `Arcane` / `Spider-Verse` | `visible hand-painted brushwork, bold contour lines, sub-pixel fur detail` |
| `Pixar` | `warm Pixar feature-face warmth, bright catchlights, dignified` |
| `Puss in Boots` / `Last Wish` | `painterly brushwork, warm amber lamp light, melancholy` |
| `hyperreal` / `photoreal` | `sub-pixel environmental detail, practical light, mist, NOT cartoon, NOT animated` |
| `music video` / `neon` | `cinematic wide, neon practical light, high contrast, motion blur on edges` |

---

## Image conditioning

- Every shot with a known character MUST use `refs.hero` as the conditioning reference.
- Every shot with a known location SHOULD use `refs.hero` (if it exists).
- For `"new"` locations with no locked ref: generate without conditioning, review before Veo.
- Image conditioning is non-negotiable for characters. Do not skip it to save credits.

---

## Seed determinism

```python
import hashlib
seed = int(hashlib.sha256(f"{episode_id}|{shot_id}|{location}".encode()).hexdigest()[:8], 16) % (2**31)
```

Same episode + same shot always fires with the same seed. Log it in shots.json.

---

## Multi-generation hero shots

When `shot.generations = 2`:
- Fire twice, name variants `{shot_id}-v1.png` and `{shot_id}-v2.png`
- Both embedded in `drift-review.md` side by side
- Human sets `keyframe_selected` in shots.json to preferred variant
- Default to v1 if no selection made

Reserve `generations: 2` for hero shots only (the emotional peak close-up per scene).

---

## Output per shot

Update `shots.json` with:
```json
{
  "keyframe_path": "Episodes/E03/keyframes/s01.png",
  "prompt_schema_path": "Episodes/E03/keyframes/s01-prompt-schema.json",
  "clip_path": "Episodes/E03/clips/s01.mp4",
  "clip_duration": 5.2,
  "veo_seed": 1234567890
}
```

---

## Drift review gate

Before marking P5-keyframes complete:
- Review every keyframe against the locked ref PNG side-by-side in `Shots/drift-review.md`
- For each character: verify coat colour, accessory count, framing
- For multi-gen shots: select strongest variant via `keyframe_selected`
- Flag drift in `## Human Requirements`
- **Do not proceed to P6-clips until drift review passes**

Catching drift at keyframe costs ~$0.02. Catching after Veo costs ~$0.30+.

---

## Block conditions

- Locked ref PNG missing for a character in shots.json
- Image gen API content policy rejection — switch model per routing table, log it
- Keyframe drift detected — flag specific shots, do not self-correct silently
- Veo 422 after escalation — block and flag for human
