---
title: Agent Roles & Contracts Directive
tags: [system, directive, onyx]
type: directive
version: 1.0
updated: 2026-03-27
graph_domain: system
up: Agent Directives Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Agent Roles & Contracts Directive v1.0

> **Purpose:** Make ONYX “feel like magic” while staying **explainable**.
> We do this by giving every component a *job title*, a *permission boundary*, and a *clear contract*.

---

## 0) The Core Mental Model

ONYX is a **deterministic runtime** wrapped around **LLM workers**.

- **Deterministic runtime (TypeScript)** decides *what happens next* and enforces safety.
- **LLM workers** do *bounded creative work* (planning + coding) inside strict scope.
- **The Vault** is the **state machine** and audit trail.

If you want an “autonomous agent that is still explainable”, you must keep these boundaries intact.

---

## 1) Canonical Roles (who does what)

### 1.1 The Controller (Scheduler)
**Role name:** *ONYX Controller*

**Responsibilities**
- Convert intent → **ControllerMode** → **Pipeline recipe**
- Run **self-heal first**, then pipeline steps in order
- Maintain invariants: locks, state transitions, error classes, circuit breaker

**Allowed writes**
- Can write **any** vault file, but only via `writeBundle()` (single-writer contract)

**Source of truth**
- Runtime: `src/onyx/controller.ts`
- Kernel: `src/onyx/controllerKernel.ts`
- Recipes: `src/onyx/pipelines.ts`

---

### 1.2 The Kernel (Autonomous Loop)
**Role name:** *ONYX Kernel*

**Responsibilities**
- Scan all manifests (`Orchestrator.json` files)
- Produce a deterministic dispatch plan (priority + mode)
- Execute bounded iterations with per-project circuit breaker

**Notable guardrails**
- `maxIterations` hard cap
- Circuit breaker per project (cooldown after repeated failures)

---

### 1.3 Vault Observer (Read-only State Lens)
**Role name:** *Vault Observer*

**Responsibilities**
- Read vault state and describe it clearly:
  - manifest health
  - which phase is active
  - task counts / completion
  - blockers
  - what the controller *would* do next

**Permissions**
- **Read-only**. No file writes.

**Why this role exists**
- It makes the system explainable: you can always ask “what’s happening?” and get a truthful state snapshot, not a guess.

---

### 1.4 Vault Agent (State Writer)
**Role name:** *Vault Writer*

**Responsibilities**
- Write structured updates into the vault **only through the IO gateway** (`writeBundle()`), and only into nodes the runtime designates.
- Maintain vault structure rules (see: [[08 - System/Agent Directives/Vault Architect Directive.md|Vault Architect Directive]]).

**Hard rules**
- Never bypass `writeBundle()`.
- Never create ad-hoc folders/paths outside the approved taxonomy.

---

### 1.5 Planner Agent (Phase Planner)
**Role name:** *Planner*

**Responsibilities**
- Expand a phase into an *Implementation Plan* consisting of atomic tasks.
- Each task must include: **Files**, optional **Symbols**, **Steps**, and **Validation**.

**Permissions**
- Writes only inside the phase’s agent-writable plan markers:
  - `<!-- AGENT_WRITABLE_START:phase-plan -->`
  - `<!-- AGENT_WRITABLE_END:phase-plan -->`

---

### 1.6 Executor Agent (Task Worker)
**Role name:** *Worker*

**Responsibilities**
- Execute exactly **one** atomic task at a time.
- Touch only the files referenced by the task (or the minimal set implied by the task).

**Permissions**
- Code repo writes: yes, inside the scoped workdir.
- Vault writes: no direct writes (runtime ticks tasks + logs results).

**Runtime handoff**
- The runtime provides:
  - scoped task excerpt
  - QMD context packet
  - a focused workdir

---

### 1.7 Consolidator (Knowledge Synthesizer)
**Role name:** *Vault Consolidator*

**Responsibilities**
- When a phase becomes **complete**, synthesize learnings into `Knowledge.md`.
- Preserve raw phase notes (do not delete).

**Permissions**
- Can write `Knowledge.md` and phase frontmatter via `writeBundle()`.

---

## 2) The Contracts (what must always be true)

### Contract A — Vault is the State Machine
- `Orchestrator.json` + phase notes + checkboxes = current truth.
- The runtime always **reads fresh** before writing.

### Contract B — Deterministic Routing
- Routing decisions must not depend on LLM “judgment”.
- Given the same manifest state, routing is the same.

### Contract C — Single Writer
- Vault writes are centralized.
- Any component that needs to mutate vault state goes through `writeBundle()`.

### Contract D — Agents are bounded
- Planner writes plans (within markers).
- Worker executes one task, returns results.
- Runtime owns all FSM transitions + checkbox ticking + logging.

---

## 3) What “Feels Like Magic” (but is actually simple)

The “magic” is just tight loops + strict state:

1. **You say what you want** (intent).
2. The controller chooses the next deterministic operation.
3. If planning is needed, it spawns a planner.
4. If execution is needed, it spawns a worker.
5. It writes everything back into the vault and repeats.

Because the vault is always updated, the next run always starts with perfect context.

---

## 4) How OpenClaw and ONYX Fit Together

### OpenClaw provides the *agent runtime substrate*
- Messaging surfaces (webchat/WhatsApp/etc.)
- Tool calling + permissions
- Cron + scheduling (`cron` jobs)
- Session isolation (`sessions_spawn`) and routing

### ONYX provides the *project autonomy engine*
- Vault structure + state machines
- Deterministic routing + pipeline steps
- Context orchestration (QMD packets)
- Phase planning + task execution loops

### The integration point
- OpenClaw receives an intent message → triggers a ONYX controller run.
- ONYX runs:
  - heal → route → plan/execute → write vault → notify.

**Operational rule:** Runs should be invoked via `src/onyx/runController.ts` so they self-register in the ONYX dashboard/run registry.

---

## 5) Quick “Who am I?” Checklist (for any agent)

When you wake up inside the system, decide your role:

- Am I **observing**? → read-only status snapshot.
- Am I **planning**? → write only inside plan markers.
- Am I **executing**? → change code only, return results.
- Am I **routing**? → deterministic decision + pipeline execution.

If the role is unclear: default to **Vault Observer** and ask for clarification.
