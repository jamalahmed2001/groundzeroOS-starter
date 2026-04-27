---
title: heal-project-id-migrate
tags:
  - skill
  - onyx-runtime
  - heal
  - migration
type: skill
version: 0.1
created: 2026-04-27
updated: 2026-04-27
status: draft
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[Agent Skills Hub|Agent Skills Hub]]

# Skill: heal-project-id-migrate

> **One-shot rename**, not part of routine [[08 - System/Operations/heal.md|heal]]. Runs when a bundle's `project_id` is missing, malformed, or being renamed. Cascades the new slug to hub filenames, child `up:` fields, and every wikilink in the vault. Backed by the [[Project ID Convention]].

## When to invoke

- Bundle's Overview has no `project_id:` and routine heal flagged `detection: project_id_missing`.
- Bundle's `project_id:` fails the format / length rules (`detection: project_id_invalid_format`).
- Hubs in the bundle still carry an old slug after a previous rename (`detection: project_id_hub_mismatch`).
- Human wants to rename a bundle's identity slug deliberately.

Do **not** invoke this skill from inside the routine heal loop — it modifies filenames and is destructive on partial failure. Always invoke explicitly.

## Inputs

- `vault_path: string` — vault root.
- `bundle_path: string` — absolute path to one bundle directory (the one containing `Overview.md`). Operates on one bundle at a time.
- `target_slug: string | null` — optional override. If provided, validated against the convention and used directly. If null, derived from bundle folder name per [[Project ID Convention]] §2.
- `dry_run: bool` — default `true`. When true, reports the cascade plan with no writes. When false, applies the cascade.

## Outputs

- `proposed_slug: string` — the slug that would be applied (whether dry or not).
- `overview_change: { path, before, after } | null`
- `hub_renames: { from, to }[]`
- `child_up_rewrites: { path, key, before, after }[]`
- `wikilink_patches: { path, count }[]`
- `tag_rewrites: { path, before, after }[]`
- `errors: ErrorRecord[]`

## Algorithm

### Step 1 — Validate inputs and load convention

Read [[Project ID Convention]] §1 for the format rules and §2 for derivation. Read [[Fractal Linking Convention]] §1 for the hub-name pattern (`<project_id> - <Folder> Hub.md`).

If `bundle_path` does not contain exactly one `*Overview.md`, halt with `errors: ["bundle_overview_missing"]`. The skill operates on bundle units; ambiguity at this layer must be resolved by the human first.

### Step 2 — Derive (or accept) the target slug

If `target_slug` is provided:
- Validate against §1 regex / length rules. On failure, halt with `errors: ["invalid_target_slug"]`.
- Glob all `*Overview.md` in vault, parse `project_id:`, ensure no other Overview has the same value. On collision, halt with `errors: ["target_slug_collides_with=<other_bundle>"]`.

If `target_slug` is null:
- Apply §2 derivation rules to the bundle folder basename.
- If derivation yields empty / >30 chars after truncation, halt with `errors: ["unrecoverable_slug_for=<folder>"]`.
- Apply uniqueness check; if collision, append `-2`, `-3`, … until unique.

Set `proposed_slug` to the validated value.

### Step 3 — Capture the old slug (and other forms to rewrite)

Read the Overview frontmatter. Record:

```
old_id       = frontmatter.project_id    (may be missing/empty)
old_label    = frontmatter.project       (free-form, may differ)
folder_name  = basename(bundle_path)
```

The cascade rewrites the **slug**. The free-form `project:` label is left alone — it's allowed to be a sentence. **However**, hub filenames in this bundle currently in use must also be detected — any of these patterns may be in play:

- `<old_id> - <Folder> Hub.md` (clean prior state)
- `<old_label> - <Folder> Hub.md` (the bundle never had a slug; hubs were named from the label)
- `<folder_name> - <Folder> Hub.md` (hubs named from folder)

Build `aliases_to_rewrite`: a deduped set of the non-empty values among `{ old_id, old_label, folder_name }` — these are the strings that may appear in hub names, child `up:` fields, and wikilinks. The new value for all of them is `proposed_slug`.

### Step 4 — Plan the hub renames

Glob `<bundle_path>/**/*.md`. For each file matching `* - * Hub.md` (whether at bundle root or nested), check whether its filename starts with any value in `aliases_to_rewrite`. If yes, plan a rename:

```
from = <bundle_path>/<…>/<alias> - <Folder> Hub.md
to   = <bundle_path>/<…>/<proposed_slug> - <Folder> Hub.md
```

If the destination filename already exists (and is a different file), record an error `hub_rename_target_exists` and skip — humans resolve.

### Step 5 — Plan child `up:` rewrites

Glob `<bundle_path>/**/*.md` (excluding `.trash/`, `.onyx-backups/`, `_archive/`). For each file:
- Parse frontmatter. Read `up:`.
- If `up:` resolves (after stripping wikilink syntax) to a basename that begins with any alias in `aliases_to_rewrite`, plan a rewrite to the equivalent name with `proposed_slug`.

Record each rewrite in `child_up_rewrites`.

### Step 6 — Plan wikilink patches across the entire vault

Walk `<vault_path>/**/*.md` (skip `.git/`, `node_modules/`, `.obsidian/`, `.trash/`, `.onyx-backups/`, `_archive/`). For each file, scan for `[[…]]` patterns where the target's basename begins with any alias in `aliases_to_rewrite` followed by ` - ` (i.e. matches a hub or known child name pattern from this bundle).

Record patch counts per file in `wikilink_patches`. **Do not** patch wikilinks whose alias text the human chose (preserve the `|alias` portion verbatim — the human's chosen display label is independent of the underlying slug).

### Step 7 — Plan tag rewrites

If the project's family-5 tag is in use (e.g. `project-<old_id>` or `project-<sanitised(old_label)>`), plan rewrites to `project-<proposed_slug>` on every file that carries the old tag. Record in `tag_rewrites`.

### Step 8 — Dry-run report

If `dry_run: true`, emit the full plan (all five lists above) and stop. Do not write.

### Step 9 — Apply, in this order (only when dry_run=false)

The order matters: hub renames first (so `up:` rewrites in Step 9b can target the new file), then `up:` rewrites, then wikilink patches, then tags, then Overview frontmatter. Reverse order on rollback.

9a. **Bump every modified file's `updated:`** to the same `now_iso` captured at run start.
9b. **Hub file renames** — use `git mv` (preserves history); fall back to plain rename if not in a git repo.
9c. **Child `up:` rewrites** — single Edit per file, atomic per the [[Fractal Linking Convention]] §3 invariant.
9d. **Wikilink patches** — single Edit per file. Preserve `|alias` portions.
9e. **Tag rewrites** — single Edit per file.
9f. **Overview frontmatter** — set `project_id: <proposed_slug>`. Bump `updated:`. Leave `project:` alone.

### Step 10 — ExecLog

One bundle-scoped event:

```
<now_iso> HEAL project-id-migrate from="<old_id_or_label>" to="<proposed_slug>" hubs=<N> children=<M> wikilinks=<K> tags=<T> bundle="<rel_bundle_path>"
```

Plus, if `errors` is non-empty, one `project-id-migrate-partial-failure` line summarising the count.

### Step 11 — Verify

After applying, immediately run [[heal-project-id]] on the same bundle. Expected: zero `project_id_*` detections. Then run [[heal-fractal-links]] on the same bundle. Expected: zero Rule 2 (target missing) detections caused by the previously dangling hub names.

If verification fails, do not roll back automatically — the modifications are in git history. Surface a `verify_failed` error and let the human decide.

## Invariants

- **Idempotent.** Running twice with the same input yields the same end state. If `proposed_slug` already matches `project_id:`, the skill is a no-op (apart from validating).
- **One bundle per invocation.** The skill mutates one bundle's identity at a time; vault-wide cascades are still bounded to wikilink patches that target this bundle's files.
- **Never overwrites a file with a colliding name.** All renames check destination; collisions become errors.
- **Single Edit per file** (per [[Fractal Linking Convention]] invariant).
- **`updated:` bumped exactly once per modified file** to a single `now_iso` captured at run start.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `bundle_overview_missing` | `bundle_path` has 0 or >1 `*Overview.md` | Halt before any change. |
| `invalid_target_slug` | `target_slug` provided but fails convention | Halt. Surface the regex / length issue. |
| `target_slug_collides_with=<bundle>` | another Overview already owns the slug | Halt. Human picks a different slug. |
| `unrecoverable_slug_for=<folder>` | derivation yields empty / >30 chars | Halt. Human provides an explicit `target_slug`. |
| `hub_rename_target_exists` | renamed-to filename already exists at destination | Skip that hub; record. Other steps proceed. |
| `verify_failed` | post-migration heal still flags this bundle | Record; do not roll back. |

## Examples

### Example 1 — Bundle with sentence label, no slug

Input:
- `bundle_path = "02 - <workplace>/<workplace> Experiments/Moderating Underage Roleplay/"`
- `target_slug = null`
- `dry_run = false`

Overview before:
```yaml
project: Moderating Underage Roleplay
project_id: (missing)
```

Derived slug: `moderating-underage-roleplay` (28 chars, unique).

Cascade applied:
- `Moderating Underage Roleplay - Phases Hub.md` → `moderating-underage-roleplay - Phases Hub.md`
- `Moderating Underage Roleplay - Agent Log Hub.md` → `moderating-underage-roleplay - Agent Log Hub.md`
- 3 phase files: `up: Moderating Underage Roleplay - Phases Hub` → `up: moderating-underage-roleplay - Phases Hub`
- 3 log files: equivalent for Agent Log Hub
- ~12 wikilinks across vault rewritten
- Overview frontmatter: `project_id: moderating-underage-roleplay` added

ExecLog:
```
2026-04-27T12:30:00Z HEAL project-id-migrate from="Moderating Underage Roleplay" to="moderating-underage-roleplay" hubs=2 children=6 wikilinks=12 tags=0 bundle="02 - <workplace>/<workplace> Experiments/Moderating Underage Roleplay/"
```

### Example 2 — Existing slug, format-only fix

Input:
- bundle has `project_id: My Album` (capital + space — fails format).
- `target_slug = "my-album"`.

Derived: skipped (provided). Validated: passes. Unique: yes.

Cascade: hubs already use `My Album` form; rename to `my-album - … Hub.md`. Children's `up:` rewritten. Vault-wide wikilink patches. Overview's `project_id` corrected.

### Example 3 — Dry run for an ambiguous bundle

Input:
- bundle folder is `Example Show/` but project is being renamed to `The Example Show` per recent direction.
- `target_slug = "higher-branch"`, `dry_run = true`.

Output: full cascade plan (renames, rewrites, patches) with counts. No writes. Human reviews diff, then re-runs with `dry_run = false`.

## How to invoke (agent-directive)

Load this skill, [[Project ID Convention]], and [[Fractal Linking Convention]]. Prompt:

```
Run heal-project-id-migrate on bundle="<bundle_path>" with dry_run=true. Surface the plan. Pause.
```

After human review:

```
Run heal-project-id-migrate on the same bundle with dry_run=false. Apply cascade. Run heal-project-id and heal-fractal-links to verify.
```

## Native primitives relied on

- **Glob** — find Overview files, hub files, child files, vault-wide wikilink scan.
- **Read** — frontmatter, wikilink contents.
- **Edit** — frontmatter rewrites, wikilink patches, tag rewrites.
- **Bash `git mv`** (with plain `mv` fallback) — hub file renames.

## Relationship

- Routine validation of `project_id` lives in [[heal-project-id]]. This skill is the cascade-rename counterpart.
- Hub files this skill renames feed [[heal-fractal-links]] Rule 2 — the very dangling targets that motivated the migration.
- Convention authority: [[Project ID Convention]] §1 (contract), §2 (derivation), §3 (cascade).
