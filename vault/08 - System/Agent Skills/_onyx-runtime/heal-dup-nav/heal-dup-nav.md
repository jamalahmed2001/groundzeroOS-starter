---
title: heal-dup-nav
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/healer/drift.ts (NAV_BLOCK_RE + deduplicateNavLinks + nav-collapse passes)
lines_replaced: 90
version: 0.1
created: 2026-04-24
updated: 2026-04-27T11:59:53Z
status: draft
up: Agent Skills - _onyx-runtime Hub
---

# Skill: heal-dup-nav

> Collapse duplicate `## 🔗 Navigation` blocks within a single file; deduplicate wikilinks inside the retained block.

## Purpose
Over time, copy-paste and over-eager healing can leave a file with two or three `## 🔗 Navigation` sections. Each section may repeat the same wikilinks. This skill enforces: **exactly one nav block per file**, **no duplicate wikilinks within that block**.

Separate from [[heal-fractal-links]] (which enforces *what* the nav block should contain). This skill fixes *structure*; fractal-links fixes *content*.

## Inputs
- `vault_path: string`
- `ignore_dirs: string[]` — default `['.git', 'node_modules', '_Archive']` (plus `.trash/` and `.onyx-backups/` always)

## Outputs
- `collapsed: CollapseRecord[]` — `{ path, nav_count_before: int, nav_count_after: 1, links_deduped_in_retained: int }[]`
- `errors: ErrorRecord[]`

## Nav block definition

A "nav block" is any `## 🔗 Navigation` heading followed by its body until the next `##` heading (or `#` at start of line, not `##+`), or end of file.

Regex: `## 🔗 Navigation[\s\S]*?(?=\n## |\n# (?!#)|\Z)`

Important: **do not use the `m` flag** on this regex. With `m`, `$` would match end-of-line and truncate the match at the nav heading itself, leaving link lines in the body — causing accumulating duplicates on each subsequent run.

## Algorithm

### Step 1 — Enumerate candidates
Glob `<vault_path>/**/*.md`, excluding `ignore_dirs`, excluding `.trash/` and `.onyx-backups/` always.

### Step 2 — For each file, count nav blocks
Use the regex above. Count matches:

- **0 matches** → skip. No nav block; nothing to collapse.
- **1 match** → proceed to Step 4 (dedupe links within the single block).
- **> 1 match** → proceed to Step 3 (collapse + dedupe).

### Step 3 — Collapse multiple nav blocks to one

1. Identify the first nav block (by start index). Keep it verbatim (including its body).
2. Identify subsequent nav blocks. Remove them from the body (each is replaced with empty string).
3. Collapse any run of 3+ newlines resulting from the removal to exactly 2 newlines (`\n\n\n+` → `\n\n`).
4. On the retained first block, apply Step 4 (link dedup).
5. Write back. Bump `updated:`.

**Write order matters.** Process from last match to first when splicing out bodies — preserves offsets of earlier matches.

### Step 4 — Deduplicate wikilinks within a single nav block

Within the retained nav block body:
1. Split body into lines.
2. For each line, extract the first wikilink target: regex `\[\[([^\]|]+)` (everything up to `]` or `|`).
3. Track `seen: Set<string>`. For each line:
   - If line has no wikilink → keep as-is (preserves prose, dashes, spacing).
   - If wikilink target is already in `seen` → drop the line (duplicate).
   - Otherwise → add to `seen`, keep line.
4. Re-join lines.
5. If the deduped body differs from the original → write back. Bump `updated:`.

### Step 5 — Record
For each modified file, push onto `collapsed` with counts. Append one line to ExecLog via `tools/write-exec-log.sh` with status `HEAL`, summary `dup-nav:collapsed path=<relative> blocks_before=<N> deduped=<M>`.

## Invariants

- **Preserve the first nav block verbatim** (positional precedence — the first occurrence wins).
- **Preserve non-link lines** within a nav block (dashes, spacing, subheadings, descriptive prose).
- **Atomic write per file**: one Edit call combining both collapse and dedup.
- **Never modify files with zero nav blocks** — even if they'd look better with one.
- `updated:` bumped only if content actually changed.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `regex_failure` | File has a nav-shaped heading but the body pattern doesn't close cleanly (malformed markdown) | Skip; emit detection `malformed_nav_block`. |
| `write_failed` | Filesystem error on write | Record in `errors`; continue with next file. |
| `empty_retained_block` | After dedup, the retained block has no content left (all lines were duplicate wikilinks with no prose) | Keep the `## 🔗 Navigation` heading; leave body empty. Fractal-links will repopulate if needed. |

## Examples

**Example 1 — two nav blocks collapse to one:**

Input (excerpt):
```markdown
## 🔗 Navigation

- [[My Podcast - Overview|My Podcast]]
- [[My Podcast - Knowledge|Knowledge]]

# My Podcast — Episodes Hub

Body content here.

## 🔗 Navigation

- [[My Podcast - Overview|My Podcast]]

## Episodes
```

After skill:
```markdown
## 🔗 Navigation

- [[My Podcast - Overview|My Podcast]]
- [[My Podcast - Knowledge|Knowledge]]

# My Podcast — Episodes Hub

Body content here.


## Episodes
```

The second nav block removed; first block kept verbatim.

**Example 2 — duplicate wikilinks within one block:**

Input:
```markdown
## 🔗 Navigation

- [[My Album - Overview|My Album]]
- [[My Album - Overview|Home]]
- [[My Album - Knowledge|Knowledge]]
```

After skill:
```markdown
## 🔗 Navigation

- [[My Album - Overview|My Album]]
- [[My Album - Knowledge|Knowledge]]
```

Second link with same target `My Album - Overview` dropped (first one — with the `My Album` alias — wins).

**Example 3 — preserve non-link lines:**

Input:
```markdown
## 🔗 Navigation

**UP:** [[Clutr - Overview|Clutr]]

---

See also: prose mentioning a [[sibling-note]] which should only appear once.
```

After skill: **unchanged** — all lines unique (the `**UP:**` bold is not a duplicate of the wikilink), dashes preserved, prose preserved.

**Example 4 — zero nav blocks:**

File has no `## 🔗 Navigation` heading. Skip entirely — not our concern (that's fractal-links' job to decide whether to add one).

## Relationship to other heal skills

- Runs after [[heal-frontmatter-drift]] — both operate on the same file; heal-dup-nav structure fix is cleaner if frontmatter is already normalised.
- Runs before [[heal-fractal-links]] — fractal-links assumes a single nav block exists to verify content. If there are duplicates, this skill collapses first.
- Never touches frontmatter. Strictly a body operation.
