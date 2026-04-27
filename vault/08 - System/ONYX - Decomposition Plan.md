---
title: ONYX — Decomposition Plan
tags:
  - system
  - architecture
  - plan
  - onyx
  - migration
type: plan
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] · [[08 - System/ONYX - Zero-Code Architecture Vision.md|Zero-Code Architecture Vision]] · [[08 - System/Agent Directives/ONYX Architecture Directive.md|ONYX Architecture Directive]]

# ONYX — Decomposition Plan

> **Purpose.** Migrate ONYX from a 15K-line TypeScript orchestrator to a thin CLI wrapper over vault-resident skills, directives, and operations. The Zero-Code Architecture Vision (§16) describes *why*; this plan describes *how*, with a ticked-off checklist you can work against.
>
> **End state.** `dist/` is a doorbell: it rings the agent, points it at the Master Directive, and gets out of the way. Every orchestration decision (how to heal, how to atomise, how to execute a phase) lives in the vault as markdown the agent reads and follows.

---

## 1. The gap we're closing

We already have:

- **Master Directive** — the 8-step loop, state model, routing table, capability surface. 1,764 lines.
- **~40 skill overview stubs** in `08 - System/Agent Skills/`.
- **~15 SKILL.md files** in `skills/*/SKILL.md` at repo root.
- **Role directives** for per-phase agent identity (researcher, engineer, etc.).
- **Profiles** for project archetype constraints.

We're missing:

- **Operation Directives** — the contract + procedure for each step the runtime performs. Today these are inlined in §6 of the Master Directive and duplicated in 3,916 lines of `src/executor`, `src/planner`, `src/healer`, `src/controller`.
- **Procedural depth** on runtime-internal skills. Existing SKILL.md files describe the contract but not the algorithm — so the directive has nothing real to delegate into.
- **Clear separation** between runtime skills (used by ONYX to run itself) and domain skills (used by phases to do work). Currently mixed together in one `Agent Skills/` folder.

---

## 2. The four-layer model

| Layer | Question it answers | Shape | Audience |
|---|---|---|---|
| **Master Directive** | What's the loop? | 1 file, target ~400 lines | Runtime at boot |
| **Operation Directives** | What's the contract for each step? | 1 file per operation | Runtime per iteration |
| **Skill procedures** | How exactly do I do X? | 1 SKILL.md per atomic capability, full procedure | Agent during execution |
| **Role Directives** | Who am I while doing this phase? | 1 file per role (exists) | Agent during phase work |
| **Profiles** | What are my constraints in this project? | 1 file per archetype (exists) | Agent during phase work |
| **Tools (shell)** | What side-effects am I allowed? | ~5–8 shell scripts | Agent during execution |

The **Operation Directive** layer is the missing middle. Adding it is what unlocks the src/ collapse.

---

## 3. The CLI after migration

`onyx` becomes a thin dispatcher. Each subcommand:

1. Resolves which Capability Directive (§7.X of Master Directive) applies
2. Loads Master Directive + Capability Directive as system prompt
3. Spawns `claude` with the vault as working directory
4. Gets out of the way

| Command | Today (src/cli/*.ts) | After migration |
|---|---|---|
| `onyx run` | Full controller loop | `claude --append-system "$(cat MasterDirective.md)" --dir $VAULT` |
| `onyx heal` | 882 lines of healer code | Load Master Directive + `Operations/heal.md`, invoke agent |
| `onyx plan <project>` | 785 lines of phase planner | Load Master Directive + `Operations/decompose-project.md`, invoke agent |
| `onyx atomise <project> [n]` | Part of planner | Load Master Directive + `Operations/atomise.md`, invoke agent |
| `onyx consolidate <project>` | 238 lines of consolidator | Load Master Directive + `Operations/consolidate.md`, invoke agent |
| `onyx status` / `onyx next` / `onyx check` | Read-only queries | Stay as code — read-only vault parsers, no orchestration |
| `onyx doctor` | Pre-flight | Stay as code — checks shell tools, env vars, binaries |
| `onyx init <name>` | Bundle scaffolding | Stay as code or thin template copier |
| `onyx dashboard` | Next.js launcher | Stay as code — long-running UI |

**Kept as code (the irreducible surface):**

- Doorbell (loop trigger — cron or file-watcher)
- Agent spawner (the 3-line `claude --append-system ...` wrapper)
- 5–8 shell tools in `tools/` (notify, heal-stale-locks, discover-phases, write-exec-log, atomise-phase shim, consolidate-knowledge shim, git-commit, fetch-url)
- Read-only vault parsers (`status`, `next`, `check`, `logs`)
- `onyx doctor`
- Dashboard launcher

Estimated final code surface: **~800–1,200 lines** from ~15,000. The compression is real because today's code is mostly encoding decisions that an agent with a directive can make.

---

## 4. Module-by-module decomposition

Each src/ module becomes one **Operation Directive** (the *what/why/contract*) plus one or more **Skills** (the *how*).

### 4.1 Executor — `src/executor/` (833 lines)

| Source | Becomes | Location |
|---|---|---|
| `runPhase.ts` (671 LOC) | Operation Directive: Execute Phase | `08 - System/Operations/execute-phase.md` |
| task-loop inner logic | Skill: phase-task-loop (select → spawn → write-back → tick) | `08 - System/Agent Skills/_onyx-runtime/phase-task-loop/phase-task-loop.md` |
| `selectTask.ts` (162 LOC) | Skill: select-next-task (full algorithm) | `08 - System/Agent Skills/_onyx-runtime/select-next-task/select-next-task.md` |
| spawn subprocess (claude-code / cursor) | Skill: agent-spawn (promote existing stub to full procedure) | `08 - System/Agent Skills/agent-spawn - Skill Overview.md` → move under `_onyx-runtime/agent-spawn/` |
| lock refresh inside runPhase | Skill: lock-lifecycle (acquire/refresh/release, shared by executor + atomiser + heal) | `08 - System/Agent Skills/_onyx-runtime/lock-lifecycle/lock-lifecycle.md` |

### 4.2 Atomiser — `src/planner/atomiser.ts` (498 lines)

| Source | Becomes | Location |
|---|---|---|
| atomiser.ts prompt + rules | Operation Directive: Atomise | `08 - System/Operations/atomise.md` |
| "6–12 tasks" heuristic, profile rules | Skill: atomise-phase (full procedure with per-profile branches) | `08 - System/Agent Skills/_onyx-runtime/atomise-phase/atomise-phase.md` |
| repo-scan subroutine | Skill: repo-scan (grep + tree + symbol index) | `08 - System/Agent Skills/_onyx-runtime/repo-scan/repo-scan.md` |

### 4.3 Planner — `src/planner/phasePlanner.ts` (785) + `replan.ts` (226)

| Source | Becomes | Location |
|---|---|---|
| phasePlanner.ts | Operation Directive: Decompose Project | `08 - System/Operations/decompose-project.md` |
| phase stub generator | Skill: phase-decompose | `08 - System/Agent Skills/_onyx-runtime/phase-decompose/phase-decompose.md` |
| replan.ts | Operation Directive: Replan Phase | `08 - System/Operations/replan.md` |

### 4.4 Consolidator — `src/planner/consolidator.ts` (238)

| Source | Becomes | Location |
|---|---|---|
| consolidator.ts | Operation Directive: Consolidate Knowledge | `08 - System/Operations/consolidate.md` |
| knowledge merge rules | Skill: knowledge-merge | `08 - System/Agent Skills/_onyx-runtime/knowledge-merge/knowledge-merge.md` |
| monthly-consolidate | Skill: monthly-rollup | `08 - System/Agent Skills/_onyx-runtime/monthly-rollup/monthly-rollup.md` |

### 4.5 Healer — `src/healer/*.ts` (882 lines)

The vault healer is today a pile of small checks bolted together. Carve each into its own skill so the `heal.md` Operation Directive is a visible checklist.

| Source | Becomes | Location |
|---|---|---|
| `healer/index.ts` orchestration (58 LOC) | Operation Directive: Heal Vault (ordered checklist) | `08 - System/Operations/heal.md` |
| `staleLocks.ts` (138) | Skill: heal-stale-locks | `08 - System/Agent Skills/_onyx-runtime/heal-stale-locks/heal-stale-locks.md` |
| `drift.ts` (296) | Skill: heal-frontmatter-drift (status/tag mismatches, invalid states) | `08 - System/Agent Skills/_onyx-runtime/heal-frontmatter-drift/heal-frontmatter-drift.md` |
| `orphans.ts` (276) | Skill: heal-orphans (logs, wikilinks, bundle folders) | `08 - System/Agent Skills/_onyx-runtime/heal-orphans/heal-orphans.md` |
| `migrateLogs.ts` (172) | Skill: heal-migrate-logs | `08 - System/Agent Skills/_onyx-runtime/heal-migrate-logs/heal-migrate-logs.md` |
| `repairProjectId.ts` (42) | Skill: heal-project-id | `08 - System/Agent Skills/_onyx-runtime/heal-project-id/heal-project-id.md` |
| graph maintainer (`src/vault/graphMaintainer.ts`) | Skill: heal-graph-integrity | `08 - System/Agent Skills/_onyx-runtime/heal-graph-integrity/heal-graph-integrity.md` |

The existing `safe-repair` / `drift-scan` SKILL.md files at repo root become **references** pointing into this suite — not primary sources.

### 4.6 Controller — `src/controller/loop.ts` (316) + `router.ts` (38)

| Source | Becomes | Location |
|---|---|---|
| loop.ts | Already mapped — Master Directive §3 (the 8-step loop) | no new file |
| router.ts | Already mapped — Master Directive §5 (routing table) | no new file |
| `Operation Directive: Route` (extract §5 for cleanliness) | Operation Directive: Route | `08 - System/Operations/route.md` |

Controller stays zero-code in the Master Directive. The Operation Directives in §6 are what get extracted to their own files per the tables above.

### 4.7 Lock + Notify + Vault ops

| Source | Becomes |
|---|---|
| `src/lock/*` (~100 LOC) | Skill: lock-lifecycle (single source of truth, shared) |
| `src/notify/notify.ts` (50 LOC) | Tool script — `tools/notify.sh` (openclaw wrapper, already exists) |
| `src/vault/discover.ts` (80 LOC) | Skill: discover-phases (find-work algorithm) |
| `src/vault/` write helpers | Skill: frontmatter-write (bump `updated:`, transition validation) |

---

## 5. Vault reorganisation

Add one new top-level section inside System: `Operations/`. This is the missing middle layer.

```
08 - System/
├── System Hub.md
├── ONYX Master Directive.md            (thin router — §6 extracted to Operations/)
├── ONYX - Reference.md
├── ONYX - Quick Start.md
├── ONYX - Artifact Reference.md
├── ONYX - Zero-Code Architecture Vision.md
├── ONYX - Decomposition Plan.md        ← THIS FILE
├── Operations/                         ← NEW — the missing middle layer
│   ├── Operations Hub.md
│   ├── execute-phase.md
│   ├── atomise.md
│   ├── decompose-project.md
│   ├── replan.md
│   ├── consolidate.md
│   ├── heal.md
│   ├── surface-blocker.md
│   └── route.md
├── Agent Skills/
│   ├── Agent Skills Hub.md
│   ├── _onyx-runtime/                  ← NEW subfolder — runtime-internal skills
│   │   ├── phase-task-loop/
│   │   ├── select-next-task/
│   │   ├── lock-lifecycle/
│   │   ├── agent-spawn/
│   │   ├── atomise-phase/
│   │   ├── repo-scan/
│   │   ├── phase-decompose/
│   │   ├── knowledge-merge/
│   │   ├── monthly-rollup/
│   │   ├── heal-stale-locks/
│   │   ├── heal-frontmatter-drift/
│   │   ├── heal-orphans/
│   │   ├── heal-migrate-logs/
│   │   ├── heal-project-id/
│   │   ├── heal-graph-integrity/
│   │   ├── discover-phases/
│   │   └── frontmatter-write/
│   └── (existing per-domain skills — suno, elevenlabs-tts, youtube-publish, ...)
├── Agent Directives/                   (role directives — unchanged)
├── Profiles/                           (unchanged)
└── Conventions/                        (unchanged)
```

The `_onyx-runtime/` subfolder separates "skills the runtime uses to run itself" from "skills phases invoke to do work." Today these are mixed in one `Agent Skills/` folder, making it hard to tell which are load-bearing for ONYX.

---

## 6. Operation Directive template

Every file in `Operations/` follows this shape so the contract is diffable against src/ modules:

```markdown
---
title: <Operation Name>
tags: [system, operation, onyx]
type: operation-directive
replaces: src/<path>/<file>.ts   ← for audit
version: 0.1
up: Operations Hub
---

# Operation: <Name>

## Preconditions
What must be true before invoking. Check these first; abort if any fail.

## Read Order
Files to load, in order, before executing. (§8 of Master Directive extract.)

## Procedure
Numbered steps. Each step either:
- Performs a direct vault write (specify exact frontmatter/section)
- Invokes a named Skill (link + inputs)
- Calls a tool script (name + args)

## Post-conditions & Transitions
What must be true after success. Which `status:` transitions are valid outcomes.

## Error Handling
- RECOVERABLE: <which errors, retry policy>
- BLOCKING: <which errors, block procedure>
- INTEGRITY: <which errors, halt procedure>

## Skills Invoked
Explicit list. Every skill used must appear here.

## Acceptance (self-check before exit)
The conditions the operation verifies before returning.
```

---

## 7. Skill procedure template

Every runtime skill SKILL.md is deeper than today's stubs — it contains the algorithm, not just the contract.

```markdown
---
title: <Skill Name>
tags: [skill, onyx-runtime]
replaces: src/<path>/<file>.ts
inputs: <structured list>
outputs: <structured list>
---

# Skill: <Name>

## Purpose
One sentence.

## Inputs
Named + typed. E.g. `phase_path: string`, `dry_run: bool`.

## Outputs
Named + typed. E.g. `fixes_applied: FixRecord[]`.

## Algorithm
Numbered steps. Pseudocode-level detail — enough that a cold agent can execute
correctly without re-reading the original TS.

## Invariants
What must remain true across invocations.

## Error cases
Named errors + how the caller should handle each.

## Examples
One worked example showing input → steps → output.
```

---

## 8. Migration stages

Built on Zero-Code Vision §16, with the Operations layer added.

### Stage 0 — Agreement ✅
- [x] Plan reviewed and saved as this file

### Stage 1 — Freeze the tool surface
- [x] Inventory every shell call currently made from src/ (24 calls, 7 files, clustered into 7 candidate tools)
- [x] Design tool catalog (first draft — 7 tools)
- [x] Consolidation review: drop 6 tools in favour of agent-native primitives + directive prose; keep 1 (`write-exec-log.sh`) for concurrent-append atomicity
- [ ] Implement `tools/write-exec-log.sh` (the only retained tool — `flock` + atomic append)
- [ ] Document the reduced catalog in `08 - System/Operations/_tools.md`
- [ ] Add `Doctor Directive.md` under `08 - System/` (replaces `onyx doctor` binary)
- [ ] Add `allowed_shell:` frontmatter to profiles (migrates the `isSafeShellCommand` whitelist)
- [ ] Add Master Directive invariant enforcing profile.allowed_shell + flesh out §15 Notifications format
- [ ] Gate: no new tools without explicit sign-off

### Stage 1.5 — Validate agent-native primitives (NEW)

**Purpose:** Before retiring any `src/` code, empirically verify that the proposed agent-native replacement works. Each dropped tool's capability gets a probe — a minimal task given to an agent with the directive + profile loaded, executed against a real vault, with the outcome compared to the TS implementation.

**Gate:** `src/<module>` may only be deleted after (a) its operation passes shadow-mode week, AND (b) every agent-native primitive it relies on has a green probe recorded in `08 - System/Operations/_agent-native-validation.md`.

- [x] Create `08 - System/Operations/_agent-native-validation.md` as the probe log
- [x] Probe: `shell-exec` replacement — 🟢 pass (2026-04-24). Finding: invariant 16 refusal-reason strings clarified.
- [x] Probe: `git-ops` replacement — 🟢 pass read ops (2026-04-24); tag write deferred to fixture.
- [x] Probe: `repo-scan` replacement — 🟢 pass (2026-04-24). Finding: existing `find` wrapper is buggy — native replacement is strictly better.
- [ ] Probe: `notify` replacement — needs `openclaw` auth in the test env
- [ ] Probe: `doctor-check` replacement — needs a machine with toggled env for negative cases
- [x] Probe: `agent-spawn` replacement — N/A (not replacing; no probe needed)
- [x] Probe: `heal` end-to-end — 🟢 pass (2026-04-24). Finding: TS healer has a bug (unquoted ISO → Date → schema reject → silent skip). Agent-directive approach read and healed correctly. Scope decision: orphan-node scaffolding becomes a separate operation, not part of heal.
- [x] Record each probe's outcome, date, and any caveats in the validation log
- [ ] Any red probe blocks the corresponding operation's Stage 3–5 migration until resolved

### Stage 2 — Create Operations/ scaffolding
- [ ] Write `08 - System/Operations/Operations Hub.md`
- [ ] Create stub files for all 8 operations (frontmatter + headings, no body yet)
- [ ] Each stub lists its src/ source module and current LOC — visible audit target
- [ ] Link Operations Hub from System Hub
- [ ] Update Master Directive §6 to link to Operations/*.md instead of inlining

### Stage 3 — Migrate the healer first
- [ ] Write `Operations/heal.md` as an ordered checklist
- [ ] Write the 6 heal skills under `_onyx-runtime/heal-*/SKILL.md`
- [ ] Shadow-mode week: both TS healer and directive agent run; compare writes
- [ ] Once diff is empty: delete `src/healer/`, `src/cli/heal.ts` becomes a directive loader

### Stage 4 — Migrate atomiser + consolidator
- [ ] Write `Operations/atomise.md` + `_onyx-runtime/atomise-phase/atomise-phase.md` + `repo-scan/SKILL.md`
- [ ] Write `Operations/consolidate.md` + `_onyx-runtime/knowledge-merge/knowledge-merge.md` + `monthly-rollup/SKILL.md`
- [ ] Shadow-mode week on both
- [ ] Delete `src/planner/atomiser.ts`, `src/planner/consolidator.ts`
- [ ] `src/cli/plan.ts` (atomise branch) + `src/cli/consolidate.ts` become directive loaders

### Stage 5 — Migrate executor (the big one)
- [ ] Write `Operations/execute-phase.md`
- [ ] Write `_onyx-runtime/phase-task-loop/phase-task-loop.md` + `select-next-task/SKILL.md` + `lock-lifecycle/SKILL.md`
- [ ] Promote `agent-spawn` overview stub to a full SKILL.md under `_onyx-runtime/`
- [ ] Shadow-mode week
- [ ] Delete `src/executor/`
- [ ] `src/cli/run.ts` becomes the loop trigger + agent spawner only

### Stage 6 — Migrate planner + replan
- [ ] Write `Operations/decompose-project.md` + `phase-decompose/SKILL.md`
- [ ] Write `Operations/replan.md`
- [ ] Shadow-mode
- [ ] Delete `src/planner/phasePlanner.ts`, `src/planner/replan.ts`

### Stage 7 — Collapse the CLI
- [ ] Each remaining `src/cli/*.ts` audited: keep (read-only or doorbell), replace with directive loader, or delete
- [ ] Collapse `onyx.config.json` into `08 - System/System Config.md` with frontmatter
- [ ] `dist/` final size target: 800–1,200 LOC

### Stage 8 — Cleanup
- [ ] Reconcile repo-root `skills/*/SKILL.md` with vault `_onyx-runtime/` — single source of truth, symlinks if tooling needs both
- [ ] Update `README.md` + `CLAUDE.md` + `GETTING_STARTED.md` to reflect new architecture
- [ ] Archive this plan when fully migrated: set `status: complete`, move to `08 - System/Archive/`

---

## 9. Open questions (resolve before each stage)

Answered up-front:

- **Operations/ location:** sibling of `Agent Skills/`, not folded in. Different audience (runtime vs phase work).
- **Healer or executor first:** healer. Smaller, more mechanical, proves the pattern with lower blast radius.
- **Repo-root skills/ vs vault skills/:** collapse to vault as single source of truth. Tooling that needs the repo path uses symlinks.

Deferred:

- **Who writes Operation Directives first-pass?** Likely: agent reads the src/ module + writes a first draft, human reviews. This itself becomes a phase.
- **Testing strategy for prose operations:** shadow mode is the primary gate. Snapshot tests of agent outputs against reference vaults possible but probably overkill.
- **What breaks `parallel agents`?** Lock lifecycle skill must be bulletproof. Current file-system locks work; prose version must preserve atomicity guarantees.
- **Can the agent modify its own Operation Directives?** Yes, but only via a phase in `08 - System/` with `engineering` profile, reviewed by a human. (Master Directive invariant 9.)

---

## 10. Success criteria

This migration is complete when:

1. `dist/` is under 1,500 lines of code.
2. Every operation ONYX performs has a matching `Operations/*.md` directive.
3. Every runtime-internal skill has a full procedural SKILL.md, not a stub.
4. `onyx run` is literally a three-line shell script.
5. A new operator can read `System Hub.md → Master Directive → Operations/*.md` and understand the entire runtime without opening a .ts file.
6. Shadow-mode comparison (TS runtime vs directive agent) shows zero behavioural diff for a full week across all projects.

---

## 11. References

- [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] — current runtime in prose (target for §6 extraction)
- [[08 - System/ONYX - Zero-Code Architecture Vision.md|Zero-Code Architecture Vision]] — the *why* behind this plan
- [[08 - System/Agent Directives/ONYX Architecture Directive.md|ONYX Architecture Directive]] — current code architecture audit (§25 has the module inventory)
- [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]] — existing skill overview index
- [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]] — project archetype constraints (unchanged by this plan)
