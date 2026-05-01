---
tags: [skill, status-active]
graph_domain: system
status: active
skill_name: nano-banana-compose
source_skill_path: clawd-skills/nano-banana-compose/SKILL.md
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# nano-banana-compose

Multi-reference image composition via fal-ai/nano-banana/edit. Combine 2+ ref images into a single composed output (per-shot keyframe, character + location, brand bake, multi-character ensemble, QC auto-correction).

## Verbs

| Verb | Bin | Purpose |
|---|---|---|
| `nano-compose` | `bin/nano-compose` | Multi-ref image composition (TS via bun) |
| `bible-to-prompt` | `bin/bible-to-prompt` | Assemble canonical prompt from a character/location bible MD |

## Inputs (nano-compose)

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--output <path>` | path | yes | Destination PNG/JPEG |
| `--prompt <text>` | string | yes | Composition prompt |
| `--aspect-ratio <a:b>` | string | no | e.g. `16:9`, `9:16`, `1:1` |
| `--account-ref <ref>` | string | no | fal account ref; defaults to `default` |
| (positional) | path | yes | One or more ref image paths |

## Output

Stdout: `[OK] <output-path>` on success.
Stderr: progress (`[nano] uploading 3 refs…`, `[nano] submitting…`, `[nano] polling <id>…`).
Exit codes: `0` ok, `1` usage / fal error, `2` no output images returned.

## Used by

- [[08 - System/Agent Directives/scene-composer.md|scene-composer]] — for per-shot keyframe composition
- my-show pipeline phases that combine character + location refs

## Prerequisites

- `fal` skill installed (this skill imports its client + accounts modules)
- `bun` on PATH
- `FAL_KEY` configured via fal skill credentials

## Forbidden patterns

- Treating as text-to-image — pass refs.
- Passing >5 refs — model drifts.
- Using for primary character generation — use Flux / Imagen / Ideogram for that, then compose with this.
