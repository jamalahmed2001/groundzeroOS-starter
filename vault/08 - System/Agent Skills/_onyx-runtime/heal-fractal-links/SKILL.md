---
title: heal-fractal-links
tags: [skill, onyx-runtime, heal, graph]
type: skill
replaces: (new — no predecessor TS module)
lines_replaced: 0
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-fractal-links

> **Validated 2026-04-24** by manual application to the three `Automated Distribution Pipelines/` projects (ManiPlus, Suno Albums, Cartoon Remakes). Applied against 28 phases + 6 per-album Overviews + 8 hubs. Net effect: tree-shaped graph instead of star topology.

## Purpose
Enforce the [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]] across the vault — every note has exactly one parent, leaves don't link to grandparents, hubs don't link sideways to siblings.

## Inputs
- `vault_path: string`
- `projects_glob: string` — default `"{02 - Fanvue/**,03 - Ventures/**,10 - OpenClaw/**}"`
- `scope: "project" | "domain" | "all"` — default `"all"`. Optionally restricts to one project (e.g. scope=project + project_id=Clutr) or one domain.
- `project_id: string | null` — when scope=project.
- `dry_run: bool` — default false. When true, report intended fixes without writing.

## Outputs
- `fixes: FractalFix[]` — `{ path: string, rule: 1-5, before: string, after: string }[]`
- `detections: StructuralDetection[]` — `{ path: string, issue: string }[]` (rule 5 findings; no auto-fix)

## Algorithm

For every project bundle under `projects_glob`, perform the five checks in order. Skip files carrying `context-only` tag (per Tag Convention).

### Step 1 — Identify the bundle's hubs and leaves

For each project bundle (folder containing an `Overview.md`):

1. **Overview** — any file matching `*Overview.md` in the bundle root. One per bundle.
2. **Declared hubs** — any file matching `* - * Hub.md` at the bundle root OR in a first-level subfolder (e.g. `Phases/`, `Directives/`, `Logs/`, `Episodes/`, `Albums/`).
3. **Leaf candidates** — every other markdown file in the bundle that isn't in `.trash/`, `_archive/`, or under a `context-only`-tagged subtree.

For each leaf, infer its **expected hub** from its location:
- In `<bundle>/Phases/<phase>.md` → expected hub: `<Project> - Phases Hub`.
- In `<bundle>/Directives/<directive>.md` → expected hub: `<Project> - Directives Hub`.
- In `<bundle>/Logs/<log>.md` → expected hub: `<Project> - Agent Log Hub`.
- In `<bundle>/Episodes/<Show>/<episode>.md` → expected hub: `<Project> - <Show> Hub` (show-level hub) OR `<Project> - Episodes Hub` (if no per-show hub).
- In `<bundle>/Albums/<Album>/<Album> - Overview.md` → expected hub: `<Project> - Albums Hub`.
- In `<bundle>/Albums/<Album>/<Album> - T<NN> - <title>.md` → expected hub: `<Album> - Overview` (recursive fractal).
- At the bundle root with name `<Project> - <single-file>.md` (Knowledge, Kanban, Decisions) → expected hub: `<Project> - Overview` (direct leaf of project root).

### Step 2 — Rule 1: `up:` present

For every non-overview, non-hub node: read frontmatter. If `up:` is missing or empty → **Fix**: add `up: <expected hub>` based on Step 1 inference. Record `rule: 1`.

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

### Step 6 — Rule 5: hub child-coverage (detect-only)

For every hub, compare its body's listed children (wikilinks inside the hub body) to the files in its expected subfolder. If any folder child is missing from the hub body → emit a detection `rule: 5` `missing_from_hub` `<child path>`. No auto-fix — humans may intentionally omit drafts or legacy items.

### Step 7 — ExecLog

For each applied fix, call `tools/write-exec-log.sh` with status `HEAL`, summary `fractal-links:rule<N> path=<relative>`.

### Step 8 — Report

Return aggregated `fixes` + `detections`. Caller decides whether to treat detections as warnings or escalations.

## Invariants

- **Tag wins over folder.** If a file carries `context-only` tag, the skill skips it — even if it's in a folder with other phase files.
- **One Edit per file.** Multiple rule-violations on the same file coalesce into a single Edit call that rewrites frontmatter + nav block together. Atomicity.
- **`updated:` bumped on every modified file.** Master Directive invariant 3.
- **Hub-creation is conservative.** New `<Project> - <Folder> Hub.md` files are only created when the folder has > 2 markdown children AND at least 3 of them have `up:` pointing to a non-existent hub (the auto-fix target). Lower thresholds leave an ephemeral hub.
- **Non-destructive.** The skill never deletes content, never unlinks a valid parent, never creates cycles (a hub's `up:` can never point at one of its own children).

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `ambiguous_hub` | A leaf's location matches multiple expected hubs (e.g. `Episodes/Show1/E01.md` could belong to either Episodes Hub or Show1 Hub) | Emit `rule: 3` detection with both candidates; no auto-fix. |
| `no_hub_name_convention` | A folder name doesn't fit the standard pattern (e.g. `Research/`, `Book/`) | Use the fallback `<Project> - <Folder> Hub.md`. If the hub doesn't exist and the folder has > 2 files, auto-create (conservative rule). |
| `circular_up` | Following `up:` chain returns to the starting node | Emit INTEGRITY error, halt this sub-check for the bundle. |
| `orphan_leaf` | Leaf has no frontmatter or is in a folder with no obvious parent | Emit `rule: 1` detection; no auto-fix (likely needs human classification). |

## Examples

**Example 1 — double-linked phase file (fixture case from ManiPlus, 2026-04-24):**

Input frontmatter:
```yaml
up: ManiPlus - Overview
```
Input nav:
```markdown
## 🔗 Navigation

- [[ManiPlus - Overview|ManiPlus]]
- [[L21 - Research [episode topic]|L21 — Execution Log]]
```

After skill:
Frontmatter:
```yaml
up: ManiPlus - Phases Hub
```
Nav:
```markdown
## 🔗 Navigation

**UP:** [[ManiPlus - Phases Hub|Phases Hub]]
```

**Example 2 — hub with sideways link (Book Hub):**

Input nav:
```markdown
## 🔗 Navigation

- [[ManiPlus - Overview|ManiPlus]]
- [[ManiPlus - Episodes Hub|Episodes]]
- [[ManiPlus - Knowledge|Knowledge]]
```

After skill:
```markdown
## 🔗 Navigation

**UP:** [[ManiPlus - Overview|ManiPlus]]
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
