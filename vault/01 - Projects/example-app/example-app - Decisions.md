---
type: decisions
project: example-app
up: "[[example-app - Overview]]"
created: 2026-01-01
updated: 2026-01-01
---

# example-app — Decisions

> Append-only ADRs. Each entry: `### <iso> — <decision>`, then **Context**, **Decision**, **Consequences**. Never delete; supersede with a new entry.

### 2026-01-01 — Bundle exists as smoke test

**Context:** A new ONYX install needs a verifiable starting point.

**Decision:** Ship `example-app` as a one-phase, one-pipeline bundle. Users delete it once they have a real project.

**Consequences:** First-run UX is "say `execute example-app`, see it tick." Empty installs no longer require users to scaffold from templates before they can verify anything works.
