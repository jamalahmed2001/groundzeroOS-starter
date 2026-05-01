---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: notify-phase
version: 3.0.0
source_skill_path: ~/clawd/skills/notify-phase/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# notify-phase

> Standard notify contract for ONYX controller and phase execution summaries delivered to the operator via WhatsApp.

# 📱 Notify Phase Skill

> Standardised notify contract for ONYX. Used by both phase orchestrator and top-level controller.
> Optimized for WhatsApp readability — short lines, clear sections, emoji for visual separation.

## Purpose

- Compose a concise, WhatsApp-friendly run summary
- Deliver a standard WhatsApp update to the operator
- Provide one notify surface for:
  - phase completion
  - phase blocked runs
  - controller/status/planning info updates

This aligns with the Observer Directive section:
- **Notify = summarise a run and send it back to the operator**
- **Writes:** none to vault
- **Outputs:** WhatsApp / Signal / OpenClaw message delivery

## Contract

### Inputs

| Arg | Required | Description |
|-----|----------|-------------|
| `--project-id` | yes | Project identifier |
| `--phase-label` | yes | Phase label or `Controller` |
| `--status` | yes | `complete`, `blocked`, or `info` |
| `--summary` | no | Human summary text |
| `--blockers` | no | Blocker text for blocked runs |
| `--completed-tasks` | no | Comma-separated completed items |
| `--dry-run` | no | Print message only (don't send) |

### Status semantics

- `complete` → successful execution/update worth treating as done
- `blocked` → execution stopped or encountered a blocking issue
- `info` → status-only, placement-only, planning, or controller update

## Message Format (WhatsApp-Optimized)

### Design Principles

1. **Short lines** — Fits mobile screens (under 40 chars when possible)
2. **Clear sections** — Project, Phase, Summary, Done/Blockers
3. **Visual hierarchy** — Emoji for each section, bold headers
4. **Scannable** — No technical jargon, easy to parse quickly
5. **Conversational** — "Done", "Need attention", not internal codes

### Complete
```text
*🎉 ONYX Complete*

📦 *Project:* <Project>
🚧 *Phase:* <Phase>

📝 *Summary:* <summary>
✅ *Done:* <tasks>

---
_Status: All tasks checked off ✨_
```

### Blocked
```text
*⚠️ ONYX Blocked*

📦 *Project:* <Project>
🚧 *Phase:* <Phase>

📝 *Summary:* <summary>
🚫 *Blockers:* <blockers>

---
_Need attention 🚨_
```

### Info
```text
*ℹ️ ONYX Update*

📦 *Project:* <Project>
🚧 *Phase:* <Phase>

📝 *Summary:* <summary>

---
_Status update 📊_
```

## Runtime usage

### 1. Controller notify
The controller calls this skill after:
- status flow
- placement-only flow
- plan-phase flow
- replan-phase flow
- execute/full pipeline flow

### 2. Phase executor notify
`onyx-orchestrator-phase.sh` calls this skill when:
- a phase completes
- a phase blocks after failed checks / failed completion conditions

## Usage

```bash
# Controller/status update
./skills/notify-phase/notify-phase.sh \
  --project-id "ONYX Orchestrator Build-Out" \
  --phase-label "Controller" \
  --status info \
  --summary "Status: healthy. No blockers."

# Phase complete
./skills/notify-phase/notify-phase.sh \
  --project-id "ONYX Orchestrator Build-Out" \
  --phase-label "Phase 4" \
  --status complete \
  --summary "Execution finished and phase was marked complete." \
  --completed-tasks "Task A, Task B"

# Phase blocked
./skills/notify-phase/notify-phase.sh \
  --project-id "ONYX Orchestrator Build-Out" \
  --phase-label "Phase 4" \
  --status blocked \
  --summary "Tests failing after fix attempt." \
  --blockers "pnpm test still failing"

# Dry-run (test message formatting)
./skills/notify-phase/notify-phase.sh \
  --project-id "Test Project" \
  --phase-label "Phase 1" \
  --status complete \
  --summary "Test summary" \
  --dry-run
```

## Implementation notes

- Delivery is best-effort via OpenClaw CLI messaging.
- If send fails, script prints to message and exits non-zero.
- This skill is a transport wrapper, not a vault writer.
- WhatsApp formatting uses markdown bold `*text*` for headers
- Emoji provide visual hierarchy: 📦 Project, 🚧 Phase, 📝 Summary, ✅ Done, 🚫 Blockers

## Alignment rule

If controller or phase executor changes what notify means, update this file and wrapper script together. Do not let runtime and docs drift.

---

**Changes in v3.0.0:**
- ✅ WhatsApp-optimized formatting with short lines and clear sections
- ✅ Visual hierarchy with emoji and bold markdown
- ✅ Removed technical jargon (run IDs, action codes)
- ✅ Conversational tone instead of internal system language
- ✅ Scannable on mobile devices
