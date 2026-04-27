---
title: Project ID Convention
tags:
  - system
  - convention
  - graph
  - linking
  - onyx
  - identity
type: convention
version: 0.1
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Conventions Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Conventions/Conventions Hub.md|Conventions Hub]]

# Project ID Convention

> **The rule.** Every project bundle's Overview carries a `project_id:` slug. The slug — not the descriptive `project:` label — is the canonical name used to derive hub filenames, build wikilinks, and reason about identity. Bundles where `project_id:` is missing or malformed cannot be healed reliably; they get flagged and quarantined until migrated.
>
> **Why this matters.** [[Fractal Linking Convention]] derives every hub name as `<project_id> - <Folder> Hub.md`. When `project_id` is absent, the healer falls back to `project:` — and if `project:` is a sentence ("Moderating underage roleplay via the AI content tagging flow"), the derived hub names are unusable, the wikilinks dangle, and Rule 3 fixes can't apply. One slug, derived once, fixes the entire downstream chain.

---

## 1. The contract

Every project bundle's `Overview.md` MUST declare `project_id:` in frontmatter with these properties:

| Property | Rule |
|---|---|
| Presence | Required. Empty / missing → `INTEGRITY` event. |
| Format | `^[a-z0-9][a-z0-9-]*[a-z0-9]$` — kebab-case, lowercase, digits, hyphens. No spaces, no underscores, no capitals, no punctuation. |
| Length | 1–30 characters inclusive. |
| Uniqueness | Unique across the entire vault. Duplicate `project_id` → `INTEGRITY`. |
| Stability | Once set, never renamed casually. Renames are a [[heal-project-id-migrate]] operation, not a manual edit. |

The companion `project:` field stays free-form — a human-readable name like `"Moderating Underage Roleplay (AI Content Tagging Flow)"`. Both can coexist; the healer always reads `project_id` first.

### 1.1 Compliant example

```yaml
---
title: Moderating Underage Roleplay - Overview
project: Moderating Underage Roleplay (AI Content Tagging Flow)
project_id: moderating-roleplay
tags: [overview, project, fanvue]
up: <workplace> Experiments Hub
---
```

Hub names derived from this slug:
- `moderating-roleplay - Phases Hub.md`
- `moderating-roleplay - Directives Hub.md`
- `moderating-roleplay - Agent Log Hub.md`

### 1.2 Non-compliant examples

| Project_id | Why it fails |
|---|---|
| _missing_ | Required. |
| `Moderating Underage Roleplay via the AI content tagging flow` | Spaces; capitals; >30 chars. |
| `My Album` | Space; capital. |
| `clutr_main` | Underscore. |
| `MA` | OK on length, fails on capitals. |
| `-x` | Leading hyphen. |
| (duplicate of another bundle's `project_id`) | Uniqueness violation. |

---

## 2. Derivation rules (when migrating)

When [[heal-project-id-migrate]] needs to invent a slug, it derives one from the **bundle folder name** in this order:

1. Lowercase the folder name.
2. Replace any run of non-`[a-z0-9]` characters with a single hyphen.
3. Strip leading/trailing hyphens.
4. If >30 chars, truncate at the last hyphen ≤30 chars.
5. If still >30 chars or empty after sanitisation, halt with INTEGRITY (humans pick a slug).
6. If the result collides with an existing `project_id` in the vault, append `-2`, `-3`, … until unique.

The derived slug is **proposed** — the migration operation either applies it directly when running with `--auto` (default for clearly-derived bundle names) or pauses and surfaces the proposal for the human when the bundle name is ambiguous.

### 2.1 Worked examples

| Bundle folder | Derived `project_id` |
|---|---|
| `Clutr/` | `clutr` |
| `My Album/` | `my-album` |
| `Moderating Underage Roleplay/` | `moderating-underage-roleplay` (28 chars — under cap) |
| `<workplace> App Starter/` | `fanvue-app-starter` |
| `My Show/` | `my-show` |
| `Moderating underage roleplay via the AI content tagging flow/` | (>30 → truncate at last hyphen ≤30 → `moderating-underage-roleplay`) |

---

## 3. What changes when project_id changes

A `project_id` rename is a destructive cascade — never run by routine heal, only by the explicit [[heal-project-id-migrate]] operation. The cascade:

1. **Overview frontmatter** — `project_id:` updated; `updated:` bumped.
2. **All hub files in the bundle** — file rename `<old> - <Folder> Hub.md` → `<new> - <Folder> Hub.md`. Hub frontmatter `title:`, `up:` (in nested hubs) updated.
3. **All child file frontmatter** — `up:` rewritten to point at the renamed hub.
4. **All wikilinks across the vault** — every `[[<old> - <Folder> Hub]]` (or any link to a renamed file) is rewritten. Aliases preserved.
5. **ExecLog** — one bundle-scoped event: `project-id-migrate from=<old> to=<new> hubs=N children=M wikilinks=K`.

If any step fails part-way, the operation aborts and rolls back the Overview's `project_id:` so the next run sees the same starting state.

---

## 4. Healer responsibilities (routine)

[[heal-project-id]] (the routine sub-skill, runs every iteration as Step 4 of [[08 - System/Operations/heal.md|heal]]):

1. **Backfill.** Phase files missing `project_id:` get the value copied from their bundle Overview. (Existing behaviour.)
2. **Format validate.** Every Overview's `project_id:` is checked against the regex / length rules. Failures emit `detection: project_id_invalid_format`. **No auto-fix** — invent-a-slug is migration territory, not routine heal.
3. **Uniqueness scan.** All Overviews loaded; duplicate `project_id` values emit `INTEGRITY: project_id_duplicate` and halt the iteration.
4. **Coherence check.** When the Overview has `project_id: foo` but the bundle's hubs are named `<bar> - … Hub.md`, emit `detection: project_id_hub_mismatch` (signals stale migration).

What heal does **not** do automatically:
- Invent a `project_id` for a bundle that lacks one.
- Rewrite `project_id` to fix format / case.
- Rename hub files.

All of those are [[heal-project-id-migrate]] operations, gated by the human running it explicitly.

---

## 5. Migration runbook (one-shot per bundle)

When a bundle has missing or non-compliant `project_id:`:

1. Run [[heal-project-id-migrate]] with `dry_run=true`. Review proposed slug + cascade.
2. If the proposed slug is wrong, set `project_id:` manually in the Overview to the desired slug, then re-run with `dry_run=true` to confirm only the cascade actions remain.
3. Re-run with `dry_run=false`. Verify hub renames + wikilink patches in git diff before committing.
4. Run [[08 - System/Operations/heal.md|heal]] — should now report zero `project_id_*` detections for this bundle.

---

## 6. Relationship to other conventions

- [[Fractal Linking Convention]] §1: hub naming pattern uses `<Project>` as a placeholder. This convention defines that `<Project>` is **always `project_id`**, never the free-form `project:` label.
- [[Tag Convention]]: a project tag (family 5) is also derived from `project_id` (e.g. `project-clutr`, `project-my-album`). Migration cascades to tags too.
- [[Minimal Code Max Utility]]: this convention is one rule — slug-shaped, kebab-case, unique. No exceptions, no flags, no edge cases. The smallest possible identity contract.

---

## 7. Detection signatures (for the healer)

```
detection: project_id_missing      — Overview has no project_id key at all
detection: project_id_invalid_format — present but fails regex / length
detection: project_id_hub_mismatch  — hubs reference an old slug
INTEGRITY: project_id_duplicate    — two Overviews share a project_id
INTEGRITY: project_id_unrecoverable — bundle folder name yields no valid slug; human must pick
```

Each maps 1:1 to an action in [[heal-project-id]] (routine validation) or [[heal-project-id-migrate]] (one-shot rename).
