# Linear Uplink

## Purpose
Sync vault phase notes back to Linear after atomising. Keeps Linear in sync as the display layer.

## When to invoke
Automatically called by the Atomiser (P2) after writing tasks, if `config.linear` is set.
Can also be triggered manually from code.

## What it does
For each phase in the bundle:

1. **If `linear_identifier` is set in frontmatter:**
   - Update the existing Linear issue title and description to match the phase note

2. **If `linear_identifier` is NOT set (new phase created by Atomiser):**
   - Create a new Linear issue in the project
   - Write the new `linear_identifier` back to the phase note frontmatter

3. Append `linear_uplink_done` to the phase log note
4. Notify: `linear_uplink_done` to WhatsApp (if configured)

## Master spec protection
The original Linear project description / master spec issue is never modified.
Only phase-level issues (epics or child issues created by import) are updated.

## Config
Requires `linear` block in `onyx.config.json`:
```json
{
  "linear": {
    "apiKey": "lin_api_...",
    "teamId": "YOUR-TEAM-ID"
  }
}
```

## Idempotent
Re-running uplink: updates if title/description changed, skips if identical.
