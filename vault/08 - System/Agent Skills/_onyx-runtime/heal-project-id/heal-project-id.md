---
title: heal-project-id
tags:
  - skill
  - onyx-runtime
  - heal
type: skill
replaces: src/healer/repairProjectId.ts
lines_replaced: 42
version: 0.2
created: 2026-04-24
updated: 2026-04-27
status: active
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[Agent Skills Hub|Agent Skills Hub]]

# Skill: heal-project-id

> Routine `project_id:` validation + backfill, run every iteration as Step 4 of [[08 - System/Operations/heal.md|heal]]. Authoritative contract: [[Project ID Convention]]. **This skill never invents or renames a slug** — that's [[heal-project-id-migrate]]. It only enforces what the convention says and surfaces what it can't fix.

## Purpose

Three jobs, in order:

1. **Validate** every Overview's `project_id:` against the format / length / uniqueness rules in [[Project ID Convention]] §1.
2. **Backfill** missing `project_id:` on phase files (and other child files) by copying the value from the bundle Overview — only when the Overview's value is itself valid.
3. **Detect** drift between an Overview's `project_id:` and the hub names actually present in the bundle (signals stale or partial migration).

Auto-fix scope is intentionally narrow: backfill empty children. Everything else is a detection routed to [[heal-project-id-migrate]] (one-shot rename) or to the human (when the bundle name yields no clean slug).

## Inputs

- `vault_path: string`
- `projects_glob: string` — default `"{02 - <workplace>/**,03 - Ventures/**,10 - OpenClaw/**}"`

## Outputs

- `repaired: RepairRecord[]` — `{ child_path, project_id, source_overview }[]`
- `detections: Detection[]` — `{ overview_path, kind, detail }[]`
- `integrity: IntegrityEvent[]` — `{ kind, paths[] }`

## Algorithm

### Step 1 — Build the slug index

Glob `<vault_path>/<projects_glob>/**/Overview.md` (and `*Overview.md` at bundle roots). For each Overview, parse frontmatter; record `{ overview_path, project_id, project, bundle_path }`.

Build `slug_index: Map<project_id, overview_path[]>`.

### Step 2 — Uniqueness scan (INTEGRITY)

Walk `slug_index`. Any key mapping to ≥2 Overviews → emit:

```
INTEGRITY: project_id_duplicate
  paths: [<overview-1>, <overview-2>, …]
```

Per [[08 - System/Operations/heal.md|heal]] error handling, INTEGRITY halts the iteration. Do not proceed to Step 3+ until a human resolves.

### Step 3 — Format validation

For every Overview record in `slug_index`:

- If `project_id` is missing or empty → emit `detection: project_id_missing` with `overview_path`. Recommend [[heal-project-id-migrate]].
- If present, test against `^[a-z0-9][a-z0-9-]*[a-z0-9]$` AND length 1–30 → on failure, emit `detection: project_id_invalid_format` with the violating value.

**Do not auto-fix.** Inventing or correcting a slug cascades to filenames and wikilinks — out of scope for routine heal.

### Step 4 — Backfill children

Glob phase files: `<projects_glob>/*/Phases/*.md` (and `<projects_glob>/*/{Logs,Directives,Profiles}/*.md`).

For each child file:
- Read frontmatter. If `project_id:` is set AND non-empty → skip.
- Resolve bundle dir = `dirname(dirname(child_path))`.
- Look up the bundle's Overview record in `slug_index`.
- If the Overview's `project_id` is **valid** (passed Step 3) → write `project_id: <value>` to the child's frontmatter. Bump `updated:`. Append to `repaired`.
- If the Overview's `project_id` is missing or invalid → skip the child. Reason: backfilling a bad value just spreads the corruption.

ExecLog: one line per backfill. Format:

```
<now_iso> HEAL project-id:backfilled path="<rel_child_path>" project_id=<value>
```

### Step 5 — Hub-name coherence detection

For each Overview with a valid `project_id`:

- Glob hub files in the bundle: `<bundle_path>/**/* - * Hub.md`.
- For each hub, extract the prefix before ` - ` from its filename.
- If any hub's prefix differs from the Overview's `project_id` → emit `detection: project_id_hub_mismatch` with the offending hub list.

Recommendation: run [[heal-project-id-migrate]] on this bundle to re-cascade.

### Step 6 — Surface

Return all three lists (`repaired`, `detections`, `integrity`). The caller (heal operation) decides:
- `repaired` lines → already written, just logged.
- `detections` → surfaced in the heal run summary, not blocking.
- `integrity` events → block the iteration; require human resolution.

## Invariants

- **Never overwrites an existing `project_id:`** on a child. Only writes when the field is missing/empty.
- **Never writes a `project_id:` that fails the format rules.** A child file's `project_id` is always either absent or convention-compliant.
- **Single Edit per modified file**, atomic (per [[Fractal Linking Convention]]).
- **`updated:` bumped on every modified file** to the run's `now_iso`.

## Error cases

| Code | When | Behaviour |
|---|---|---|
| `no_overview` | child's bundle has no Overview | Skip child; emit detection `bundle_overview_missing`. |
| `overview_no_id` | Overview exists but `project_id` missing/invalid | Skip child; the Overview's own detection from Step 3 covers it. |
| `edit_failed` | child's frontmatter Edit raised | Skip child; record. |
| `project_id_duplicate` | Step 2 found duplicates | INTEGRITY; halt iteration. |

## Detection signatures (mapping to convention §7)

```
detection: project_id_missing              ↔ Convention §1 presence rule
detection: project_id_invalid_format       ↔ Convention §1 format/length rule
detection: project_id_hub_mismatch         ↔ Convention §3 cascade integrity
INTEGRITY: project_id_duplicate            ↔ Convention §1 uniqueness rule
```

Each detection includes a `recommended_action` field:
- `*_missing`, `*_invalid_format`, `*_hub_mismatch` → `run heal-project-id-migrate on bundle=<bundle_path>`
- `project_id_duplicate` → `human resolution required`

## Examples

**Example 1 — clean backfill (the original probe P3):**

- Phase has no `project_id`.
- Overview has `project_id: clutr` (valid).
- Result: phase frontmatter gets `project_id: clutr` added. ExecLog line emitted.

**Example 2 — backfill blocked by bad source:**

- Phase has no `project_id`.
- Overview has `project_id: "My Album"` (fails format).
- Result: phase skipped. Overview gets `detection: project_id_invalid_format`. Phase will be backfilled on the next heal run, after [[heal-project-id-migrate]] cleans up My Album.

**Example 3 — duplicate slug:**

- Two Overviews both declare `project_id: clutr`.
- Result: INTEGRITY `project_id_duplicate paths=[…, …]`. Heal iteration halts.

**Example 4 — hub mismatch after partial migration:**

- Overview has `project_id: my-show`.
- Bundle still contains `My Show - Phases Hub.md`.
- Result: `detection: project_id_hub_mismatch hubs=["My Show - Phases Hub"]`. Recommended action: re-run migrate on bundle.

## Native primitives relied on

- **Glob** — Overviews, hub files, child files.
- **Read** — frontmatter parse.
- **Edit** — child frontmatter backfill, single-key insert.

## Relationship

- One-shot rename / cascade lives in [[heal-project-id-migrate]] — this skill **never** invokes it; it only emits detections that recommend running it.
- The contract is owned by [[Project ID Convention]]; this skill is its routine enforcer.
- Hub-name derivation rule comes from [[Fractal Linking Convention]] §1.
