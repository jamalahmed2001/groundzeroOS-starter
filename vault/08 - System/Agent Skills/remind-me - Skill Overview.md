---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: remind-me
source_skill_path: ~/clawd/skills/remind-me/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
# remind-me

> 

# ⏰ Remind Me (Delegation Method)

Set reminders that actually deliver via WhatsApp by delegating the task to a timed sub-agent.

## Usage

When the user says "remind me to X at Y":

1. **Calculate** the wait time (use `date` to find current time).
2. **Log** the reminder to `~/clawd/reminders.md`.
3. **Spawn** a delivery sub-agent.

### Implementation Pattern

```javascript
// Example: "Remind me at 22:45 to check the logs"
// Current time: 22:30

// 1. Log it for persistent memory
write("~/clawd/reminders.md", "- [scheduled] 2026-03-03 22:45 | check the logs");

// 2. Delegate delivery
sessions_spawn({
  label: "Reminder: check the logs",
  task: "WAIT until 22:45 PM GMT (current time is 22:30). At exactly 22:45, send a WhatsApp message to 447743183601 saying '⏰ Reminder: check the logs' using the message tool.",
  mode: "run",
  timeoutSeconds: 3600 
});
```

## Musts

- Always check current `date` before calculating the wait.
- Always use the target `447743183601` for direct WhatsApp delivery.
- Use `mode: "run"` for the delivery agent.
- Ensure `timeoutSeconds` is longer than the wait period.

## Critical Limitation FIXED

Standard cron jobs and local shell scripts are unreliable due to environment path mismatches. **Sub-agent delegation** is the only confirmed way to guarantee delivery at a specific timestamp.
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]
