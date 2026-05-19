---
project: example-app
pipeline: daily-echo
inputs: []
stages:
  - kind: shell
    cmd: 'echo "tick $(date -u +%FT%TZ)" >> artifacts/daily-echo.log'
verify:
  steps:
    - kind: shell
      step: test -f artifacts/daily-echo.log
gates: {}
schedule: ""
up: "[[example-app - Overview]]"
created: 2026-01-01
updated: 2026-01-01
---

# example-app — daily-echo

> Minimal pipeline. Each `run` appends a tick to `artifacts/daily-echo.log` and writes a journal row. No promotion gate, no HITL, no schedule (set one in OS cron if you want to test the scheduled-pipeline pattern).

## Journal

| iso | outcome | metric | artifact | notes |
|-----|---------|--------|----------|-------|
