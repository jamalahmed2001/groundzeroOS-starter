---
name: operations
type: profile
version: 1.0
required_fields:
  - monitored_systems
  - runbook_path
phase_fields:
  - severity
  - incident_id
  - runbook_followed
  - systems_affected
init_docs:
  - Operations Context
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: operations

> For system operations, monitoring, incident response, and maintenance. The agent observes system state, follows runbooks, and acts on anomalies — without improvising. Runbook adherence is required. Acceptance is conditional on `runbook_followed: true` and documented outcomes.

---

## When to use this profile

- Scheduled maintenance tasks (backups, rotations, cleanup jobs)
- Incident response phases (triage, mitigation, post-mortem)
- Infrastructure changes that require careful sequencing and rollback plans
- Monitoring reviews and health checks
- Any operations task where the sequence of steps matters as much as the outcome

If the operations work involves writing significant code, use the engineering profile for those phases. Operations profiles are for phases that primarily observe, act, and verify — not build.

---

## Required Overview fields

```yaml
profile: operations
monitored_systems: "krakenbot, onyx-dashboard, Tailscale mesh"   # comma-separated list
runbook_path: "Docs/Runbooks/"                                    # path to runbook folder in vault
severity: low                                                      # low | medium | high | critical
```

`monitored_systems` is required. Lists what this operations project covers. The agent checks only these systems.

`runbook_path` is required. Points to the folder or specific file containing the runbooks. The agent must consult the relevant runbook before taking any non-trivial action.

`severity` sets the default threat level. Updated by the agent if an incident escalates.

---

## Phase fields

Operations phases carry these optional frontmatter fields:

```yaml
severity: high                     # low | medium | high | critical
incident_id: INC-2026-042          # if this phase is part of an active incident
runbook_followed: false            # set to true by agent after following the runbook
systems_affected: ["krakenbot"]    # list of systems this phase touches
rollback_plan: "Restart service X via systemd" # what to do if the action fails
```

`runbook_followed` is the acceptance gate. If the phase involves a runbook procedure and this is `false` at completion, the phase is not accepted.

`rollback_plan` should be defined in the phase *before* the agent executes. If you don't know how to undo it, don't do it.

---

## Bundle structure

When `onyx init` creates an operations project, it generates:

```
My Project/
├── My Project - Overview.md           ← monitored systems, runbook path, severity
├── My Project - Knowledge.md          ← incident learnings, false positives, recurring patterns
├── My Project - Operations Context.md ← system topology, normal baseline, alert thresholds
├── Docs/
│   └── Runbooks/
│       ├── Runbook - Restart Service.md
│       ├── Runbook - Database Failover.md
│       └── Runbook - Incident Triage.md
├── Phases/
│   └── P1 - Bootstrap.md              ← document systems, verify access, test runbooks
└── Logs/
    └── L1 - Bootstrap.md
```

The **Operations Context** note is ops-specific. It captures the normal baseline — what healthy looks like for each monitored system — so the agent can distinguish signal from noise. The bootstrap phase populates this by querying system state and documenting it.

---

## When creating a new bundle

**For the LLM generating the Overview at `onyx init` time:**

The Overview.md for an operations project must include:
1. A `## Systems` section — each monitored system: what it does, where it runs, how to access it
2. A `## Normal baseline` section — what healthy looks like (uptime, latency, queue depth, etc.)
3. A `## Alert thresholds` section — what triggers a phase in this project (CPU > 80%, queue depth > 1000, etc.)
4. A `## Escalation` section — when to escalate to a human and how (which channel, who to ping)
5. A `## Access` section — what credentials/tooling the agent has; what requires human intervention

The Operations Context note starts with this template:
```
# Operations Context — [Project Name]

> Populated by the P1 bootstrap phase. Updated as system topology changes.

## Systems map
[Each system: name, purpose, location, access method]

## Healthy baseline
[What "all green" looks like — metrics, expected response times, expected log patterns]

## Known false positives
[Alerts that look bad but are normal — so the agent doesn't panic-respond]

## Dependencies
[What each system depends on; what downstream impact looks like if one fails]

## Access inventory
[What the agent can do autonomously; what requires human approval]
```

---

## Acceptance verification

Operations phases have strict acceptance criteria:

1. **All tasks checked** — every `- [ ]` in the Tasks section is ticked.
2. **Runbook followed** — if the phase involves a documented procedure, `runbook_followed: true` must be set. If the runbook was absent or didn't cover the situation, document the gap and create a new/updated runbook before closing.
3. **Outcome documented** — the log must record what was done, what the system state was before and after, and whether the outcome matched the expected result.
4. **No improvisation without approval** — if the runbook doesn't cover the situation and the action is non-trivial, the phase is `blocked` with `## Human Requirements` explaining what decision is needed.
5. **Knowledge updated** — any new pattern, false positive, or incident learning appended to Knowledge.md.

If severity escalates during a phase (e.g., a routine check reveals a critical issue), the agent:
1. Stops the current phase
2. Sets it to `blocked` with a `## Human Requirements` note flagging the escalation
3. Documents what was found and what the human needs to decide

---

## Context the agent receives

ONYX injects these into the agent's context (in order):

1. This profile file
2. Project Overview.md
3. Project Knowledge.md (prior incidents, known patterns, false positives)
4. Project Operations Context.md (system topology and baselines)
5. The relevant runbook (if the phase specifies one)
6. The phase file

The agent reads Operations Context before the phase — knowing the baseline is essential to interpreting what it observes.

---

## Notes for the agent

- **Runbooks are not optional.** If a runbook exists for what you're about to do, read it first and follow it. Do not improvise a procedure that has a documented one.
- **If you don't have a runbook, write one.** If you're about to do something for the first time and there's no documented procedure, write the procedure in `Docs/Runbooks/` before executing. Then follow what you wrote.
- **Rollback first.** Before taking any action that modifies system state, confirm you know how to undo it. If you don't, block the phase and ask.
- **Document before and after.** Every phase log must record the system state before the action and after. This is how post-mortems happen.
- **Severity escalates up, never down.** If you discover this is worse than `severity: low`, update the frontmatter immediately and alert via `## Human Requirements`. You cannot de-escalate without human confirmation.
- **Access boundary.** Operations Context lists what you can do autonomously. Anything outside that list requires human approval. When in doubt, block and ask.
