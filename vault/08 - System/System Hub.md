---
type: hub
graph_domain: system
up: "[[Central Dashboard]]"
created: 2026-05-17
updated: 2026-05-17
---

## 🔗 Navigation
**UP:** [[Central Dashboard]]

# System Hub

> The `08 - System/` folder. Under ONYX v2, this is intentionally small. Most agent work lives in project bundles — system files are reference, read on demand.


## What v2 gives you

- **6 primitives + Skills:** Project, Phase, Pipeline, Journal, Knowledge entry, Log entry, plus Skills as named external deps.
- **4 phase states** (`backlog | active | blocked | done`); pipelines never reach `done`.
- **Pipelines + Journals** for repeatable work (no phase file per invocation).
- **4-read cold start** (Overview / Status / active Phase / newest Log) plus `git` probes when a `repo_path:` is declared.
- **Every turn is a pause point** — sessions are disposable; the vault is the only source of truth.

*This hub is intentionally short. The job of `08 - System/` is to disappear from the hot path; project bundles are what matters.*

<!-- AUTO_CHILDREN_START -->

## Children

- [[ONYX v2 Runtime]]
- [[PRINCIPLES]]
- [[Roles Hub]]
- [[Skills Hub]]
- [[Templates Hub]]

<!-- AUTO_CHILDREN_END -->
