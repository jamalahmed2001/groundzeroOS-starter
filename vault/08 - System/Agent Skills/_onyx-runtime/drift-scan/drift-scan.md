# M2 — Drift Scan

## Purpose
Detect vault drift without touching non-ONYX notes.

## When to invoke
```bash
npm run onyx:heal
```
(M2 scan runs automatically before M3 repair)

## Scope
Only inspect notes with `project-phase` or `project-log` in their `tags` frontmatter field.

## Checks performed

1. **Multiple state tags** — phase note has more than one `phase-*` tag
2. **Missing required sections** — no `## Tasks`, `## Acceptance Criteria`, or `## Log`
3. **Stale lock** — `phase-active` tag + `locked_at` older than 5 minutes
4. **Orphaned lock field** — `locked_by` non-empty but tag is not `phase-active`
5. **Status/tag mismatch** — `status:` field does not match the `phase-*` tag
6. **Broken log link** — `## Log` section links to a file that does not exist

## Output
Structured report: file path, violation type, description, whether M3 can auto-fix.

## What NOT to do
- Do not edit any files during the scan phase
- Do not scan notes without `project-phase` or `project-log` tags
