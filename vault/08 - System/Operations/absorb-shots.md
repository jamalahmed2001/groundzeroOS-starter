---
title: absorb-shots
tags:
  - system
  - operation
  - onyx
  - consolidate
type: operation-directive
version: 0.1
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: draft
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]
**Related:** [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle]] · [[08 - System/Conventions/Tag Convention.md|Tag Convention §8]]

# Operation: absorb-shots

> **The "this episode shipped, fold the shot files in" move.** When an episode reaches a stop state (rendered, published, mixed), its per-shot production scratch (`p1-s01.md` through `p3-s12.md` etc.) gets **tabulated into the episode body as a `## Shots` section** and the individual shot files get archived. The episode stays as an active node; only the granular scratch under it collapses. Different from [[consolidate-bundle]], which collapses the WHOLE bundle into a new node.

## When to invoke

Triggered by an episode reaching a shipped/complete status:
- Cartoon episode rendered + published → `absorb-shots episode="<episode-md>"`.
- Suno track final mastered + distributed → `absorb-shots track="<track-md>"` (variant for tracks).
- Any production-pipeline node whose children are atomic-unit `type: shot` / `type: take` / `type: beat` files.

**Do not invoke** while shots are still being regenerated. The operation refuses to run if any shot file's `status:` field signals in-flight work (e.g., `keyframe-round4-regen-pending`, `qc5b-pending`, `regen-required`).

The trigger is **`status: complete | shipped | rendered | distributed`** on the episode root file. Until that's set, the weekly scan skips it.

## Preconditions

- Episode root file exists and has `status: complete | shipped | rendered | distributed`.
- Sibling folder `<episode-id> - shots/` (or `<episode-id>/shots/`) exists with ≥1 `type: shot` file.
- All shot files have a stable `status:` (not `*-pending`, `*-required`, `regen-*`).
- Routine [[heal]] has run cleanly on the episode's parent folder within the last 24h.

## Read order

1. [[Tag Convention]] §8 — `onyx-shot` family-2 tag + family-8 media-content tags.
2. Episode root file — frontmatter + body.
3. Glob `<episode-shots-folder>/*.md` — all shot files (skip auto-created `* Hub.md`).
4. Each shot file's frontmatter (full body NOT needed for the table; archived verbatim).

## Procedure

### Step 0 — Pre-flight

1. Validate episode file exists. Read its frontmatter; check `status:` is in the shipped-set.
2. Locate shots folder. Two patterns supported:
   - `<episode-folder-of-episode-md>/<episode-id> - shots/` (e.g., `Episodes/<show>/E01 - shots/`)
   - `<episode-folder>/<episode-id>/shots/` (e.g., `Episodes/<show>/E03/shots/`)
3. If shots folder is empty (0 .md, ignoring the auto-created Hub) → already absorbed; halt as no-op.
4. Scan every shot file's `status:` field. Collect any with `pending`, `required`, `regen` → halt with `shots_in_flight: [paths]` unless `--force` passed.
5. Capture `now_iso` for the run.

### Step 1 — Compose the shot table

For each shot file (sorted by `shot_id` like `p1-s01 < p1-s02 < ... < p2-s01 < p3-s12`):

Read frontmatter only. Extract these columns into a markdown table:

| Column | Source field | Render |
|---|---|---|
| Shot | `shot_id` | `p1-s01` |
| Status | `status` | `complete` |
| Scene intent | `scene_intent` | one-line truncated to ~80 chars |
| Narrator | `narrator_transcript` | quoted, truncated to ~50 chars |
| Duration | `narrator_duration_s` + `target_video_duration_s` | `1.9s narr / 4s vid` |
| Veo model | `veo_model` | `veo3.1/lite` (strip `fal-ai/` prefix) |
| Keyframe | `keyframe_path` | basename only |
| Audio | `narrator_mp3_path` | basename only |
| Verdict | `qc5b_verdict` or `audit_verdict` | `pass` / `pending` / verdict text truncated |

Add a leading paragraph:

```markdown
## Shots

> **<N> shots absorbed from `<shots-folder>/` on <date>.** Original shot files archived to `_archive/<timestamp>/<shots-folder>/`. Per-shot Veo prompts, keyframe paths, and verbatim Veo responses preserved verbatim in the archive — this table is the navigation index, the archive is the audit trail.
```

Then the table.

After the table, embed a `<details>` block listing each archived shot file as a wikilink to its archive path:

```markdown
<details>
<summary>Archived shot files (<N>)</summary>

- [[_archive/2026-04-27T13-00-00Z/E01 - shots/p1-s01|p1-s01]] — Cold-open freeze
- [[_archive/.../p1-s02|p1-s02]] — ...
…

</details>
```

### Step 2 — Insert into episode body

Find the episode's body position to insert. Preferred: just before any existing `## References` / `## Production notes` / `## Source manifest` section, else append at end before any final `<!-- … -->` block.

Idempotency: if a `## Shots` section already exists with the same `<N> shots absorbed from … on <date>` line, halt as `already_absorbed`.

If a `## Shots` section exists with a DIFFERENT date (re-run after additions), DO NOT auto-replace — halt as `shots_section_exists`. The human resolves (decide whether to drop the old section or merge).

### Step 3 — Coverage check

`coverage_ratio` doesn't apply the same way as bundle consolidate (the goal here is compression, not preservation). Instead:
- Validate every shot file produced exactly one table row (no shots dropped silently).
- Validate every column has a non-null value OR a documented placeholder.

If the episode body grew by < 5% AND > 10 shots were absorbed → likely table extraction failed; halt with `table_too_thin`.

### Step 4 — Apply (Pass A: write episode)

Single Edit on the episode file:
1. Insert the new `## Shots` section per Step 2.
2. Bump `updated:` to `now_iso`.
3. Add `shots_absorbed_count: <N>` to frontmatter (idempotency marker).
4. Add `shots_archive_path: <rel-archive-dir>` to frontmatter.

### Step 5 — Apply (Pass B: archive shot files)

Compute `archive_dir = <episode-folder>/_archive/<consolidation_date>/<shots-folder-basename>/`.

For each shot file:
- `git mv <source> <archive_dir>/<basename>`
- Fall back to plain `mv` if not in a git repo.

Also move the auto-created `* Hub.md` for the shots folder.

After all moves, attempt `rmdir` on the now-empty shots folder. If non-empty (asset subfolders remained), leave it.

### Step 6 — Apply (Pass C: vault-wide wikilink rewrite)

Glob `<vault>/**/*.md` (skip `_archive/`, `.git/`). For each file, rewrite:
- `[[p\d+-s\d+]]` → `[[<episode-md-basename>#Shots]]` (with the alias preserved if present)
- `[[<episode-id> - shots/<file>]]` → `[[<episode-md-basename>#Shots]]`

Single Edit per file with hits.

### Step 7 — ExecLog

```
<now_iso> ABSORB-SHOTS episode="<rel>" shots=<N> archived_to="<rel>" episode_body_grew=<pct>% wikilinks_rewritten=<K>
```

### Step 8 — Verify

1. Re-read episode file. Validate `## Shots` section exists with N rows matching the source count.
2. Validate `shots_absorbed_count: <N>` frontmatter.
3. Run [[heal-fractal-links]] on the episode's parent folder. Expect zero new dangling refs.

If any check fails → log `verify_failed`, do not auto-rollback. Sources are in `_archive/`; restore via `git mv` if needed.

## Post-conditions & transitions

- Episode body has a new `## Shots` table with one row per absorbed shot.
- Shot files moved to `_archive/<date>/<shots-folder>/`.
- Vault wikilinks pointing at individual shots redirect to the episode's `#Shots` anchor.
- Episode frontmatter has `shots_absorbed_count` + `shots_archive_path` (idempotency markers).
- ExecLog has one bundle-scoped event line.

## Error handling

| Code | When | Behaviour |
|---|---|---|
| `episode_not_shipped` | Episode `status:` not in shipped-set, no `--force` | Halt before any read. |
| `shots_in_flight` | Any shot's `status:` signals in-progress work | Halt with offending paths. |
| `shots_section_exists` | Episode already has `## Shots` with a different date | Halt; human resolves. |
| `already_absorbed` | Idempotency marker already set | Exit cleanly as no-op. |
| `table_too_thin` | Body grew <5% with >10 shots | Halt; extraction likely broken. |
| `archive_move_failed` | Any `git mv` raises | Continue with remaining moves; record failures; halt before Pass C if >10% failed. |
| `verify_failed` | Step 8 mismatch | Surface; manual resolution. |

## What this operation does NOT do

- **Hard-delete** anything. Always `git mv` to `_archive/`.
- **Touch the episode body's other sections.** Insert is surgical — it adds `## Shots`, doesn't reshape the rest.
- **Run on episodes with shots still being regen'd.** That gate is hard.
- **Generate prose summaries of shots.** The table is mechanical extraction from frontmatter + archived files retain the full Veo prompts.

## Skills invoked

- This operation is small enough to inline in the directive — no separate skill file needed. The agent reads this directive end-to-end and executes Steps 0–8.

## Native primitives relied on

- **Glob** — shot files, vault wikilink scan.
- **Read** — frontmatter per shot, episode body.
- **Edit** — episode body insert, vault wikilink rewrites.
- **Bash `git mv`** — archive moves.

## Migration / rollout

1. Apply manually on E01 + E02 (Higher Branch) as initial validation. Both have `status: complete`, both have ~30 shots.
2. After verification, the [[consolidate-bundle]] weekly scan picks up `absorb-shots` as a sub-trigger when an episode root has `status: complete | shipped | rendered | distributed` AND has a sibling `* - shots/` folder.
3. After 5 successful absorbs, promote status from `draft` to `active`.

## Examples

### Example 1 — E01 - The Night the Rift Opened (Higher Branch)

Input:
- `episode = Episodes/The Higher Branch/E01 - The Night the Rift Opened.md` (`status: complete — all 4 renders delivered`)
- `shots = Episodes/The Higher Branch/E01 - shots/` (31 shot files + 1 auto-hub)

Result:
- Episode body gains `## Shots` section with 31 rows, before any closing sections.
- 31 shots + 1 hub → `_archive/2026-04-27T13-00-00Z/E01 - shots/`.
- Frontmatter gets `shots_absorbed_count: 31` + `shots_archive_path: _archive/2026-04-27T13-00-00Z/E01 - shots/`.
- ExecLog one line.

### Example 2 — Track variant (Suno albums)

Same shape with substitution: tracks instead of shots, Suno generation IDs instead of Veo model + keyframe path. The operation generalises by reading frontmatter; field map adjusts per kind tag (`onyx-shot` vs `onyx-take` vs `onyx-track-take`).
