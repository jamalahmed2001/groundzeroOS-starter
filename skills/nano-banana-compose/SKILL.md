---
name: nano-banana-compose
description: Multi-reference image composition via fal-ai/nano-banana/edit. Use when a directive needs to combine 2+ reference images into a single composed output (character + location, brand sigil + character, multi-character ensemble shot, etc.). Sister tool: bible-to-prompt assembles a canonical prompt from a character/location bible MD before calling nano-compose.
metadata:
  clawdbot:
    emoji: "🎨"
    requires: ["bun", "fal skill"]
    credentials: "FAL_KEY via fal skill credentials"
---

# nano-banana-compose

A thin shell over fal-ai/nano-banana/edit, plus a prompt-assembly helper that reads a character or location bible markdown file and builds the canonical one-shot prompt.

Used by video-production pipelines for tasks like:
- **Character + location keyframe** — combine a locked character PNG with a location plate into a per-shot keyframe
- **Brand bake** — paint a project's brand sigil / merch / accessory onto a character ref
- **Multi-character ensemble** — combine multiple character refs into a single shot
- **QC auto-correction** — targeted fix of one issue flagged by a reviewer (add missing prop, remove text artefact, adjust palette)

Not for primary character/location generation — use `fal` skill with text-to-image models (Flux, Imagen, Ideogram) for that. nano-banana-compose is for *composition* — combining existing refs.

## Install

```bash
cd ~/clawd/onyx/clawd-skills/nano-banana-compose
# nothing to install; bun runs the .ts files directly
```

Requires: `bun` on PATH, the `fal` skill installed at the standard sibling path (`~/clawd/skills/fal/` or whatever the operator's `clawd-skills/` root resolves to).

## Credentials

Inherits from the `fal` skill — set `FAL_KEY` in the fal account file (`~/.credentials/fal-default.env` or similar).

## Usage

### `nano-compose` — multi-ref image composition

```bash
~/clawd/skills/nano-banana-compose/bin/nano-compose \
  --output ./out/keyframe-shot01.png \
  --prompt "Two characters in the foreground at a campfire; warm golden light; mid shot; cinematic 4K animation" \
  --aspect-ratio 16:9 \
  ./refs/character-A.png \
  ./refs/character-B.png \
  ./refs/location-campfire.png
```

Flags:
- `--output <path>` — destination PNG / JPEG (required)
- `--prompt <text>` — composition prompt (required)
- `--aspect-ratio <a:b>` — optional aspect ratio for the output
- One or more positional ref image paths — uploaded to fal first, then included in the composition request

Stdout on success: `[OK] <output-path>`. Stderr carries progress (`[nano] uploading 3 refs…`, `[nano] submitting…`, `[nano] polling…`).

### `bible-to-prompt` — assemble prompt from a character/location bible

```bash
~/clawd/skills/nano-banana-compose/bin/bible-to-prompt ./Bibles/character-Alice.md
```

Reads frontmatter and structured sections from a character or location bible markdown file; emits a canonical prompt to stdout. Output is suitable to pass straight into `nano-compose --prompt`.

The bible markdown must declare `type: character-bible` or `type: location-bible` in frontmatter (or pass `--kind char|loc` explicitly).

## Bible markdown shape (expected)

For `type: character-bible`:

```yaml
---
type: character-bible
name: Alice
verbatim_visual: "<the verbatim visual description used in every prompt>"
negative_prompt_stack: "<terms to forbid in image gen>"
---
```

For `type: location-bible`:

```yaml
---
type: location-bible
name: The campfire clearing
verbatim_visual: "<verbatim location description>"
lighting_default: "<lighting default for this location>"
---
```

The script reads frontmatter only; body content is for human reference.

## When to use this vs `fal` directly

- **Use this** when you have 2+ reference images and want to compose them. Image-to-image with multi-ref is the use case nano-banana/edit was built for.
- **Use `fal` directly** for text-to-image primary generation (no refs), or for video-gen, or for any non-image fal model.

## Forbidden patterns

- Treating this as a text-to-image generator. It's image-to-image with refs; pass refs.
- Passing more than ~5 refs. nano-banana drifts on the additional context.
- Using this for primary character generation. Use Flux / Imagen / Ideogram for that, then use nano-compose to combine the result.
