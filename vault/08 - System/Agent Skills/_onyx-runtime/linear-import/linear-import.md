# L1 — Linear Import

## Purpose
Import a Linear project as a vault bundle. Vault stays authoritative after import.

## When to invoke
```bash
npm run onyx:import-linear -- <linearProjectId>
```

## Prerequisites
Linear config in `onyx.config.json`:
```json
{
  "linear": {
    "apiKey": "lin_api_...",
    "teamId": "YOUR-TEAM-ID"
  }
}
```

## What it does
1. Fetch project + epics + issues from Linear GraphQL API
2. Create bundle in `01 - Projects/<project name>/`
3. Map each epic → phase note (`phase-backlog`) with `linear_identifier: LIN-XXX` in frontmatter
4. Map issue descriptions → task stubs in `## Tasks` section
5. Append `linear_import_done` to `L0 - Import Log.md` in the bundle
6. Notify: `linear_import_done` to WhatsApp (if configured)

## After import
The vault is the authority. Linear is now a display layer.
Run the controller to atomise phases and sync back:
```bash
npm run onyx:run
```

The Atomiser will replace task stubs with codebase-grounded tasks,
then automatically sync back to Linear via the Linear Uplink.

## Idempotent
Re-running import on the same project: creates missing phases, skips existing ones.
Never overwrites human-written content.
