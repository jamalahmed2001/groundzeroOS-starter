---
project: <PROJECT_ID>
status: active
priority: 3
hypothesis: <one-line hypothesis>
success_metric: <metric and threshold>
baseline: <baseline value>
requires: []
up: "[[<PARENT_HUB>]]"
created: <ISO>
updated: <ISO>
tags: [kind-experimenter, status-active]
---

## 🔗 Navigation
**UP:** [[<PARENT_HUB>]]
**Children:**
- [[<PROJECT> - Status]]
- [[<PROJECT> - Knowledge]]
- [[<PROJECT> - Decisions]]

# <PROJECT_NAME>

## Identity
One paragraph: the hypothesis under test and what success/failure looks like.

## Goals
- Test hypothesis: <hypothesis>
- Decide adopt/reject against baseline <baseline>

## Verify defaults
- shell: <eval-command>
- human: "metric exceeds baseline by declared threshold"
- human: "adopt/reject decision recorded in Decisions.md"

## Roles
*(optional; consider the `experimenter-*` triplet from `08 - System/Roles/`)*

## Conventions
*(optional)*
