---
title: heal-project-id
tags: [skill, onyx-runtime, heal]
type: skill
replaces: src/healer/repairProjectId.ts
lines_replaced: 42
version: 0.1
created: 2026-04-24
updated: 2026-04-24
status: draft
---

# Skill: heal-project-id

> **STATUS: stub.** Tiny algorithm — small expansion required. Validated by [[08 - System/Operations/_agent-native-validation.md|heal probe]] case P3.

## Purpose
Backfill missing `project_id:` frontmatter on phase files by looking up the sibling Overview.md.

## Inputs
- `vault_path: string`
- `projects_glob: string`

## Outputs
- `repaired: RepairRecord[]` — `{ phase_path: string, project_id: string }[]`

## Algorithm
1. Glob all phase files: `<projects-glob>/*/Phases/*.md`.
2. For each phase file:
   a. Read frontmatter. If `project_id:` is set AND non-empty → skip.
   b. Resolve bundle dir: `path.dirname(path.dirname(phase_path))`.
   c. Find an Overview file in bundle dir (filename contains "Overview", ends in `.md`).
   d. If no overview OR overview has no `project_id:` / `project:` → skip.
   e. Write `project_id: <value>` to phase frontmatter. Bump `updated:`.
   f. Append one line to `migrated` record.
3. Return all records.

## Invariants
- Never overwrite an existing `project_id:`.
- Only write if the sibling Overview has an unambiguous project id.

## Error cases
- `no_overview` — bundle has no Overview.md; skip.
- `overview_no_id` — Overview exists but doesn't declare `project_id`; skip.
- `ambiguous_id` — `project_id` and `project` differ in Overview; prefer `project_id`, log warning.

## Examples
- Fixture P3 (probe 2026-04-24): phase had no `project_id`; Overview had `project_id: test-project`; skill wrote it. Equivalent to `src/healer/repairProjectId.ts` output.
