---
project: <PROJECT_ID>
phase: <NN>
title: <TITLE>
status: backlog
touches: []
verify:
  cwd: repo
  steps:
    - shell: <TEST_COMMAND>
depends_on: []
up: "[[<PROJECT> - Overview]]"
created: <ISO>
updated: <ISO>
---

# <PROJECT> - P<NN> - <TITLE>

## Goal
One sentence.

## Why
Link to a Decisions or Knowledge anchor.

## Steps
- [ ] [T1] First step
- [ ] [T2] Second step

## Acceptance
- [ ] All `verify.steps` exit 0 / ticked
- [ ] Knowledge entry appended

## Progress
*(empty until status: active; format: Updated / Last step / Last command / Working hypothesis / Partial state on disk)*

## Notes
*(scratch)*
