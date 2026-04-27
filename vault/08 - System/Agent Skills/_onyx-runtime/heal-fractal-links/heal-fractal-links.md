---
title: heal-fractal-links
tags: [skill, onyx-runtime, heal, graph]
type: skill
replaces: (new — no predecessor TS module)
lines_replaced: 0
version: 0.1
created: 2026-04-24
updated: 2026-04-27T12:50:12Z
status: draft
---

# Skill: heal-fractal-links

> **Validated 2026-04-24** by manual application to the three `Automated Distribution Pipelines/` projects (My Podcast, My Album, My Show). Applied against 28 phases + 6 per-album Overviews + 8 hubs. Net effect: tree-shaped graph instead of star topology.

## Purpose
Enforce the [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]] across the vault — every note has exactly one parent, leaves don't link to grandparents, hubs don't link sideways to siblings.

## Inputs
- `vault_path: string`
- `projects_glob: string` — default `"{02 - <workplace>/**,03 - Ventures/**,10 - OpenClaw/**}"`
- `scope: "project" | "domain" | "all"` — default `"all"`. Optionally restricts to one project (e.g. scope=project + project_id=Clutr) or one domain.
- `project_id: string | null` — when scope=project.
- `dry_run: bool` — default false. When true, report intended fixes without writing.

## Outputs
- `fixes: FractalFix[]` — `{ path: string, rule: 1-5, before: string, after: string }[]`
- `detections: StructuralDetection[]` — `{ path: string, issue: string }[]` (rule 5 findings; no auto-fix)

## Algorithm

**Recursive folder walk (universal).** The skill walks **every folder** under the projects glob — not just canonical `Phases/`, `Logs/`, `Directives/`, `Episodes/`, `Albums/` subfolders. Every folder containing ≥2 markdown files (excluding archive-like folders such as `_archive/`, `_drafts/`, `_assets/`, `qc-reports/`) gets a hub if one is missing. Sub-bundles (a character folder, a location folder, an episode subfolder with `reviews/` and `shots/` etc.) follow the same fractal pattern recursively — every depth level, every folder.

### Parent-target resolution (added 2026-04-27 after <character>/reviews/ chain-break)

When computing the `up:` target for a newly-created hub, do NOT assume the immediate parent folder will get its own hub. The parent folder may have only sub-folders (no md files of its own), in which case forward-referencing a non-existent `<parent> Hub` would create a dangling chain.

**Walk up the folder tree, picking the FIRST real parent encountered:**

1. **Existing hub** at any ancestor folder (matched by `* Hub.md` filename).
2. **Existing Overview / Bible** (`*Overview.md`, `*Show Bible.md`, `*Universe Bible.md`, `*Bible.md`) at any ancestor folder.
3. **Same-name-as-folder file at the grandparent** — when `Characters/<Character>/` has no md children of its own but `Characters/<Character>.md` exists as a sibling-of-folder file, that's the natural parent. Common pattern in media bundles where a character / location is BOTH a description file (sibling) AND a folder (with subfolders for assets / reviews / generations).
4. **Domain hub** at the top of the walk if nothing above resolves.

If none of the four resolves → emit `orphan_leaf_no_inference` detection; the human picks the parent.

This rule ensures `<character>/reviews/Reviews Hub.md`'s `up:` resolves to the character file, not to a non-existent `<Character> Hub`. The chain then walks: Reviews Hub → character (file) → Characters Hub → Example Show Hub → … to root.

This was promoted from "canonical-folder-only" to "every-folder" on 2026-04-27 after the recursive-heal pass discovered 55 missing hubs in `My Show/Shows/<show>/{Characters,Locations}/<entity>/reviews/` subtrees and similar nested production structures.

**Step 1's hub inference table** lists the canonical folders for naming convenience, but the recursive walk in Steps 2/5 applies to ALL folders. Hubs for non-canonical folders use the path-derived naming pattern: `<project_id> - <parent-segment> - <folder-name> Hub.md` (e.g. `My Show - <Character> - Reviews Hub.md`).

### Hub-name fallback when no project Overview ancestor exists

Some folders sit OUTSIDE any project bundle — `00 - Dashboard/`, `08 - System/Templates/`, `08 - System/Agent Context/Memory Archive/`. Walking up from those folders never reaches an `Overview.md` / `Bible.md`, so the path-derived naming pattern's `<project_id>` segment is undefined.

**Fallback rule (added 2026-04-27 after the null.md bug):**

When `findProjectRoot(folder)` returns null:
- Hub name = `<folder-basename> Hub.md` (e.g. `Memory Archive Hub.md`, `Dashboard Hub.md`, `Quick Start Overviews Hub.md`).
- The hub's `up:` resolves via the parent-target walk-up (existing hub / Overview / domain hub at top of vault).
- **Never** generate a hub name that contains the literal string `"null"` — if any path segment is undefined, halt the hub creation for that folder and emit `hub_name_underivable` detection.

This keeps `08 - System/` and `00 - Dashboard/` walkable as their own self-contained subtrees without forcing them to be project bundles.

For every project bundle under `projects_glob`, perform the five checks in order. Skip files carrying `context-only` tag (per Tag Convention).

### Step 1 — Identify the bundle's hubs and leaves

For each project bundle (folder containing an `Overview.md` **or a Bible-equivalent root file**):

1. **Overview (or equivalent)** — one of:
   - `*Overview.md` (canonical for engineering/research/personal/client bundles)
   - `*Show Bible.md` or `*Universe Bible.md` (canonical for media-bundle shows under `Shows/<show>/`)
   - `*Bible.md` (catch-all for show or world bibles)

   Any of these mark a folder as a bundle root. One per bundle. The bundle's `project_id` derivation falls back to the bundle folder basename when the root file is a Bible (Bibles don't carry `project_id` in their frontmatter by convention).
2. **Declared hubs** — any file matching `* - * Hub.md` at the bundle root OR in a first-level subfolder (e.g. `Phases/`, `Directives/`, `Logs/`, `Episodes/`, `Albums/`, plus media-bundle equivalents `Characters/`, `Locations/`, `Shots/`).
3. **Leaf candidates** — every other markdown file in the bundle that isn't in `.trash/`, `_archive/`, or under a `context-only`-tagged subtree.

For each leaf, infer its **expected hub** from its location:
- In `<bundle>/Phases/<phase>.md` → expected hub: `<Project> - Phases Hub`.
- In `<bundle>/Directives/<directive>.md` → expected hub: `<Project> - Directives Hub`.
- In `<bundle>/Logs/<log>.md` → expected hub: `<Project> - Agent Log Hub`.
- In `<bundle>/Episodes/<Show>/<episode>.md` → expected hub: `<Project> - <Show> Hub` (show-level hub) OR `<Project> - Episodes Hub` (if no per-show hub).
- In `<bundle>/Albums/<Album>/<Album> - Overview.md` → expected hub: `<Project> - Albums Hub`.
- In `<bundle>/Albums/<Album>/<Album> - T<NN> - <title>.md` → expected hub: `<Album> - Overview` (recursive fractal).
- At the bundle root with name `<Project> - <single-file>.md` (Knowledge, Kanban, Decisions) → expected hub: `<Project> - Overview` (direct leaf of project root).

### Step 2 — Rule 1: `up:` present (default-on auto-fix)

For every non-overview, non-hub node: read frontmatter. If `up:` is missing or empty → **Fix**: add `up: <expected hub>` based on Step 1 inference. Record `rule: 1`.

**Default-on rationale.** The 2026-04-27 orphan-heal pass found 66 files missing `up:` across the projects scope — every one of them resolved to an unambiguous expected hub via folder-based derivation, with zero false positives. There's no class of file that legitimately *should not* have `up:` (per [[Fractal Linking Convention]] §2.1, every note has exactly one `up:`). The only reasons a file would lack one are: (a) it was created by a tool that didn't set the field, (b) a manual edit accidentally removed it. Auto-set is the right default.

**Skip conditions** (do not auto-set):
- File carries `context-only` tag (graph-invisible by convention).
- File is itself a domain-root (top-level `<Domain> Hub.md` files have nothing higher to point at).
- Step 1's hub inference returned multiple candidates (record as `ambiguous_hub` detection — human picks).

### Step 3 — Rule 2: `up:` target exists

For every node with `up: <target>`: resolve the target via Glob. If it doesn't exist in the vault → either create the missing hub (if fixable) or emit a detection. Auto-create logic: if `<Project> - Phases Hub.md` is declared as `up:` target for N phase files but doesn't exist, create a skeleton hub with the current children listed. Otherwise emit `rule: 2` detection.

### Step 4 — Rule 3: `up:` points at correct parent

For every node, compare actual `up:` value to expected hub from Step 1 inference. If they differ → **Fix**: overwrite `up:` with expected hub. Record `rule: 3` with `before` / `after`.

**Exceptions (do not rewrite):**
- A per-album Overview whose `up:` points at the Albums Hub (correct).
- A custom per-collection root (e.g. per-show hub) explicitly listed in a Project's Overview frontmatter `custom_hubs:` field.

### Step 5 — Rule 4: body nav has no grandparent cross-link

For every leaf (non-hub), locate its body's `## 🔗 Navigation` block. If present:
- If the block contains a wikilink to the project Overview (`[[<Project> - Overview...]]`) → **Fix**: rewrite nav block to the UP-only pattern: `**UP:** [[<parent hub>|<hub short name>]]`.
- If the block contains wikilinks to other project-level siblings (Knowledge, Kanban, Decisions, other hubs) → strip them. Only the UP link remains.
- Record `rule: 4` with full before/after of the nav block.

For every hub node, same logic but the UP is the Overview (not a grandparent hub). Sideways links in hub nav blocks are equally forbidden.

### Step 6 — Rule 5: hub child-coverage (auto-fix as of 2026-04-27)

For every hub, compare its body's listed children (wikilinks inside the hub body) to the files in its expected subfolder. For each folder child missing from the hub body → **Fix**: append `- [[<child basename>]]` under a `## Children` section in the hub body. If the hub has no `## Children` section, create one before the end of the body. Record `rule: 5` with the list of children added per hub.

**Why auto-fix now (was detect-only).** The 2026-04-27 orphan-heal pass on the projects glob found 12 hubs missing 65 children — all genuine omissions caused by hubs not being maintained as files were added. Auto-appending under `## Children` is mechanically safe: it never removes existing content, never reorders the existing list, never touches body prose elsewhere. Humans wanting to *exclude* a child should set `context-only` tag on that child (the skill skips those) or move the file out of the folder.

**Exceptions (do not auto-add):**
- Children carrying `context-only` tag (per [[Tag Convention]] §4.1).
- Children whose `up:` explicitly points at a different hub (legitimate cross-membership).
- Files matching the hub's own basename (avoid self-referencing).
- Files prefixed with `_` (per vault convention, leading-underscore files are private/draft).

### Step 7 — ExecLog

For each applied fix, call `tools/write-exec-log.sh` with status `HEAL`, summary `fractal-links:rule<N> path=<relative>`.

### Step 8 — Report

Return aggregated `fixes` + `detections`. Caller decides whether to treat detections as warnings or escalations.

## Invariants

- **Tag wins over folder.** If a file carries `context-only` tag, the skill skips it — even if it's in a folder with other phase files.
- **One Edit per file.** Multiple rule-violations on the same file coalesce into a single Edit call that rewrites frontmatter + nav block together. Atomicity.
- **`updated:` bumped on every modified file.** Master Directive invariant 3.
- **Hub-creation is universal-but-bounded** (revised 2026-04-27 from "conservative + 3-children threshold"). Every folder with ≥2 markdown files gets a hub if one isn't already present. Folders with ≤1 markdown file stay flat — children point at the parent folder's hub per [[Fractal Linking Convention]] §2.6. Archive-like folders (`_archive/`, `_drafts/`, `_assets/`, `qc-reports/`, `*.bak/`) are walked but no hub is auto-created (their content is reference, not active graph). Children inside archive-like folders inherit `up:` from the nearest non-archive parent hub.
- **Non-destructive.** The skill never deletes content, never unlinks a valid parent, never creates cycles (a hub's `up:` can never point at one of its own children).

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `ambiguous_hub` | A leaf's location matches multiple expected hubs (e.g. `Episodes/Show1/E01.md` could belong to either Episodes Hub or Show1 Hub) | Emit `rule: 3` detection with both candidates; no auto-fix. |
| `no_hub_name_convention` | A folder name doesn't fit the standard pattern (e.g. `Research/`, `Book/`) | Use the fallback `<Project> - <Folder> Hub.md`. If the hub doesn't exist and the folder has > 2 files, auto-create (conservative rule). |
| `circular_up` | Following `up:` chain returns to the starting node | Emit INTEGRITY error, halt this sub-check for the bundle. |
| `orphan_leaf_no_inference` | Leaf has no frontmatter at all OR is in a folder whose hub cannot be inferred (no project Overview ancestor) | Emit `rule: 1` detection; no auto-fix. **Distinct from a normal `up:` insertion**, which is now default-on per Rule 1. |

## Examples

**Example 1 — double-linked phase file (fixture case from My Podcast, 2026-04-24):**

Input frontmatter:
```yaml
up: Agent Skills - _onyx-runtime Hub
```
Input nav:
```markdown
## 🔗 Navigation

- [[My Podcast - Overview|My Podcast]]
- [[L21 - Research [episode topic]|L21 — Execution Log]]
```

After skill:
Frontmatter:
```yaml
up: My Podcast - Phases Hub
```
Nav:
```markdown
## 🔗 Navigation

**UP:** [[My Podcast - Phases Hub|Phases Hub]]
```

**Example 2 — hub with sideways link (Book Hub):**

Input nav:
```markdown
## 🔗 Navigation

- [[My Podcast - Overview|My Podcast]]
- [[My Podcast - Episodes Hub|Episodes]]
- [[My Podcast - Knowledge|Knowledge]]
```

After skill:
```markdown
## 🔗 Navigation

**UP:** [[My Podcast - Overview|My Podcast]]
```

Sideways links (Episodes Hub, Knowledge) removed. Body content unchanged.

**Example 3 — missing hub auto-creation:**

A project `Clutr/` has `Phases/P01.md` through `Phases/P08.md`. None have `up:` set, no `Clutr - Phases Hub.md` exists.

After skill:
- New file `Clutr/Clutr - Phases Hub.md` created with: frontmatter (`up: Clutr - Overview`, hub tags), nav block (UP only), body listing all 8 phases.
- Every P01–P08 phase gets `up: Clutr - Phases Hub` set.
- Clutr Overview's nav block updated to include a link to the new Phases Hub.

## How to invoke (current — agent-directive version)

Load Master Directive + [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]] + this skill. Prompt the agent:

```
Run heal-fractal-links against the vault, scope=all, dry_run=false. Report summary.
```

Agent performs Steps 1–8 and writes back. Equivalent to `onyx heal --fractal-only` once the CLI wrapper is added in Stage 7.
