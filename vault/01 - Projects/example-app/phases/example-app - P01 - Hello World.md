---
project: example-app
phase: P01
title: Hello World
status: ready
touches:
  - example-app - Knowledge.md
  - artifacts/hello.txt
verify:
  cwd: bundle
  steps:
    - shell: test -f "artifacts/hello.txt"
    - shell: grep -q "hello from ONYX" "artifacts/hello.txt"
depends_on: []
up: "[[example-app - Overview]]"
created: 2026-01-01
updated: 2026-01-01
---

# example-app - P01 - Hello World

## Goal

End-to-end verify the v2 runtime loop on this install.

## Why

Until the loop has run once, you can't trust that cold-start, the phase hot loop, verification, and the Knowledge append all work. See [[example-app - Decisions]] (2026-01-01).

## Steps

- [ ] [T1] `mkdir -p artifacts && echo "hello from ONYX" > artifacts/hello.txt`
- [ ] [T2] Append one line to `example-app - Knowledge.md`: `<iso> — P01 ran end-to-end on this install.`
- [ ] [T3] Re-read both files and confirm contents match expectation.

## Acceptance

- [ ] All `verify.steps` exit 0
- [ ] Knowledge entry appended
- [ ] Session log closed with `outcome: done`

## Progress

*(empty until status: active; format: Updated / Last step / Last command / Working hypothesis / Partial state on disk)*

## Notes

If a step fails, the hot loop retries 3× with backoff. Three consecutive failures move the phase to `## Human Requirements` and `status: blocked`. Don't manually unstick — read the blocker, fix the cause, flip back to `ready`.
