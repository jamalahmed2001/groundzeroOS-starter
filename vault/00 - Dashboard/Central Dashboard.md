---
type: dashboard
graph_domain: system
up: "[[System Hub]]"
updated: 2026-01-01
---

# Central Dashboard

> **This file is derived.** `heal` rebuilds it by scanning every `<Project> - Status.md` in `01 - Projects/`. Do not edit it by hand — your edits will be overwritten on the next `heal`.

## Active

_(populated by `heal` — phases with `status: active` across all projects)_

| Project | Phase | Lock age | Last action |
|---|---|---|---|

## Ready

_(populated by `heal` — phases with `status: ready` and dependencies satisfied)_

| Project | Phase | Touches |
|---|---|---|

## Blocked

_(populated by `heal` — phases with `status: blocked`)_

| Project | Phase | Blocker |
|---|---|---|

## Pipelines

_(populated by `heal` — most recent journal row per pipeline)_

| Project | Pipeline | Last run | Outcome |
|---|---|---|---|

## Promotion queue

_(populated by `heal` — rows awaiting human approval across all projects)_

| Project | Pipeline | Awaiting | Filter |
|---|---|---|---|

---

**To populate this dashboard:** `heal` once you have a project. The first run scans all `01 - Projects/*/` and fills the tables above.
