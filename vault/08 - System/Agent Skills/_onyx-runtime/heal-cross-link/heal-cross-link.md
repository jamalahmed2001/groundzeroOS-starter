---
title: heal-cross-link
tags: [skill, onyx-runtime, heal, graph]
type: skill
replaces: (new — no predecessor)
lines_replaced: 0
version: 0.1
created: 2026-04-27
updated: 2026-04-27
status: draft
---

# Skill: heal-cross-link

> Detect and fix wikilinks that cross the system ↔ bundle boundary, or one bundle ↔ another. Per the [[Fractal Linking Convention]] and the no-cross-link rule, system-level docs (`08 - System/`) never wikilink to project-bundle specifics (`01 - Projects/`, `02 - Fanvue/`, `03 - Ventures/`, `10 - OpenClaw/`) and vice versa. Cross-bundle wikilinks (one project bundle wikilinking another) are also forbidden. Relationships across boundaries live in **frontmatter only** (`parent_directive:`, `references:`, `applies_to:`, `derived_from:` etc.).

## Purpose

Find every cross-boundary wikilink in the vault and fix it by either:

- **Hard-fixable** — the wikilink resolves to a system directive that has a known frontmatter key (`parent_directive` for content marketers wrapping the system content-marketer, etc.). Replace the wikilink with `\`<target>\`` (backticked literal) in the body, and add the frontmatter relationship if missing.
- **Detection-only** — the wikilink is informational ("see also") or has no canonical frontmatter key. Emit a `cross_link_review` detection; the human writes a follow-up rule (e.g. add a new frontmatter key) or strips the link manually.

## Why the rule exists

The vault is a fractal graph: every bundle is a self-contained unit with its own hub at the root. Wikilinks across bundles or to system globals fail the "rip out one bundle" test — if you delete `ManiPlus/` to share its directives publicly, every wikilink to `ManiPlus - Knowledge` from a system doc becomes a broken graph edge in the recipient vault. Same in reverse: a public starter-vault that copies system directives shouldn't carry orphaned `[[ManiPlus - Knowledge]]` references.

Frontmatter relationships solve both: they're declarative, they're keyable, they don't render as broken graph edges, and they're trivial to rewrite when bundles move or get sanitised.

## Inputs

- `vault_path: string`
- `scope: "all" | "bundle"` — default `all`. When `bundle`, restricts to one bundle (`bundle_path:` required).
- `bundle_path: string | null`
- `dry_run: bool` — default false.
- `auto_replace: bool` — default true. When true, replace wikilinks with backticked literal text. When false, emit detections only.

## Outputs

- `fixes: CrossLinkFix[]` — `{ path, line, before, after, classification }[]` where classification is one of:
  - `bundle_to_system` — fixed by replacing wikilink with backticked literal
  - `system_to_bundle` — fixed same way
  - `bundle_to_bundle` — fixed same way
- `detections: CrossLinkDetection[]` — `{ path, line, link, reason }[]` (cases needing human judgement)

## Algorithm

### Step 0 — Classify the boundary

Every markdown file in the vault belongs to one of these zones:

- **system** — under `08 - System/`
- **dashboard** — under `00 - Dashboard/`, `04 - Reading/`, `05 - Inbox/`, etc. (vault-meta)
- **bundle:<bundle-id>** — under any project-bundle root (one of `01 - Projects/`, `02 - Fanvue/`, `03 - Ventures/`, `10 - OpenClaw/`). The bundle-id is derived from the path segment immediately under the domain (e.g. `10 - OpenClaw/Automated Distribution Pipelines/ManiPlus/...` → bundle = `ManiPlus`).

Two files are in the **same zone** if they share the same classification (same bundle, both system, etc.). Otherwise they cross a boundary.

### Step 1 — Walk every markdown file

For each markdown file under `vault_path` (excluding `_archive/`, `.trash/`, `_drafts/`):

1. Determine the file's zone.
2. Extract every wikilink: regex `\[\[([^|\]]+?)(\|[^\]]+?)?\]\]`.
3. For each wikilink target, resolve it via Glob to the file it points at.
4. Determine the target's zone.
5. If source-zone ≠ target-zone → **cross-link found**.

### Step 2 — Skip safe cross-link types

Some cross-zone wikilinks are explicitly allowed:

- **`up:` frontmatter wikilinks** that point at the immediate parent hub — these are the legitimate fractal up-edges. Even when an episode-shots-hub points up to its episode root file, that's same-bundle (episode is part of bundle).
- **System hub navigation** — within `08 - System/`, sub-hubs link up to `System Hub.md`.
- **Conventions / Principles / Templates** wikilinks BETWEEN system docs (these are intra-system).

The skill skips wikilinks classified as in-zone before reaching the cross-link branch.

### Step 3 — Classify and fix

For each cross-link:

#### `bundle_to_system` (most common)

A bundle directive references a system directive. Pattern: `[[content-marketer]]`, `[[scene-composer]]`, `[[qc-reviewer]]`, etc.

**Fix logic:**

1. Check if the bundle directive's frontmatter has a `parent_directive:`, `wraps:`, `references:` key that matches the target.
   - If yes → replace `[[content-marketer]]` (or `[[content-marketer|Content Marketer]]`) with `` `content-marketer` `` (backticked literal).
   - If no → add the relevant frontmatter key (`parent_directive: <target>` for the first cross-link to a system directive; `references: [list]` for subsequent ones), then replace.
2. Auto-fix only if `auto_replace: true`. Otherwise emit detection.

#### `system_to_bundle`

A system doc wikilinks to a bundle file (e.g. `[[ManiPlus - Knowledge]]` from a system principle). Always wrong — system docs are bundle-agnostic. Strip and replace with the literal name in backticks. If the system doc genuinely needs a bundle example, lift it to a code block: `` `ManiPlus - Knowledge.md` `` rather than a wikilink.

#### `bundle_to_bundle`

Bundle A wikilinks to Bundle B. Almost always wrong (would break if either bundle is moved or shared independently). Same backtick fix.

**Exception:** if Bundle A's frontmatter declares a `derived_from: B` or `extends: B` relationship and the wikilink target is the bundle's Overview, this is a legitimate inheritance edge — keep the wikilink. (Rare; flag in detection.)

### Step 4 — Re-validate frontmatter

After auto-replacement, re-parse the file's frontmatter. If a new `parent_directive:` / `references:` key was added, validate:

- The target file exists.
- The relationship makes sense given the bundle's profile (a `content` profile bundle wrapping `engineering` profile system directive is suspicious — emit `mismatched_profile` detection).

### Step 5 — ExecLog

For each applied fix, call `tools/write-exec-log.sh` with status `HEAL`, summary `cross-link:<class> path=<relative>`.

### Step 6 — Report

Return aggregated `fixes` + `detections`.

## Invariants

- **Body wikilinks across boundaries are always wrong.** The rule has no opt-out tag — even `context-only` files don't get to wikilink across.
- **One Edit per file.** All cross-link fixes in a file collapse to a single Edit call.
- **Frontmatter additions are append-only.** The skill never reorders or removes existing frontmatter keys.
- **`updated:` bumped on every modified file.**
- **Non-destructive.** The skill never deletes the wikilink target's file. Only rewrites the link text in the source.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `unresolvable_target` | Wikilink target doesn't resolve via Glob (broken link). | Emit `rule: cross_link_broken` detection; healer-broken-links handles it separately. |
| `mismatched_profile` | Auto-added `parent_directive:` points at a directive whose profile doesn't match the bundle's profile. | Emit `cross_link_review` — the human decides if the wrap is intentional (legitimate cross-profile inheritance) or a mistake. |
| `cycle` | Adding the parent_directive relationship would create a cycle (A → B → A). | Emit INTEGRITY error; halt. |

## Examples

**Example 1 — bundle→system body wikilink (the maniplus-marketer case from 2026-04-27):**

Input body line:
```markdown
You wrap the generic [[content-marketer|Content Marketer]] directive with ManiPlus-specific voice…
```

Input frontmatter (no parent_directive key):
```yaml
name: maniplus-marketer
type: directive
tags: [directive, maniplus, content, marketing]
up: ManiPlus - Directives Hub
```

After skill (auto-replace + frontmatter add):

Frontmatter:
```yaml
name: maniplus-marketer
type: directive
tags: [directive, maniplus, content, marketing]
up: ManiPlus - Directives Hub
parent_directive: content-marketer
```

Body:
```markdown
You wrap the generic `content-marketer` directive (declared as `parent_directive:` in this file's frontmatter) with ManiPlus-specific voice…
```

**Example 2 — system→bundle hub wikilink (from a system Convention or Principle):**

Input body:
```markdown
See [[ManiPlus - Knowledge]] for an example of how a content bundle compounds learnings.
```

After skill:
```markdown
See `ManiPlus - Knowledge.md` (under `10 - OpenClaw/Automated Distribution Pipelines/ManiPlus/`) for an example of how a content bundle compounds learnings.
```

(Backticked path, not a wikilink. The system doc remains bundle-agnostic; the example is illustrative, not navigational.)

**Example 3 — bundle→bundle wikilink (the Cypher Lane → Higher Branch case from earlier development):**

If a Cartoon Remakes show bible wikilinks `[[The Higher Branch - Universe Bible]]` from inside `Cypher Lane/`, the skill replaces with backticked literal and emits a `bundle_to_bundle` fix. If both bundles are inside the same project (Cartoon Remakes is one project with multiple shows), this isn't a cross-link — same-bundle within-project wikilinks are fine. The skill's zone-classifier checks bundle-id, not show-id.

## How to invoke

Load Master Directive + this skill + [[Fractal Linking Convention]]. Prompt the agent:

```
Run heal-cross-link against the vault, scope=all, dry_run=false, auto_replace=true.
Report summary.
```

Agent walks every md file, classifies wikilinks, applies fixes, returns counts per classification.

## Relationship to other heal-* skills

- **heal-fractal-links** handles the `up:` chain and hub structure. Cross-link detection is intentionally split into this skill because its rule is independent (a file with a perfect `up:` chain can still have body cross-links that violate the boundary).
- **heal-broken-links** (planned, not yet a skill) handles wikilinks whose target doesn't resolve. Different problem class — broken means the target was renamed/deleted; cross-link means the target exists but is in the wrong zone.

Both should be in the standard heal sweep alongside heal-fractal-links.
