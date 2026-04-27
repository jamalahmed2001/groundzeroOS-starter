---
title: consolidate-bundle
tags:
  - skill
  - onyx-runtime
  - consolidate
type: skill
version: 0.1
created: 2026-04-27
updated: 2026-04-27
status: draft
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[Agent Skills Hub|Agent Skills Hub]]

# Skill: consolidate-bundle

> Profile-agnostic bundle collapser. Takes any bundle whose work has stopped — content, engineering, research, personal, client, business, recurring — discovers its kind-tagged children, extracts the right content per kind, composes one consolidated node, then archives the sources. Authoritative directive: [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle operation]]. This skill is the executable.

## Purpose

Implement the [[consolidate-bundle]] operation as a deterministic, kind-tag-driven procedure. The skill is **the same code path for every profile** — content/engineering/research/personal/etc. Profile-specificity comes from the kind tags on the bundle's children, not from skill branches.

## Inputs

- `bundle_path: string` — absolute path to the bundle directory (must contain exactly one `*Overview.md`).
- `dry_run: bool` — default `true`. Always run dry first; only set `false` after the human reviewed the plan.
- `force: bool` — default `false`. Allow consolidation when active/blocked phases are detected (rare; usually wrong).
- `auto: bool` — default `false`. Skip the human-pause between dry-run report and apply. Use only for batch-rerunning idempotently after a verified dry-run.
- `archive_subdir: string` — default `_archive/<consolidation_date>/`. Where the source files move on apply.
- `min_coverage_ratio: float` — default `0.20`. Halt if the consolidated node body is below this fraction of source bytes (extractor missed too much).
- `leave_stub: bool` — default `false`. Whether to leave a thin "Archived → see Consolidated" stub in the now-empty bundle folder.

## Outputs

- `plan: ConsolidationPlan` — what will/would happen (always returned, even on apply).
- `applied: AppliedRecord | null` — present when `dry_run=false` and apply succeeded.
- `errors: ErrorRecord[]`

`ConsolidationPlan`:
```
{
  bundle_path,
  bundle_kind: "onyx-episode" | "onyx-album" | "onyx-project" | "onyx-show" | "<other>",
  target_consolidated_path,
  archive_dir,
  source_count, source_bytes,
  sources_by_kind: { [kind]: count },
  sections: [{ name, source_count, body_bytes_estimate }],
  coverage_ratio_estimate,
  warnings: [string],
  pre_flight: { active_phases: [path], blocked_phases: [path], unclassified_sources: [path] }
}
```

## General principles for agent synthesis

**Composition is agent-driven, not mechanical.** The agent reads every source file in full and writes contextually-aware sections. Bullet-greppers and first-N-line extractors are insufficient — they miss the *meaning* of a phase / log / track / shot. The verbatim `<details>`-collapsed log bodies remain as the unredacted truth; the agent's prose is the *index into* that truth.

When composing each section, follow these (project-agnostic) principles:

1. **Concrete over abstract.** "Implemented thumbs-up/down feedback API in `feedbackRouter.ts`, exposed via `creatorProcedure` for thumbs and `agencyAdminProcedure` for free-text" beats "added feedback feature".
2. **What changed in the world.** Each phase summary names what now exists (file paths, tables, endpoints, deployed services, published outputs) that didn't before.
3. **Why, not what, when relevant.** Decisions worth preserving include the *reason* — "chose UUID over int because exposing sequential IDs leaks information" — not just "chose UUID".
4. **Failure teaches.** Gotchas, blockers, retries, false starts — capture them. They're the most-often-needed part of the consolidated node.
5. **Faithful, not promotional.** Don't oversell. If a phase shipped 60% of intent, say so. If a track was abandoned, say so.
6. **The future-reader test.** Imagine the reader who finds this node 18 months later trying to remember what was built. What do they need? Write for them.
7. **Direct quotes for unique voice.** When a log captures a specific phrase / Decision-with-a-capital-D / gotcha-as-stated, quote it verbatim — don't paraphrase.
8. **Cross-link sparingly.** External wikilinks belong in `# References`, not buried mid-prose. The consolidated node is a self-contained record.

The same eight principles authoritatively live in [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle operation]] §"General principles for agent synthesis"; this skill restates them so the executable lens stays in sync with the contract lens.

## Algorithm

### Step 0 — Pre-flight

1. Validate `bundle_path` exists and is a directory.
2. Glob `<bundle_path>/*Overview.md` AND `<bundle_path>/<basename> - Overview.md`. Must find exactly one. Halt with `bundle_overview_missing` or `multiple_overviews` otherwise.
3. Read Overview frontmatter. Detect bundle kind from its kind tag (family 2 or 8): `onyx-project`, `onyx-episode`, `onyx-album`, `onyx-show`, or generic `bundle`.
4. **Active/blocked phase scan.** Glob `<bundle_path>/Phases/*.md` and any `<bundle_path>/**/Phases/*.md`. For each, parse frontmatter. If any has `status: active` or `status: blocked` → record path. If any found AND `force=false` → halt with `phases_in_flight: [paths]`.
5. **Completion state.** Read Overview's `consolidation_state:` frontmatter. If not `complete` AND `force=false` → halt with `bundle_not_marked_complete`.
6. **Phase-level consolidate flush.** For every completed phase whose learnings have not yet been merged into bundle's Knowledge.md, invoke [[08 - System/Operations/consolidate.md|consolidate]]. (Detect via per-phase `consolidated:` frontmatter flag, or by scanning Knowledge.md for the phase's dated reference line.)
7. **Heal pre-flight.** Run [[heal-kind-tag]] on the bundle scope. Halt with `unclassified_sources` if any source files lack a kind tag after that pass — refuse to consolidate ambiguous content.
8. Capture `now_iso` for the entire run.

### Step 1 — Discover and classify

Glob `<bundle_path>/**/*.md` excluding `_archive/`, `.git/`, `.trash/`. For each file, parse frontmatter; record:

```
{
  path,
  rel_path: relative to bundle_path,
  kind: <single family-2 or family-8 tag, or "untagged">,
  bytes: <file size>,
  sha256: <content hash>,
  frontmatter: {…},
  body: <full body content>
}
```

Classify by kind into a buckets map:

```
buckets = {
  bundle_overview: <single>,
  hubs: [],
  phases: [],
  operatives: [],
  logs: [],
  knowledge: [],
  kanban: [],
  docs: [],
  artefacts: [],
  assets: [],
  sub_bundles: [],     // nested onyx-show/episode/track/album/project
  directives: [],      // skipped — never consolidated
  context_only: [],    // skipped
  free_form: [],       // no rule fired — Profile-neutral mode picks these up
  untagged: []         // halt-cause if non-empty
}
```

### Step 2 — Plan target node

`bundle_name = basename(bundle_path)` (e.g. `E03 - <Title>`).
`target_path = <parent_of_bundle>/<bundle_name> - Consolidated.md`.

Idempotency check: if `target_path` exists AND its frontmatter has `consolidation_state: applied` → return early with `already_consolidated`.

Compute the consolidated node's tags:
- Primary: derive a `*-consolidated` kind tag from the bundle's own kind. Mapping: `onyx-episode` → `onyx-episode-consolidated`, `onyx-album` → `onyx-album-consolidated`, `onyx-show` → `onyx-show-consolidated`, `onyx-project` → `onyx-project-consolidated`, generic → `consolidated`.
- Inherit pipeline tag (family 5) from Overview.
- Inherit venture tag (family 6) from Overview.
- Inherit original kind tag (so `onyx-episode-consolidated` AND `onyx-episode` both apply — the consolidated node IS still an episode, just frozen).

### Step 3 — Compose the body

Render sections in fixed order. Skip empty sections silently.

**Step 3 is where the agent does its actual work.** Mechanical assembly of section headings + tables is fine; mechanical extraction of *content* is not. For each section below, the agent reads the relevant source files in full and writes the section's prose following §"General principles for agent synthesis". Per-phase paragraphs, per-log timeline summaries, the Knowledge re-write, and the Final state bullet list are all agent-composed — not generated by greppers or first-N-bullet extractors. The `<details>`-collapsed verbatim blocks beneath each prose section are the safety net.

#### `# Overview`

Pull from `bundle_overview`:
- One italic line built from frontmatter: `_<title> · <consolidation_date> · <project_id> · <pipeline> / <venture>_`
- Skip Overview's nav block.
- Body's first 3 paragraphs (or until first `##` heading after intro).
- If Overview has an `## Outcome` or `## Final disposition` section, append it.

#### `# Final state`

From `artefacts` + `assets` + Overview's "Outcome" or "What shipped" section:

```
- **<filename>** — <one-line description from frontmatter>
  - Path: `<absolute or relative path>`
  - Size / duration / version / endpoint as available
```

For non-media bundles where there are no artefacts: pull from Overview's outcome paragraph as a single bullet. For research bundles: "Conclusion: <line>". For health protocols: "Result: <measurement>".

#### `# Activity timeline`

From `logs`, sorted by L-number ascending. Per log:

```
## L<N> — <phase title>

<5-bullet condensed summary distilled from log body — focus on what happened, what changed state, what was decided>

<details>
<summary>Verbatim log body</summary>

<full log content>

</details>
```

The 5-bullet summary is the only place the skill exercises judgement. The verbatim body inside `<details>` is the safety net.

#### `# Phases`

From `phases` + `operatives`, sorted by `phase_number`. Per phase:

```
## <phase_id> — <phase_name>

| Status | Started | Completed | Duration |
|---|---|---|---|
| <status> | <date> | <date> | <approx> |

**Tasks:**
<task list with final check states from phase body>

**Outcome:** <Outcome paragraph if present, else "(see L<N> log)">
```

If bundle has no phases (research / personal / curated): omit section silently.

#### `# Knowledge`

Verbatim copy of `knowledge[0].body` if present (already the merge target of phase-level consolidates). Replace any `# <Project> — Knowledge` H1 inside it with `## Knowledge` to avoid heading collision — but otherwise preserve.

#### `# Decisions / Gotchas`

Two sub-sections. Pull from:
1. Per-phase frontmatter `decisions:` and `gotchas:` lists.
2. Knowledge.md's `## Decisions` / `## Gotchas` sections.

Dedupe by exact line match. Order: chronological (by phase_number).

#### `# Sub-bundles`

For each item in `sub_bundles`:
- If the sub-bundle has been consolidated (its consolidated node exists at expected path) → wikilink to that.
- Else → wikilink to its Overview, with `(not consolidated)` suffix flagging it.

If sub-bundles exist, recursive consolidation may have to run bottom-up first. The skill does NOT recurse automatically (avoids cascading destructive actions); it surfaces a warning in the plan.

#### `# References`

Scan Overview body + Knowledge body for wikilinks pointing OUTSIDE the bundle. Render as:

```
- [[<external link>]] — <what context the link appeared in>
```

Useful for research bundles whose value is largely in the cross-references.

#### `# Working notes`

(Profile-neutral fallback.) For files in `free_form` bucket — content that didn't classify but is real bundle content. Per file:

```
<details>
<summary><filename> · created <date></summary>

<file body verbatim>

</details>
```

#### `# Source manifest`

Always present. Table:

| # | Path | Kind | Bytes | sha256 (8) |
|---|---|---|---|---|
| 1 | `<rel_path>` | `<kind>` | 1234 | `abcd1234` |

Truncated sha256 (first 8 chars) for compactness; full hashes preserved in frontmatter `consolidated_from_sha:` map.

#### `# Archive`

```
Source files moved to `_archive/<consolidation_date>/`.
Restore any single file with: `git mv <archive_path> <bundle>/<original_path>`.
Restore the whole bundle: `git mv _archive/<consolidation_date>/* <bundle>/`.
```

### Step 4 — Coverage check

```
consolidated_bytes = byte length of rendered body
source_bytes = sum of bucket bytes EXCLUDING directives, context_only, hubs (nav-only)
coverage_ratio = consolidated_bytes / source_bytes
```

If `coverage_ratio < min_coverage_ratio` → halt with `coverage_below_threshold(<actual>%, <required>%)`. Do not write target node.

The `<details>` blocks inside the timeline carry verbatim log bodies — this is what keeps coverage above the floor in practice. If logs are sparse OR many sources are media references (asset paths only), legitimate ratios can be lower; tune `min_coverage_ratio` per profile if needed.

### Step 5 — Dry-run report

Always returned via `plan` output. Contents per `ConsolidationPlan` schema. If `dry_run: true`, exit here.

### Step 6 — Apply (Pass A: write target)

1. Compute final frontmatter:
```yaml
title: <bundle_name> — Consolidated
tags: [<derived consolidated kind>, <pipeline>, <venture>, <inherited kind>]
type: consolidated
consolidation_state: applied
consolidation_date: <now_iso>
consolidated_from:
  - <rel_path 1>
  - …
consolidated_from_sha:
  <rel_path 1>: <sha256>
  …
source_count: <N>
source_bytes: <total>
coverage_ratio: <pct>
project_id: <slug>
up: <bundle's Overview's up>
```
2. Write target node with single Write call.

### Step 7 — Apply (Pass B: verify written)

1. Re-read target. Parse frontmatter.
2. Validate `consolidated_from` length == `source_count`.
3. Validate first 5 entries' sha256 by re-hashing source files (still in place, not yet archived).
4. Recompute coverage ratio from the written body.
5. Any verification failure → halt with `verify_failed`. Do NOT proceed to archive. Target node remains; human inspects.

### Step 8 — Apply (Pass C: archive sources)

Order matters. Hubs and Overview move LAST so the bundle is navigable until the final move.

For each source file in dependency order:
1. Phase files, log files, asset files, knowledge, kanban, docs (leaves first).
2. Hub files (Phases Hub, Logs Hub, etc.).
3. Bundle's Overview.

Per file:
```
git mv "<source>" "<archive_dir>/<rel_path>"
```
Fall back to plain `mv` if not in a git repo. Create `archive_dir/<rel_path>'s parent directory>` first if needed.

### Step 9 — Apply (Pass D: vault-wide wikilink rewrite)

Glob `<vault>/**/*.md` excluding `.git/`, `node_modules/`, `.obsidian/`, `_archive/`, `.trash/`, target node itself.

For each file, scan for `[[<source-basename>]]` (with or without alias) where `<source-basename>` matches any consolidated source's basename. Rewrite to `[[<bundle_name> - Consolidated#<section-anchor>]]` where the section anchor matches the section the source rolled into:

| Source kind | Section anchor |
|---|---|
| onyx-phase, onyx-operative | `Phases` |
| project-log | `Activity timeline` |
| project-knowledge | `Knowledge` |
| pipeline-artefact, onyx-asset | `Final state` |
| onyx-track | `Sub-bundles` (if album), `Final state` (if track is the artefact) |
| free-form | `Working notes` |
| Overview | (no anchor — root link) |

Aliases preserved. Single Edit per file with hits.

### Step 10 — ExecLog (bundle-scoped)

Append ONE line to `00 - Dashboard/ExecLog.md`:

```
<now_iso> CONSOLIDATE-BUNDLE bundle="<rel_bundle>" sources=<N> bytes=<total> kept=<consolidated_bytes> coverage=<pct>% archived_to="<rel_archive>" target="<rel_target>"
```

### Step 11 — Post-apply verification

1. Run [[heal-fractal-links]] scoped to the bundle's parent. Expect zero Rule 2 detections.
2. Run [[heal-kind-tag]] on the target node. Expect the consolidated kind tag is present and family-ordered.
3. If either fails → record `verify_failed_post_apply`; do not auto-rollback. Surface to human.

## Invariants

- **Idempotent.** Running twice with the same input is a no-op (target's `consolidation_state: applied` short-circuits).
- **Never hard-deletes.** All sources are `git mv`'d to `_archive/`. Reversible.
- **Never auto-rolls-back.** On verify failure, halt and surface; the human chooses.
- **Single target write.** The consolidated node is written exactly once per run, atomically.
- **Single ExecLog event.** Per-source archive lines are NOT emitted; the source manifest in the target body IS the audit trail.
- **No skill branches per profile.** Every profile uses the same Steps 1-11; the only profile-dependence is which buckets are non-empty.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `bundle_overview_missing` / `multiple_overviews` | Step 0.2 | Halt before any read. |
| `phases_in_flight` | active or blocked phase, no `force` | Halt with offending paths. |
| `bundle_not_marked_complete` | Overview's `consolidation_state` ≠ complete, no `force` | Halt; suggest the operator set the state. |
| `unclassified_sources` | Step 0.7 found untagged files | Halt; recommend [[heal-kind-tag]]. |
| `coverage_below_threshold` | Step 4 | Halt; surface ratio. |
| `verify_failed` | Step 7 hash/length mismatch | Halt; target retained, sources NOT archived. |
| `archive_move_failed` | Step 8 partial failure | Continue with remaining moves; record failures. After loop, halt before Pass D. Manual git status will show the partial state. |
| `wikilink_patch_partial` | Step 9 some Edits fail | Continue; record. Bundle archive already complete by this point. |
| `verify_failed_post_apply` | Step 11 | Surface; human resolves. |

## Examples

See [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle operation]] §"Examples" — Examples 1–6 cover content/engineering/research/personal/client/business profiles. The skill executes the same Steps 1–11 across all of them; the variation is purely which buckets are populated.

## Native primitives relied on

- **Glob** — bundle walk, vault-wide wikilink scan in Step 9.
- **Read** — frontmatter + body per source.
- **Write** — target consolidated node creation (Step 6).
- **Edit** — wikilink rewrites (Step 9).
- **Bash `git mv`** — source archival (Step 8). Bash `sha256sum` for hashing.

## Relationship

- Authoritative contract: [[08 - System/Operations/consolidate-bundle.md|consolidate-bundle operation]].
- Phase-level cousin: [[consolidate]] — invoked by Step 0.6 to flush per-phase learnings before bundle collapse.
- Pre-flight dependency: [[heal-kind-tag]] — kind tags are the basis of every section's extraction template.
- Post-flight verifier: [[heal-fractal-links]] — confirms no dangling wikilinks after archive.
- Conventions: [[Tag Convention]] §1.1 (kind tags), [[Fractal Linking Convention]] (bundle structure), [[Project ID Convention]] (slug for target filename).
