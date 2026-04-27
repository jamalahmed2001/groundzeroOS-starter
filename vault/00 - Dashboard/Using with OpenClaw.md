---
tags: [system, guide, openclaw, onyx]
created: 2026-04-13
updated: 2026-04-13
type: guide
---

## Navigation

**HUB:** [[Dashboard|Dashboard]] | **WHAT:** [[What is ONYX|What is ONYX]] | **SETUP:** [[Getting Started|Getting Started]]

# Using ONYX with OpenClaw

> How ONYX integrates with OpenClaw — an optional orchestration platform for multi-project ecosystems.

---

## TL;DR

- **ONYX** is the execution layer (this tool, reads vault, runs agents)
- **OpenClaw** is a higher-level platform that runs across multiple ONYX-managed projects
- You can use ONYX alone. OpenClaw is additive.

---

## What OpenClaw adds

OpenClaw is a separate layer that coordinates work across many ONYX projects:

| OpenClaw capability | What it provides |
|---|---|
| **Project discovery** | Scans your workspace for ONYX bundles across all areas |
| **Cross-project knowledge** | Aggregates Knowledge notes from every bundle into a global view |
| **Daily planning** | Generates time-blocked plans based on across-project phase priorities |
| **Notifications** | WhatsApp/Slack alerts on phase state changes |
| **Dashboard** | Web UI for viewing all projects, phases, logs at a glance |

---

## When to use OpenClaw

Use OpenClaw if:
- You have 5+ ONYX projects running in parallel
- You want cross-project planning (ranked priorities across all projects)
- You want centralized monitoring and notifications
- You want a web UI instead of just Obsidian + CLI

Don't bother if:
- You're just running one or two projects
- You prefer working directly in Obsidian + CLI
- You don't need cross-project aggregation

---

## How they interact

ONYX remains the canonical executor. OpenClaw reads the same vault and consumes ONYX's outputs.

```
┌─────────────────────────────────────────────┐
│              Your Obsidian Vault             │
│ Bundle A · Bundle B · Bundle C · Knowledge   │
└───────────────┬──────────────────┬──────────┘
                │                  │
          reads & writes      reads only
                │                  │
        ┌───────┴──────┐  ┌────────┴────────┐
        │     ONYX     │  │    OpenClaw     │
        │  (executor)  │  │ (orchestrator)  │
        │              │  │  dashboard,      │
        │  onyx run    │  │  notifications,  │
        │              │  │  cross-project   │
        └──────────────┘  └─────────────────┘
```

OpenClaw never writes phase state. That's ONYX's job. OpenClaw just observes, notifies, and plans.

---

## Setup

1. Install ONYX as usual (see [[Getting Started|Getting Started]])
2. Install OpenClaw alongside (separate repo, separate install)
3. Point both at the same vault via `openclaw-config.yaml`:

```yaml
vault_root: /home/you/Obsidian/YourVault
projects_root: /home/you/workspace/projects
```

4. ONYX continues to run normally. OpenClaw adds the web dashboard + planning on top.

---

## Notes

- OpenClaw is optional and separate. ONYX works fine without it.
- The vault is always the source of truth. Both tools read it; only ONYX writes phase state.
- If you're new to ONYX, ignore OpenClaw until you've shipped at least one project with phases.

---

## Next reading

- [[What is ONYX|What is ONYX]] — mental model
- [[Getting Started|Getting Started]] — install + first project

