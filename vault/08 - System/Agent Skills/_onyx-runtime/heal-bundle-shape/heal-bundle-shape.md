---
title: heal-bundle-shape
tags: [skill, onyx-runtime, heal, structure]
type: skill
replaces: (new — no predecessor)
lines_replaced: 0
version: 0.1
created: 2026-04-27
updated: 2026-04-27
status: draft
up: Agent Skills - _onyx-runtime Hub
---

# Skill: heal-bundle-shape

> Detect and fix bundle-layout violations: root-level archive files that should be in `_archive/`, "shared phase template" folders named like operational `Phases/`, multiple overlapping documentation buckets (`Docs/` + `Insights/` + root files), missing canonical bridge files (`<Project> - Master Pipeline.md`, `<Project> - <Catalog>.md`).
>
> Surfaced by the Suno Albums restructure on 2026-04-27 — the bundle had grown organically and no longer matched the canonical fractal pattern that Cartoon Remakes (and every other media bundle) follows.

## Purpose

Enforce **branch-out leaf-tree fractal**: every project bundle is a root with subdirs of categorized leaves. No flat root pollution, no parallel "documentation" subdirs, no shared template folders that look like operational paths.

## The canonical bundle shape

For a media-style bundle (content / video-production / audio-production / publishing profiles):

```
<Project>/
├── <Project> - Overview.md            ← bundle root (required)
├── <Project> - Bible.md               ← brand identity (or Universe Bible / Show Bible)
├── <Project> - Master Pipeline.md     ← end-to-end op cycle description
├── <Project> - Craft Standards.md     ← QC / quality bar
├── <Project> - <Catalog>.md           ← list of sub-units (Episode Catalog, Album Catalog, ...)
├── <Project> - Knowledge.md           ← accumulated learnings
├── <Project> - Kanban.md              ← phase board
├── <Project> - Decisions.md           ← architectural decisions
├── Directives/                         ← bundle-local directives + Hub
├── _<unit>-phases-template/            ← per-unit op templates (NOT a Phases hub)
├── Logs/                               ← project-level logs (per-unit logs nest)
├── Phases/                             ← project-level phases (rare; ops are usually per-unit)
├── <UnitsFolder>/                      ← Episodes / Albums / Issues / Releases
│   └── <unit>/
│       ├── <unit> - Overview.md
│       ├── <unit> - <child>.md         ← T01-T0N tracks, S01-SNN shots, etc.
│       ├── Phases/                     ← per-unit ops instances
│       ├── Reviews/                    ← QC reviews
│       └── Shots/ | drafts/ | ...      ← unit-specific subfolders
├── Voices/  | Characters/ | Locations/ ← shared assets (when applicable)
└── _archive/                            ← retired phase groups, deleted units, etc.
```

For an engineering bundle (engineering profile):

```
<Project>/
├── <Project> - Overview.md
├── <Project> - Knowledge.md
├── <Project> - Kanban.md
├── <Project> - Decisions.md
├── <Project> - Repo Context.md          ← stack + key areas (managed blocks)
├── Directives/                           ← optional
├── Phases/                               ← phase files (P1, P2, …)
├── Logs/                                 ← per-phase execution logs
└── _archive/
```

## Inputs

- `vault_path: string`
- `bundle_path: string | null` — restrict to one bundle, else iterate every project bundle.
- `dry_run: bool` — default true.

## Outputs

- `fixes: ShapeFix[]` — `{ path, rule, before, after }[]`
- `detections: ShapeDetection[]` — `{ path, issue, suggested-fix }[]`

## Algorithm

For each project bundle (folder containing an `Overview.md` or `Bible.md` or a frontmatter `type: episode|album|...` root file):

### Rule 1 — Root archive files belong in `_archive/`

**Detect:** any root-level file matching:
- `* - Phase Group * - Archive.md`
- `* - * (P[0-9]+-P[0-9]+) - Archive.md`
- `* (retired).md`
- `* (deprecated).md`
- `* - Archive *.md`

**Fix:** `mkdir -p <bundle>/_archive` if needed, `mv` the file into `_archive/`. Update any wikilinks pointing at it (`[[<filename>]]` → `[[_archive/<filename>]]` is unnecessary because Obsidian resolves by basename — but if explicit path-prefixed wikilinks exist, update them).

### Rule 2 — Shared phase-template folders should be prefixed `_`

**Detect:** a `Phases/` folder at bundle root **AND** units folders (e.g. `Albums/`, `Episodes/`, `Issues/`) exist as siblings. The combination signals that the project's `Phases/` is actually shared *templates* that get instantiated per unit; the canonical name for that is `_<unit-name>-phases-template/`.

Example: Suno Albums had `Phases/Suno Albums - O0...md` (templates) plus `Albums/<album>/` (where ops should run per-album). The right shape: rename to `_album-phases-template/`.

**Fix (apply only if no per-unit Phases folders exist yet):**
- Rename `Phases/` → `_<unit>-phases-template/` where `<unit>` is the singular form of the units folder name (`Episodes` → `episode`, `Albums` → `album`).
- Drop the `Phases Hub.md` inside (templates aren't a graph hub; they're a folder of templates).

**Detection-only (do NOT auto-fix) if:**
- Per-unit Phases folders ALREADY exist (e.g. `Albums/<album>/Phases/`). Mixing modes is intentional state; surface as `mixed_phase_layout` detection.

### Rule 3 — Documentation bucket consolidation

**Detect:** project bundle has BOTH a `Docs/` subfolder AND root-level `<Project> - <Title>.md` documentation files. This causes split-knowledge anti-pattern.

**Fix:** lift `Docs/<Project> - <Title>.md` → `<bundle>/<Project> - <Title>.md` (just promote them up one level). Files without the `<Project> - ` prefix (e.g. `Suno Track Library.md`) get renamed during lift (`<Project> - Track Library.md`).

After lift, remove empty `Docs/` and any orphan `Docs Hub.md` (move it to `_archive/` as `<Project> - Docs Hub (retired).md`).

### Rule 4 — Insights / research-artefact buckets stay separate

**Detect:** `Insights/`, `Research/`, `qc-reports/` — research/audit artefact folders.

**Action:** detect-only. These ARE valid sub-buckets when the content is per-cycle research output, not synthesised documentation. The healer's role is to ensure their files carry `tags: [context-only, ...]` so they don't pollute the orphan scan.

For each MD file in these folders:
- If it lacks `context-only` tag → **fix:** add it.
- If it has `up:` pointing nowhere → **detection:** `research_orphan` (no auto-fix; the human decides if it should be linked or `context-only`).

### Rule 5 — Required canonical bridge files

For media bundles, surface missing:
- `<Project> - Album Catalog.md` / `<Project> - Episode Catalog.md` / `<Project> - <Unit> Catalog.md` — list of sub-units with status.
- `<Project> - Master Pipeline.md` — end-to-end op-cycle description.
- `<Project> - Craft Standards.md` — quality bar.

**Detect:** files missing.

**Fix:** **detect-only**. The agent surfaces a stub-creation suggestion; the human writes the actual content (the format depends on the project's domain).

### Rule 6 — No cross-bundle wikilinks (delegated to heal-cross-link)

This skill doesn't duplicate cross-link checking — that's [[heal-cross-link]]'s job. heal-bundle-shape just re-flags any cross-link surfaced by heal-cross-link as a `bundle_shape:cross_link` detection so it shows up in the bundle-shape report alongside the structural issues.

### Rule 6.5 — Hubs don't link sideways to sibling hubs

A hub's body wikilinks should only point at:
- Its **own children** (the files that have `up: <this hub>`).
- Its **single parent** via the nav block's `**UP:**` line.

Sideways links from one hub to a sibling hub (e.g. Phases Hub → Episodes Hub → Directives Hub) create graph "cross-beams" between sibling clusters, which is exactly the visual tangle the branch-out leaf-tree fractal is supposed to prevent.

**Detect:** any hub file whose body contains a wikilink to a file ending in ` Hub.md` that is **not** its parent (per the nav block) and **not** in its own `## Children` section.

**Auto-fix:** rewrite the offending wikilink as a backticked text reference. Example:
- Before: `- [[<Project> - Episodes Hub|Episodes Hub]] — per-episode files`
- After: `Related project nodes are reachable via [[<Project> - Overview]]'s Children section.`

The pattern: replace the entire `## Related` section (or whatever section contains the sideways links) with a single line pointing at the Overview as the single hub-of-hubs. Project-level Overview is the only place the cross-cutting "everything links to everything" pattern is allowed; intermediate hubs stay narrowly scoped.

**Detection-only:** if a sideways link exists but no auto-replaceable pattern matches (e.g. it's prose-embedded, not in a list), surface as `sideways_hub_link` detection.

### Rule 6.6 — Catalog files use text references, not wikilinks, for graph-parented children

When a project has a Catalog file (`<Project> - Album Catalog.md`, `<Project> - Episode Catalog.md`) AND a sibling Hub that is the canonical graph parent of those children (`Albums/<Project> - Albums Hub.md`), the Catalog should show child names as **backticked text** or in a status table, not wikilinks. Wikilinks from the Catalog duplicate parentage and create extra graph edges that the Hub already provides.

**Detect:** Catalog file contains wikilinks to children that are also wikilinked from the canonical Hub.

**Auto-fix:** convert Catalog's child wikilinks to backticked path references. The Hub's wikilinks remain (canonical parent). Example:
- Before: `| 1 | Drift | JammieD | 9 | mastered | [[Drift - Overview\|Drift]] |`
- After: `| 1 | Drift | JammieD | 9 | mastered | Albums/Drift/ |`

### Rule 7 — Per-unit Phases (target, detection-only)

For media bundles where the canonical pattern is per-unit operations (Cartoon Remakes pattern), detect:
- Each `<UnitsFolder>/<unit>/` HAS a `Phases/` subfolder containing `<Project> - <unit> - O<N> - <stage>.md` (or similar).

**Action:** detect-only. Bulk-instantiating per-unit Phases from a shared template is destructive (changes phase numbering, may break run-history references). Surface a `missing_per_unit_phases` detection per unit so the operator can manually instantiate when ready.

## Algorithm summary

```
for each bundle in projects_glob:
    bundle_root = detect-bundle-root(folder)   # Overview.md / Bible.md / type:episode|album
    if not bundle_root: skip

    apply Rule 1 — move root archives to _archive/
    apply Rule 2 — rename Phases/ → _<unit>-phases-template/ (with safety check)
    apply Rule 3 — lift Docs/ files to root
    apply Rule 4 — add context-only tags to research artefacts
    detect Rule 5 — missing canonical bridge files
    detect Rule 6 — cross-bundle wikilinks (delegated)
    detect Rule 7 — missing per-unit Phases

emit fixes[] + detections[]
```

## Invariants

- **Never delete content.** Files move to `_archive/`, never to `/dev/null`.
- **Never break wikilinks.** When moving a file, update path-prefixed wikilinks pointing at it. Bare `[[basename]]` wikilinks are auto-resolved by Obsidian and don't need updating.
- **Never instantiate per-unit Phases from templates automatically.** Phase instantiation changes numbering and frontmatter; this is a deliberate operator action, not a healer fix.
- **`updated:` bumped on every modified file.**
- **One Edit per file** when possible — coalesce frontmatter additions (Rule 4 tag) and body changes.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `mixed_phase_layout` | Both flat `Phases/` and per-unit `<unit>/Phases/` exist | Detection — operator decides. |
| `archive_collision` | Moving a file would overwrite an existing one in `_archive/` | Suffix the moved file with `<basename>.<unix-ms>`. |
| `missing_units_folder` | Catalog.md exists but no `<UnitsFolder>/` on disk | Detection (`catalog_orphan`). |
| `unsafe_rename` | Renaming `Phases/` → `_X-phases-template/` would break N path-prefixed wikilinks (count > 0) | Detection only — surface the count, ask the operator to greenlight. |

## Examples

### Example 1 — Suno Albums fixture (2026-04-27)

Pre-state:
```
Suno Albums/
├── Suno Albums - Phase Group 1 (Build P01-P07) - Archive.md   ← root archive
├── Suno Albums - Phase Group 2 (Ops O1-O8).md                 ← root archive
├── Suno Albums - Phase Group 2b (Ops O9-O10).md               ← root archive
├── Phases/Suno Albums - O0...O10.md                           ← shared templates
├── Docs/                                                      ← split docs
│   ├── Suno Albums - Genre Profiles.md
│   ├── Suno Albums - QC Standards.md
│   └── Suno Track Library.md
├── Insights/                                                  ← research artefacts
└── Albums/<album>/<album> - Overview.md + tracks
```

Healer applies:
- Rule 1 → moves 3 root archives to `_archive/`.
- Rule 2 → renames `Phases/` → `_album-phases-template/` (safe: no per-unit Phases yet).
- Rule 3 → lifts Docs/* to root (`Suno Track Library.md` → `Suno Albums - Track Library.md`).
- Rule 4 → tags Insights/* with `context-only`.

Healer detects:
- Rule 5 → "Missing: `Suno Albums - Album Catalog.md`, `Suno Albums - Master Pipeline.md`."
- Rule 7 → "Each `Albums/<album>/` is missing a `Phases/` subfolder. The operator can instantiate via the album-cycle directive."

### Example 2 — Cartoon Remakes (already canonical)

Pre-state:
```
Cartoon Remakes/
├── Cartoon Remakes - Overview.md
├── Cartoon Remakes - Universe Bible.md
├── Cartoon Remakes - Master Pipeline.md
├── Cartoon Remakes - Episode Catalog.md
├── _episode-phases-template/
├── Shows/<show>/...
└── _archive/
```

Healer applies: nothing (already canonical).
Healer detects: nothing.

## How to invoke

Load Master Directive + this skill + [[Fractal Linking Convention]]. Prompt the agent:

```
Run heal-bundle-shape against the vault, scope=all, dry_run=false. Report summary.
```

## Relationship to other heal-* skills

- **heal-fractal-links** handles `up:` chain + hub structure. Bundle-shape is different — it's about which folders + which root files exist.
- **heal-cross-link** handles wikilinks crossing system↔bundle boundaries.
- **heal-bundle-shape** (this skill) handles the bundle's own *folder layout* matching the canonical fractal pattern.

The three together: heal-fractal-links makes the graph traversable, heal-cross-link keeps zones independent, heal-bundle-shape keeps the directory structure consistent across projects.
