---
project: <PROJECT_ID>
status: active
priority: 3
runbook: <path-or-anchor>
monitored_systems: []
requires: []
up: "[[<PARENT_HUB>]]"
created: <ISO>
updated: <ISO>
tags: [kind-operations, status-active]
---

## 🔗 Navigation
**UP:** [[<PARENT_HUB>]]
**Children:**
- [[<PROJECT> - Status]]
- [[<PROJECT> - Knowledge]]
- [[<PROJECT> - Decisions]]

# <PROJECT_NAME>

## Identity
One paragraph: the system being operated and the operations cadence.

## Goals
- Keep <system> within SLO
- Respond to incidents per runbook

## Verify defaults
- shell: <healthcheck-command>
- human: "alert backlog cleared"
- human: "incident report filed if any"

## Roles
*(optional)*

## Conventions
*(optional)*
