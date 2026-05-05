# M3 — Safe Repair

## Purpose
Apply deterministic, safe fixes to drift detected by M2.

## When to invoke
Runs automatically after M2 scan via `npm run onyx:heal`.

## Safe to auto-apply

| Fix | How |
|---|---|
| Stale lock | Clear `locked_by`/`locked_at`, set tag → `phase-ready`, append `stale_lock_cleared` to log |
| Status/tag mismatch | Rewrite `status:` to match the tag (tag wins) |
| Orphaned lock field | Clear `locked_by`/`locked_at` to empty string |
| Missing log note | Create log note from template |

## NOT safe to auto-apply (require human)
- Deleting phase notes or log notes
- Moving project bundle folders
- Rewriting `## Overview` or `## Human Requirements` sections
- Merging duplicate phases

## Write rules
Same as executor: only write to the specific phase note and its log note being repaired.
