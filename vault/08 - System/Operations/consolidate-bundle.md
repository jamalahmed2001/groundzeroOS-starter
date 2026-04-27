---
title: consolidate-bundle
tags:
  - system
  - operation
  - onyx
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
**Related:** [[08 - System/Operations/consolidate.md|consolidate (phase-level)]] · [[08 - System/Conventions/Tag Convention.md|Tag Convention §1.1]] · [[08 - System/Conventions/Fractal Linking Convention.md|Fractal Linking Convention]]

# Operation: consolidate-bundle

> **The "this work is done, collapse it" move — for any kind of project.** When a working bundle has reached a stop state, fold the whole working space into ONE comprehensive consolidated node, then archive the sources. The bundle could be a shipped video episode, a released music album, a launched product, a closed research project, a delivered client engagement, a wrapped personal experiment, a finished playbook, or a published book. The operation is **profile-agnostic** — it discovers what's in the bundle via kind tags ([[Tag Convention]] §1.1) and applies the matching extractors. Same code path for an engineering bundle as for a content bundle as for a research bundle.
>
> **Why this is not the same as [[consolidate]].** The phase-level `consolidate` extracts learnings from one finished phase into a long-running `Knowledge.md`. This operation collapses an *entire bundle* — many phases + logs + outputs + assets — into a self-contained "what shipped / what was learned / what was built" node. Both can be invoked: phase-level on the way through, bundle-level once the bundle stops.

## When to invoke

Whenever a bundle stops — for any reason, in any profile. Examples across pipelines + non-pipeline work:

| Profile | Bundle | Trigger |
|---|---|---|
| Content / media | Video episode, music album, podcast season | Published to platform |
| Engineering | Project shipped, feature flagged on, migration completed | Code merged + deployed + post-deploy verified |
| Research | Hypothesis tested, brief delivered, decision recorded | Final write-up signed off |
| Client / paid | Client engagement, deliverable closed | Invoice paid + handover done |
| Personal | Experiment, training cycle, trip planning, health protocol | Cycle complete or abandoned |
| Business | Product launch, marketing campaign, partnership discussion | Outcome recorded |
| Recurring | Weekly content batch, monthly review, quarterly OKR set | Period closed |

The operation has no opinion on which profile is being collapsed. The structure is the same: a bundle root, a set of children with kind tags, a stop condition. **If kind tags from [[Tag Convention]] §1.1 are correct, the consolidator works.** That's the whole point of having a canonical kind taxonomy.

**Do not invoke** while work is in flight. The operation refuses to run if any phase in the bundle is `phase-active` or `phase-blocked`. (Override: `--force` flag, gated by human.) For non-phase bundles (e.g. a research note bundle without phases), the stop condition is `consolidation_state: complete` on the bundle Overview.

## Preconditions

- Bundle has an `Overview.md` (or `<X> - Overview.md`) at its root.
- Bundle's frontmatter declares `consolidation_state:` of `complete` (set manually by the operator on shipping) OR the operation is invoked with `--assume-complete` flag.
- No phase in the bundle has `status: active` or `status: blocked`.
- Routine [[heal]] has run cleanly on the bundle within the last 24h (so kind tags + `up:` chains are correct — the kind-tag classification is what makes this operation generic).

## Read order

1. [[Tag Convention]] §1.1 — canonical kind tags drive per-source extraction templates.
2. [[Fractal Linking Convention]] — bundle structure expected.
3. [[Project ID Convention]] — slug used in the consolidated node's filename.
4. Bundle's `Overview.md` — frontmatter (project_id, pipeline, venture, content type), body (premise, scope).
5. Glob `<bundle_path>/**/*.md` — all source files in the bundle.

## Procedure

### Step 0 — Pre-flight

1. Validate bundle exists and contains an Overview file. If multiple Overviews → halt; ambiguous bundle.
2. Validate completion state per Preconditions. Halt with `not_complete` if violated and no `--force`.
3. Run [[consolidate]] (phase-level) on every phase in the bundle that has `status: completed` AND is not yet listed in the bundle's `Knowledge.md`. This guarantees Knowledge.md is up-to-date before collapse.
4. Snapshot bundle state for reversibility — record list of every file path + size + sha256 in the dry-run report.

### Step 1 — Discover and classify sources

Glob `<bundle_path>/**/*.md` (skip `.git/`, `_archive/` of same bundle, `.trash/`). For each file, read frontmatter and classify by structural-kind tag (per [[Tag Convention]] §1.1):

- `onyx-project` — bundle Overview (the spine of the consolidated node)
- `hub-project` — internal hubs (Phases Hub, Agent Log Hub, Directives Hub) — collapsed away; their listing role is replaced by the consolidated node's table-of-contents.
- `onyx-phase`, `onyx-operative` — phase / operative records
- `project-log` — execution logs
- `directive` — agent directive **(NOT consolidated — directives are reusable, leave in place)**
- `pipeline-artefact` — pipeline outputs (renders, mixes, exports). Reference path retained, not embedded.
- `onyx-show`, `onyx-episode`, `onyx-track`, `onyx-album` — content-bundle children (per the recursion rule: if the bundle IS one of these, child sub-bundles consolidate independently)
- `project-knowledge` — the Knowledge.md (becomes the Knowledge section)
- `project-kanban`, `project-docs` — appended verbatim (rare; usually small)
- `context-only` — skipped (graph-invisible by convention)
- _untagged_ — surfaced as a detection; abort consolidation until heal-kind-tag has classified.

If any source has no kind tag, halt with `unclassified_sources: [paths]`. Re-run [[heal-kind-tag]] first.

### Step 2 — Plan the consolidated node

Compute target path:

```
<bundle_parent>/<bundle_name> - Consolidated.md
```

Example: `Episodes/<show>/E03 - <Title>/` → `Episodes/<show>/E03 - <Title> - Consolidated.md`. The bundle folder itself is preserved (now empty except `_archive/`); the consolidated node sits beside it as the canonical reference.

Compute frontmatter:

```yaml
---
title: <bundle_name> — Consolidated
tags:
  - <one canonical kind tag derived from bundle type — e.g. onyx-episode-consolidated, onyx-album-consolidated>
  - <pipeline tag>
  - <venture tag>
type: consolidated
consolidation_state: applied
consolidation_date: <ISO>
consolidated_from:
  - <relative source path 1>
  - <relative source path 2>
  - …
source_count: <N>
source_bytes: <total>
project_id: <slug from bundle Overview>
up: <parent hub of the bundle>
---
```

Note: the `consolidation_state: applied` field on this node + the matching field set to `archived` on the bundle Overview are the idempotency markers — re-invocation detects the consolidated node already exists and is a no-op.

### Step 3 — Compose the body, kind-aware

Render sections in this order (omit any with no content):

| Section | Source kinds | Extraction template | Profile-neutral name |
|---|---|---|---|
| `# Overview` | bundle's `Overview.md` | Premise / scope / final disposition. Pull frontmatter → italics summary line, then the body's first 3 paragraphs (skip nav block). | universal |
| `# Final state` | `pipeline-artefact`, `onyx-asset`, body of bundle Overview's "Outcome" section if present | Bullet list of outputs/deliverables/decisions/state at close. Media: filename + size + duration. Engineering: deployed services + version. Research: conclusion + confidence. Personal: result + retro. References, not embeds. | applies to *any* bundle — what was the world's state when the bundle stopped? |
| `# Activity timeline` | `project-log` (sorted by L-number) | Each log file collapses to: `## L<N> — <phase title>` then a 5-bullet summary distilled from the log body. Original log body retained verbatim under a collapsed `<details>` block. | works for any pipeline run, research diary, training log, client engagement log |
| `# Phases` | `onyx-phase`, `onyx-operative` (sorted by phase_number) | Per phase: `## <phase id> — <name>` with frontmatter line (`status`, `dates`), final Tasks list (with checkmarks), Outcome paragraph if present. Body NOT verbatim — rely on timeline for execution detail. | omitted for bundles with no phases (e.g. note-collection projects) |
| `# Knowledge` | `project-knowledge` | Verbatim copy of Knowledge.md body (already consolidated by phase-level [[consolidate]] in Step 0). | universal |
| `# Decisions / Gotchas` | extracted per phase | Auto-collected from per-phase frontmatter `decisions:` and `gotchas:` lists if present, else from Knowledge.md sections of those names. | universal |
| `# Sub-bundles` | `onyx-show`, `onyx-episode`, `onyx-track`, `onyx-album` + any other bundle with `consolidation_state: applied` | Wikilinks to recursively-consolidated children. The recursion is bottom-up: tracks consolidate first, then their parent album. Same shape for sub-projects, child experiments, etc. | universal |
| `# References` | wikilinks pulled from Overview / Knowledge bodies pointing OUTSIDE the bundle | Bullet list of cross-bundle references (other projects mentioned, conventions cited, external resources linked). Useful for research bundles where the *links* are half the value. | optional; auto-filled if Overview body has external wikilinks |
| `# Source manifest` | every consolidated file | Table: `path`, `kind tag`, `bytes`, `sha256` — the audit trail for what was rolled in. | universal |
| `# Archive` | meta | One-liner: "Source files moved to `_archive/<timestamp>/`. Restore with `git mv`." | universal |

**Composition is agent-driven, not mechanical.** Each section is composed by the agent **reading every source file in full** and writing a contextually-aware summary that follows the general principles below. Bullet-greppers and first-N-lines extractors are insufficient — they miss the *meaning* of a phase / log / track / shot. The agent's job is to understand what the work actually was, what shipped, what was learned, and write that down at the right level of detail.

Each section is generated by the agent applying the right reading lens to the right source kinds — same agent invocation pattern for a video episode, a music album, a research project, a personal experiment, or a client engagement. Adding a new bundle profile only requires the children to carry correct kind tags (which [[heal-kind-tag]] handles). The operation never hardcodes a profile; the agent reacts to what's there.

### General principles for agent synthesis

When composing each section, follow these (project-agnostic) principles:

1. **Concrete over abstract.** "Implemented thumbs-up/down feedback API in `feedbackRouter.ts`, exposed via `creatorProcedure` for thumbs and `agencyAdminProcedure` for free-text" beats "added feedback feature".
2. **What changed in the world.** Each phase summary names what now exists (file paths, tables, endpoints, deployed services, published outputs) that didn't before.
3. **Why, not what, when relevant.** Decisions worth preserving include the *reason* — "chose UUID over int because exposing sequential IDs leaks information" — not just "chose UUID".
4. **Failure teaches.** Gotchas, blockers, retries, false starts — capture them. They're the most-often-needed part of the consolidated node.
5. **Faithful, not promotional.** Don't oversell. If a phase shipped 60% of intent, say so. If a track was abandoned, say so.
6. **The future-reader test.** Imagine the reader who finds this node 18 months later trying to remember what was built. What do they need? Write for them.
7. **Direct quotes for unique voice.** When a log captures a specific phrase / Decision-with-a-capital-D / gotcha-as-stated, quote it verbatim — don't paraphrase.
8. **Cross-link sparingly.** External wikilinks belong in `# References`, not buried mid-prose. The consolidated node is a self-contained record.

The verbatim `<details>`-collapsed log bodies remain — those are the unredacted truth. The agent's prose is the *index into* that truth.

### Profile-neutral mode

For bundles that are not pipeline-shaped — for example a research project that's just an Overview + 12 free-form notes + a Knowledge.md, with no `Phases/` or `Logs/` folders — the operation gracefully degrades:
- Skips empty sections (no `# Phases`, no `# Activity timeline`).
- Pulls free-form notes into a `# Working notes` section, sorted by `created:` frontmatter date, each note collapsed into a `<details>` block with title.
- Knowledge + Decisions + Source manifest remain. The result is a thin but complete consolidation.

For bundles that are *only* a hub of references (e.g. a curated reading list project) — the consolidated node is essentially the Overview's body + the References section + the Source manifest. Still useful as a single-node archival record.

### Step 4 — Coverage check

Compute:
- `consolidated_bytes` = byte count of the rendered consolidated node body
- `source_bytes` = sum of source file sizes (excluding directives + context-only + nav-only hubs)
- `coverage_ratio` = `consolidated_bytes / source_bytes`

If `coverage_ratio < 0.20` (consolidated node has less than 20% of source content), the extractors missed too much — halt with `coverage_below_threshold` detection. The 20% floor accounts for legitimate compression (5-bullet timeline summary vs full log body); below that, signal loss.

The `<details>`-collapsed verbatim log bodies in the timeline section should keep most runs comfortably above this floor.

### Step 5 — Dry-run report

Always produce a dry-run report before any writes:

```
=== consolidate-bundle DRY RUN ===
Bundle: <path>
Sources discovered: <N> (<bytes> total)
Sources by kind: { onyx-phase: 9, project-log: 9, onyx-asset: 47, … }
Skipped (non-bundle-bound): <count>  (directives + context-only + …)
Target consolidated node: <path>
Estimated body size: <bytes>
Coverage ratio: <%>
Archive destination: <path>/_archive/<timestamp>/

[List of sections with bullet counts]
[Source manifest preview, first 20 rows]
[Detected anomalies: missing tags, coverage warnings]
```

Halt for human review unless `--auto` was passed.

### Step 6 — Apply (only when `dry_run: false`)

Two-pass, in this order. **Never delete; always move to `_archive/`** so a rollback is `git mv` away.

**Pass A — Write the consolidated node.**
1. Compute target path. If a file already exists at that path with `consolidation_state: applied` → idempotent no-op, exit reporting "already consolidated".
2. Render frontmatter + body per Step 3.
3. Write the consolidated node atomically (single Write).

**Pass B — Verify.**
1. Re-read the consolidated node. Validate frontmatter (especially `consolidated_from` and `source_count`).
2. Confirm coverage ratio still ≥ threshold.
3. If verification fails, halt; do not archive sources. The consolidated node is left in place for the human to inspect.

**Pass C — Archive sources.**
1. Compute `archive_dir = <bundle_path>/_archive/<consolidation_date>/`.
2. For every source file in the consolidated_from manifest:
   - `git mv <source> <archive_dir>/<source-relative-to-bundle>` (preserves history; creates archive folder structure mirroring bundle).
   - Bash `git mv` fallback to plain `mv` if not in a git repo.
3. Bundle hubs (Phases Hub, Agent Log Hub, Directives Hub) are also moved — but only AFTER children, since hubs would otherwise dangle.
4. Archive the bundle's `Overview.md` LAST — it's the bundle's spine; archiving it last means at every moment the bundle has at least one navigable file.
5. Leave a stub `<bundle_name> - Archived.md` in the now-empty bundle folder pointing at the consolidated node. (Optional — set by `--leave-stub` flag; default off, since the consolidated node beside the folder is sufficient.)

**Pass D — Vault-wide wikilink rewrite.**
For every `[[<source-file-basename>]]` wikilink across the vault that pointed at an archived source:
- Rewrite to `[[<bundle_name> - Consolidated#<section anchor>]]` — section anchor matches the section the source was rolled into.
- Aliases preserved.
- This step is bounded to the vault scope minus `_archive/`.

### Step 7 — ExecLog event (bundle-scoped, single line)

```
<ISO> CONSOLIDATE-BUNDLE bundle="<rel_bundle_path>" sources=<N> bytes=<total> kept=<consolidated_bytes> coverage=<pct>% archived_to="<rel_archive_dir>" target="<rel_consolidated_path>"
```

One line per bundle. Per-source-archive lines are NOT emitted — they would explode the log for a 50-shot episode. The source manifest inside the consolidated node IS the audit trail.

### Step 8 — Verify (post-apply)

After Pass D:
1. Run [[heal-fractal-links]] on the bundle's parent — confirm zero Rule 2 detections (no dangling wikilinks).
2. Run [[heal-kind-tag]] on the consolidated node — confirm the new `*-consolidated` tag is present and family-ordered.

If either verification fails, the run is logged as `verify_failed` and the human inspects. No automatic rollback — manual `git mv` from `_archive/` brings sources back.

## Post-conditions & transitions

- Consolidated node exists at the bundle's parent level with `consolidation_state: applied`.
- Bundle folder contains only `_archive/<timestamp>/` (and possibly an Archived stub).
- Vault-wide wikilinks pointing at consolidated sources have been rewritten to the consolidated node + section anchor.
- ExecLog has one bundle-scoped event line.
- Routine [[heal]] on the next iteration sees a healthy graph (no dangling refs, kind tags correct).

## Error handling

| Code | When | Behaviour |
|---|---|---|
| `bundle_not_found` | bundle_path missing or not a directory | Halt before any read. |
| `not_complete` | bundle has active/blocked phase OR `consolidation_state ≠ complete` AND no `--force` | Halt; surface specific blockers. |
| `unclassified_sources` | Step 1 found files without kind tag | Halt; recommend re-running [[heal-kind-tag]] first. |
| `coverage_below_threshold` | Step 4 coverage < 20% | Halt; surface bytes diff. Do not write consolidated node. |
| `verify_failed` | Pass B re-read mismatch | Halt; consolidated node retained, sources NOT archived. |
| `wikilink_patch_partial` | Pass D incomplete rewrites | Record per-file errors; bundle archive still proceeds (sources have already moved); human cleans up wikilinks manually. |

## What this operation does NOT do

- **Hard-delete files.** Always `_archive/` move.
- **Rename the bundle folder.** Folder remains; only contents migrate.
- **Touch directives.** Reusable agent directives are bundle-independent; they stay in place even if they were physically inside the bundle.
- **Touch sub-bundles' `_archive/`.** Already-archived material is recursive-skipped.
- **Generate new content.** Compositions are mechanical concatenations + extractions; no LLM creative writing in this operation.

## Skills invoked

- [[08 - System/Agent Skills/_onyx-runtime/consolidate-bundle/consolidate-bundle.md|consolidate-bundle]] — full procedure (this operation is the contract; the skill is the executable).
- [[08 - System/Operations/consolidate.md|consolidate]] (phase-level) — invoked in Step 0 to flush per-phase learnings to Knowledge.md before the bundle collapse.
- [[08 - System/Agent Skills/_onyx-runtime/heal-fractal-links/heal-fractal-links.md|heal-fractal-links]] — invoked in Step 8 to verify post-apply graph integrity.
- [[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]] — pre-flight (must be clean) and Step 8 verification.

## Native primitives relied on

- **Glob** — bundle walk, vault-wide wikilink scan in Pass D.
- **Read** — frontmatter + body per source.
- **Write** — consolidated node creation.
- **Edit** — vault-wide wikilink rewrite (one Edit per vault file with hits).
- **Bash `git mv`** — file moves to `_archive/` (preserves history).

## Acceptance (self-check before exit)

1. Consolidated node exists at expected path with `consolidation_state: applied`.
2. `consolidated_from` frontmatter list matches the source manifest table in body.
3. Source manifest sha256s match files now in `_archive/`.
4. Coverage ratio ≥ 0.20.
5. No vault wikilinks point at any archived source path.
6. Routine [[heal]] runs clean on the bundle's parent.

If any acceptance check fails after apply, log `INTEGRITY` and surface; do not auto-rollback.

## Examples (worked invocations across profiles)

### Example 1 — Engineering project (a feature has shipped)

Input:
- `bundle = 01 - Projects/My Service - Auth Rewrite/`
- `dry_run = true`

Sources discovered:
- `My Service - Auth Rewrite - Overview.md` (`onyx-project`)
- `My Service - Auth Rewrite - Phases Hub.md` (`hub-project`)
- `Phases/P1 - Schema design.md` … `Phases/P8 - Cutover.md` (`onyx-phase` × 8)
- `Logs/L1 - …` … `Logs/L8 - …` (`project-log` × 8)
- `My Service - Auth Rewrite - Knowledge.md` (`project-knowledge`)
- `My Service - Auth Rewrite - Kanban.md` (`project-kanban`)

Plan:
- Target: `01 - Projects/My Service - Auth Rewrite - Consolidated.md`
- Frontmatter: `tags: [onyx-project-consolidated]`
- Sections: Overview (premise + outcome), Final state (production endpoints / commit ranges / ticket links), Activity timeline (8 logs), Phases (8 with completion status), Knowledge, Decisions / Gotchas, References, Source manifest.

After apply: working folder contains `_archive/2026-04-27/…` only; consolidated node sits beside it.

### Example 2 — Audio episode (podcast / spoken-audio pipeline)

Input:
- `bundle = 01 - Projects/My Podcast/Episodes/E03 - Example Episode/`
- `dry_run = false`, `--auto`

Sources: episode Overview (`onyx-episode`), per-phase notes (`onyx-phase` × ~7), per-phase logs, audio segment notes, references.

Result: `Episodes/E03 - Example Episode - Consolidated.md` with episode overview, final mp3 + duration, transcript reference, activity timeline, knowledge, decisions, source manifest. Working folder archived. One ExecLog line.

### Example 3 — Music album (music-production pipeline)

Input:
- `bundle = 01 - Projects/My Album/Albums/Example Album/`
- `dry_run = true`

Sources: album Overview (`onyx-album`), N tracks (`onyx-track`), per-track lyrics + generation logs (`project-log`), cover art reference (`onyx-asset`), mastering notes.

Plan: `Albums/Example Album - Consolidated.md` with full tracklist, lyrics, generation prompts, mix notes, cover art. After apply, `Example Album/` folder contents archived.

### Example 4 — Research bundle (free-form notes, no phases)

Input:
- `bundle = 01 - Projects/Research — Topic X/`
- `dry_run = true`

Sources: Overview, 2 phases, 2 logs, Knowledge, Decisions, free-form research brief (no kind tag → `heal-kind-tag` would auto-tag, or fall back to "working note").

Plan: profile-neutral mode kicks in for the free-form note. Sections: Overview, Phases (2), Activity timeline (2), Knowledge, Decisions, **Working notes** (research brief in `<details>` block), Source manifest.

### Example 5 — Bundle with no phases (recipe / protocol / playbook)

Input:
- `bundle = 01 - Projects/Playbook — Customer onboarding/`
- `dry_run = true`

Sources: Overview, weekly check-in logs (`project-log`), measurements / outcomes file, retro write-up.

Plan: Overview → "what the playbook was", Final state → "outcome + measurements", Activity timeline → check-ins, Knowledge → what worked / didn't, Source manifest. No `Phases/` directory; phase section omitted gracefully.

The operation does not distinguish between an internal project, a client engagement, or a personal playbook — they're all bundles with phases (or none) + logs + knowledge.

## Migration / rollout

1. Ratify this directive + the [[consolidate-bundle]] runtime skill.
2. Spot-test on one recently shipped bundle. Dry-run first; review the plan; apply.
3. Add to your shipping checklist: when a bundle finishes (PR merged, episode published, album released), run `consolidate-bundle` on its working folder.
4. After 5 successful applies on each pipeline shape you use (engineering, podcast, album, research, playbook), promote status from `draft` → `active`.
