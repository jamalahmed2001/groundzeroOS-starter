---
tags:
  - status-active
  - system
graph_domain: system
created: 2026-01-28T00:00:00.000Z
updated: 2026-04-27T10:52:05Z
status: active
up: Agent Directives Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# ONYX Tools Reference

---

## Tool Categories

### ONYX CLI (Primary Interface)

All vault operations go through the `onyx` CLI. Convention: `onyx <verb> [project] [--flags]`.
Global flags: `--json` (machine-readable output), `--verbose` / `-v`.

| Command | Purpose |
|---------|---------|
| `onyx plan <project>` | Create phases + atomise tasks |
| `onyx plan <project> <n>` | Atomise a single phase |
| `onyx plan <project> --extend` | Add new phases from updated Overview |
| `onyx run [project]` | Full loop: heal → plan → execute → consolidate |
| `onyx run <project> --phase <n>` | Execute specific phase (auto-implies --once) |
| `onyx status [project] [--json]` | Show all projects and phase states |
| `onyx heal [--json]` | Fix stale locks, drift, graph links |
| `onyx doctor [--json]` | Pre-flight checks |
| `onyx init <name>` | Create new project bundle |
| `onyx reset <project> [--phase n]` | Reset stuck phase to ready |
| `onyx set-state <path> <state>` | Programmatic state change |
| `onyx logs [project]` | Show execution logs |
| `onyx daily-plan [date]` | Generate time-blocked daily plan |
| `onyx capture <text>` | Quick capture to Inbox |
| `onyx import <linear-id>` | Import Linear project |

### Core Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Controller loop | `src/controller/loop.ts` | Main orchestration: heal → discover → route → act |
| Router | `src/controller/router.ts` | Pure FSM routing: state → operation |
| Executor | `src/executor/runPhase.ts` | Lock → task loop → agent spawn → tick → release |
| Atomiser | `src/planner/atomiser.ts` | LLM-assisted task generation with grounding rules |
| Phase planner | `src/planner/phasePlanner.ts` | LLM-assisted phase decomposition |
| Healer | `src/healer/` | Stale locks, drift normalisation, state migration |
| Graph maintainer | `src/vault/graphMaintainer.ts` | Fractal topology, nav links, hub splitting |
| Shared types | `src/shared/types.ts` | Single source of truth for all type definitions |
| Shared parsing | `src/shared/vault-parse.ts` | `stateFromFrontmatter()`, `countTasks()` |
| Vault reader | `src/vault/reader.ts` | `readPhaseNode()`, `readBundle()`, `discoverBundles()` |
| Vault writer | `src/vault/writer.ts` | `setPhaseTag()`, `tickTask()`, `appendToLog()` |
| Agent drivers | `src/agents/` | Claude Code + Cursor spawn abstraction |
| Config loader | `src/config/load.ts` | snake_case canonical, env for secrets |

---

## Vault Maintenance

Run `onyx heal` after any structural change. It handles:
- **Stale lock clearing** — locks older than 5 min
- **State field migration** — adds `state:` field to legacy notes missing it
- **Drift normalisation** — tag/status/state disagreements resolved
- **Graph maintenance** — nav links, hub splitting, stale link removal
- **Node consolidation** — archive completed phase groups

```bash
onyx heal           # human-readable output
onyx heal --json    # machine-readable: { locksCleared, driftFixed, graphRepairs, ... }
```

---

## Bundle Creator

```bash
onyx init "ProjectName"              # interactive — scans repo, creates full bundle
onyx init "ProjectName" --repo /path # with explicit repo path
```

Valid domains: `openclaw | fanvue | paid | personal | business | ventures`

Domain → vault path routing:
- `openclaw` → `10 - OpenClaw/<Name>/`
- `fanvue` → `02 - <workplace>/<Name>/`
- `paid` → `03 - Ventures/Paid Projects/<Name>/`
- `personal` → `03 - Ventures/Personal/<Name>/`
- `business` → `03 - Ventures/Business/<Name>/`
- `ventures` → `03 - Ventures/<Name>/`

Generated files:
- `<Name> - Overview.md`
- `<Name> - Kanban.md`
- `<Name> - Knowledge.md`
- `<Name> - Docs Hub.md`
- `<Name> - Orchestrator.json` (ManifestV2 stub)
- `Phases/` directory
- `Docs/` directory
- `Phases/<Name> - <PhaseName>.md` for each `--phases` entry

Existing files are never overwritten. After running, execute vault maintenance to wire nav links.

---

## Skill Sync

Skills live in `~/clawd/skills/<skill-name>/SKILL.md`. The sync tool upserts vault overview notes.

```bash
npx tsx src/onyx/vault/syncSkillOverviews.ts --apply
```

- Source: `~/clawd/skills/*/SKILL.md`
- Destination: `08 - System/Agent Skills/<skill-name>.md`
- Creates missing overviews; updates existing ones (preserves nav block)
- Run after: adding a new skill or updating a SKILL.md

---

## Graph Builder

Converts an execution roadmap into a bundle. Used by the Atomizer to create phase structures from structured plans.

```bash
npx tsx src/onyx/vault/graphBuilder.ts \
  --roadmap path/to/roadmap.md \
  --domain openclaw
```

- Reads phase definitions from the roadmap
- Writes `Phase N - <Name>.md` files under `Phases/`
- Populates `Orchestrator.json` `phases` map
- Does not overwrite existing phase files — only creates missing ones

---

## Orchestrator.json — ManifestV2 Schema

```typescript
interface ManifestV2 {
  manifest_version: 2;
  project_id: string;
  repo_path: string;
  status: 'draft' | 'active' | 'blocked' | 'complete' | 'archived';
  health: 'healthy' | 'degraded' | 'critical';
  active_phase: number | null;
  phases: {
    [phaseNumber: string]: {
      title: string;
      status: 'planned' | 'ready' | 'active' | 'blocked' | 'complete';
      file: string;            // vault-relative path to phase .md
      tasks_total?: number;
      tasks_done?: number;
      tasks_blocked?: number;
    }
  };
  pipeline_atoms: Array<{
    atom: string;              // e.g. "Phase-Executor", "Sync-State"
    predicate: string;
    status: 'pending' | 'active' | 'complete' | 'blocked';
  }>;
  config: {
    test_cmd?: string;
    lint_cmd?: string;
    build_cmd?: string;
  };
  last_run: {
    run_id: string;
    timestamp: string;         // ISO 8601
    outcome: string;
    phase?: number;
    task?: string;
  } | null;
  created: string;
  updated: string;
}
```

---

## Phase File Format

Each file under `Phases/` follows this structure:

```markdown
---
tags: [phase, status-active]
graph_domain: <domain>
phase_id: N
phase_status_tag: active
project: ProjectName
up: ProjectName - Overview
---
# Phase N — Phase Name

## Objective
One paragraph. What this phase achieves and why it matters.

## 📂 Tasks
- [ ] Task 1
- [ ] Task 2

## 📋 Implementation Plan
<!-- AGENT_WRITABLE_START:phase-plan -->
### Implementation Tasks
- [ ] **Task 1: Short title**
  - Files: src/foo.ts
  - Symbols: function foo
  - Steps: Step A, Step B
  - Validation: npm test passes
<!-- AGENT_WRITABLE_END:phase-plan -->

## ✅ Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## 🔒 Blockers
(empty unless blocked)

## 📝 Agent Log
- [2026-03-25] FSM: planned → ready (plan_created)
- [2026-03-25] Task 1 complete (note)
```

**Task discovery rules:**
1. `## 📋 Implementation Plan → ### Implementation Tasks` is checked first
2. `## 📂 Tasks` used only if no Implementation Plan section
3. Tasks in `## ✅ Acceptance Criteria`, `## 🔒 Blockers`, `## 📝 Agent Log`, or fenced code blocks are never ticked by executor

---

## Tool Chaining Patterns

**New project from scratch:**
```
vaultCli.ts bundle create --name "X" --domain fanvue --apply
→ vaultMaintenance.ts --apply-force   (wire nav links)
→ controller.ts handleMessage("execute X")   (atomise → plan → execute)
```

**Move an existing bundle:**
```
mv vault/old-path vault/new-path
→ vaultMaintenance.ts --apply-force   (repairs Orchestrator paths + nav)
```

**After any bulk vault change:**
```
vaultMaintenance.ts --apply-force
```

**Add a new skill:**
```
Write ~/clawd/skills/<name>/SKILL.md
→ syncSkillOverviews.ts --apply
→ vaultMaintenance.ts --apply-force
```

**Run autonomous batch execution:**
```
controllerKernel.ts runKernel()
→ deterministic routing table dispatches all active projects
→ self-healer runs before each project pipeline
→ circuit breaker isolates failures per project
```

Always run `vaultMaintenance.ts` last — it is the reconciliation step that makes the vault consistent after any structural change.
