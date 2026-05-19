---
project: example-app
status: active
priority: 3
repo_path: ""
test_command: npm test
lint_command: npm run lint
requires: []
up: "[[System Hub]]"
created: 2026-01-01
updated: 2026-01-01
tags: [kind-engineering, status-active]
---

## 🔗 Navigation
**UP:** [[System Hub]]
**Children:**
- [[example-app - Status]]
- [[example-app - Knowledge]]
- [[example-app - Decisions]]

# example-app

> A walk-through bundle to verify your install. Run `execute example-app` and the agent will tick its way through `P01 - Hello World`.

## Identity

The smallest possible engineering project. One phase, one pipeline, one Knowledge entry. After this loop runs end-to-end you know ONYX is wired up correctly.

If you set `repo_path:` above to a real repo and add a `repo →` symlink in this bundle, the engineering verify step (`npm test`) will run inside it. Leave it empty for the doc-only smoke test.

## Goals

- Verify cold-start works: agent reads Overview → Status → active phase → newest log.
- Verify the phase hot loop ticks tasks and writes Progress after each one.
- Verify the pipeline loop appends a journal row.

## Verify defaults

- shell: echo ok
- shell: test -f example-app - Knowledge.md

## Roles

`role: general` — no specialist brief required.

## Notes

Delete this bundle once you've created your first real project. Or keep it as a regression test for future runtime upgrades.
