---
tags: [system, architecture, directive, onyx]
created: 2026-04-13
updated: 2026-04-16
type: directive
version: "4.0"
---

# ONYX Architecture Directive v4.0

> **For agents working on ONYX itself.** Load this before reading any ONYX source file. It describes exactly what exists, how it works, and why — based on the current codebase.

---

## 1. System Philosophy

ONYX is a **vault-native agent orchestration layer**. It has three components:

1. **TypeScript CLI** (`src/`) — the controller, healer, executor, atomiser, consolidator. The nervous system.
2. **Vault convention** — file names, folder layout, frontmatter fields. The contract.
3. **Obsidian vault** — the only state store. Markdown files are ground truth.

**Invariants that never change:**

- The vault is the only state. No external database. No sidecar state. If it's not in a vault file, it didn't happen.
- Phase is the unit of execution. Every project decomposes into phases. The phase lifecycle (FSM) is universal.
- Agents are disposable. ONYX spawns them, they work, they exit. The vault persists. Swap the agent driver without changing anything else.
- Knowledge compounds. Every completed phase feeds into Knowledge.md. Every subsequent agent reads it.
- Healing is proactive. The healer runs before every execution loop. Drift doesn't accumulate.

**What does NOT exist in ONYX (removed or never built):**

- `Orchestrator.json` — removed. Config is `onyx.config.json`. State is vault frontmatter.
- `ManifestV2` — removed. Phase state lives in frontmatter tags and `state:` field.
- QMD (Query Metadata Document) — removed. Agents receive file paths via `--add-dir`, read natively.
- `pipeline_atoms` / pipeline recipes — removed. The controller loop is a direct FSM, not a recipe pipeline.
- `pipelineRunner.ts`, `controllerKernel.ts`, `intentClassifier.ts`, `stateTools.ts` — none of these exist. Old architecture.
- Circuit breaker — removed. Retry logic is per-phase (3-strike). No global circuit breaker.
- `ExecLog.md` — removed. Execution is logged to per-phase log notes (`Logs/L{n} - ...md`).
- AGENT_WRITABLE boundary markers — used only in the managed block system for atomised plans. Not a general boundary.

---

## 2. Source Structure

```
src/
├── cli/            # CLI entry points — one file per command
│   ├── onyx.ts     # Main CLI router (commander.js)
│   ├── run.ts      # onyx run
│   ├── plan.ts     # onyx plan (decompose + atomise)
│   ├── init.ts     # onyx init
│   ├── status.ts   # onyx status
│   ├── explain.ts  # onyx explain
│   ├── heal.ts     # onyx heal
│   ├── doctor.ts   # onyx doctor
│   └── ...         # one file per remaining command
│
├── controller/
│   ├── loop.ts     # Main orchestration loop (runController)
│   └── router.ts   # Pure FSM router (state → operation, no IO)
│
├── executor/
│   └── runPhase.ts # Phase execution: lock → preflight → shell fast-path → agent → retry → acceptance
│
├── planner/
│   ├── atomiser.ts      # Phase stub → task plan (LLM or agent-write)
│   ├── phasePlanner.ts  # Overview → phase stubs (decompose)
│   ├── replan.ts        # Blocked phase → revised plan
│   └── consolidator.ts  # Phase log → Knowledge.md extraction
│
├── healer/
│   ├── index.ts         # Healer orchestration (runAllHeals)
│   ├── staleLocks.ts    # Clear locks older than stale_lock_threshold_ms
│   ├── drift.ts         # Normalise frontmatter drift, fix tag inconsistencies
│   ├── migrateLogs.ts   # Migrate legacy log formats
│   ├── repairProjectId.ts # Repair missing project_id in frontmatter
│   └── recoverOrphanedLocks.ts # Recover phases locked by dead PIDs
│
├── vault/
│   ├── reader.ts        # Read phase nodes, bundles, raw files
│   ├── writer.ts        # Write vault files atomically (setPhaseTag, appendToLog, writeFile)
│   ├── discover.ts      # Scan vault for phases, filter by state + dependencies
│   ├── graphMaintainer.ts   # Maintain vault graph metadata
│   ├── nodeConsolidator.ts  # Consolidate vault nodes
│   ├── managedBlocks.ts     # AGENT_WRITABLE managed block I/O
│   ├── knowledgeIndex.ts    # Semantic knowledge retrieval
│   ├── repoScanner.ts       # Scan repo files for context
│   └── ...
│
├── agents/
│   ├── claudeCodeSpawn.ts   # Spawn claude CLI subprocess
│   ├── cursorSpawn.ts       # Spawn Cursor agent
│   ├── spawnAgent.ts        # Agent driver abstraction
│   └── types.ts             # Agent type definitions
│
├── llm/
│   ├── client.ts            # LLM API client (OpenRouter)
│   ├── planningRouter.ts    # Route planning calls to right model/agent
│   └── ...
│
├── shared/
│   ├── types.ts             # ControllerConfig, PhaseNode, AgentDriver
│   ├── schemas.ts           # Frontmatter validation schemas
│   └── vault-parse.ts       # stateFromFrontmatter, tag parsing
│
├── config/
│   └── load.ts              # loadConfig() — reads onyx.config.json + .env
│
├── lock/
│   ├── acquire.ts           # Acquire phase lock (atomic)
│   └── release.ts           # Release phase lock
│
├── fsm/
│   └── states.ts            # Phase state machine definitions
│
├── linear/                  # Linear integration
├── notify/                  # Notification dispatch
├── skills/                  # phaseReview, etc.
├── audit/                   # Audit trail
└── utils/                   # complexityClassifier, log, etc.
```

---

## 3. Controller Loop

**Entry point:** `src/controller/loop.ts` → `runController(config, options)`

Called by `onyx run`. The full loop:

```
1. runAllHeals(config)               → clear stale locks, fix drift, repair IDs
2. maintainVaultGraph(config)        → update graph metadata
3. consolidateVaultNodes(config)     → node consolidation
4. detectDependencyCycles(allPhases) → warn on deadlocks, abort if cycles found
5. discoverAllPhases(vaultRoot, glob)→ load all phase nodes
6. For each phase:
     routePhase(phase)               → returns { op, phaseNode, reason? }
     Switch on op:
       'atomise'         → atomisePhase() → setPhaseTag ready
       'execute'         → runPhase()
                           ↳ on complete: consolidatePhase() + runPhaseReview()
                           ↳ on blocked:  consolidatePhase() + replanPhase()
       'surface_blocker' → log blocker, notify human
       'wait'            → skip (atomiser in flight)
       'skip'            → skip (completed)
7. If --once flag: exit after first actionable phase
8. If no actionable phases remain: exit
9. Repeat (up to maxIterations)
```

**SIGINT / SIGTERM:** The loop catches signals. On interrupt, the current phase writes a checkpoint file (`.onyx-continue-P{n}.md`) so execution can resume cleanly with `onyx run`.

**Hard limits:** `maxIterations` (default 20) prevents infinite loops. If the limit is hit, the loop exits with a warning.

---

## 4. Router

**File:** `src/controller/router.ts`

**Principle:** Pure function. No IO. No side effects. Takes a `PhaseNode`, returns an `Operation`. This is the only place phase state maps to action.

```typescript
function routePhase(phase: PhaseNode): RouteResult {
  const state = stateFromFrontmatter(phase.frontmatter);
  switch (state) {
    case 'backlog':   return { op: 'atomise',         phaseNode: phase };
    case 'planning':  return { op: 'wait',             phaseNode: phase, reason: 'Atomiser in flight' };
    case 'ready':     return { op: 'execute',          phaseNode: phase };
    case 'active':    return { op: 'execute',          phaseNode: phase }; // stale-lock recovery
    case 'blocked':   return { op: 'surface_blocker',  phaseNode: phase };
    case 'completed': return { op: 'skip',             reason: 'Already completed' };
  }
}
```

**Why `active` → `execute`:** If an agent died mid-phase and left the lock (state remains `active`), the healer clears the stale lock and the router resumes execution. The phase doesn't get stuck.

---

## 5. Execution

**File:** `src/executor/runPhase.ts`

Full execution sequence for a single phase:

```
1. resolveContextPaths()   — determine profile, directive, context docs for this phase
2. backup phase file       — write .bak before touching anything
3. acquireLock()           — write locked_by, locked_at, lock_pid, lock_ttl_ms to frontmatter
4. preflight()             — validate required_fields from profile; fatal if any missing
5. setPhaseTag('active')   — tag: phase-active
6. buildPrompt()           — lean prompt: file paths only (not content injection)
7. shell fast-path check   — if all tasks are whitelisted shell commands, run directly (no agent)
8. spawnAgent()            — spawn claude CLI subprocess with --add-dir paths
9. task loop:
     selectTask()          — find next unchecked checkbox
     dispatch to agent     → agent executes task → ticks checkbox → writes output
     on BLOCKED:           → 3-strike retry → writeHumanRequirement + block if 3 strikes
10. acceptanceMet()        — check ## Acceptance Criteria checkboxes
11. On accepted:
     setPhaseTag('completed')
     git tag 'onyx/P{n}-done'  (if repo_path exists and git repo)
     releaseLock()
12. Return result for consolidation
```

### Context path resolution

```typescript
interface ContextPaths {
  profileName:    string;        // e.g. 'engineering'
  profilePath:    string;        // 08 - System/Profiles/engineering.md
  requiredFields: string[];      // from profile frontmatter
  directivePath:  string | null; // resolved directive file or null
  overviewPath:   string;        // Project/Overview.md
  knowledgePath:  string;        // Project/Knowledge.md
  repoPath:       string | null; // from overview frontmatter repo_path
  bundleDir:      string;        // Project bundle folder
  addDirs:        string[];      // [bundleDir] + [repoPath if valid]
  checkpointPath: string;        // .onyx-continue-P{n}.md
  // ...and source context, log paths, etc.
}
```

### Directive resolution

1. Read `directive:` from phase frontmatter
2. Look for `{bundleDir}/Directives/{name}.md` — project-local override first
3. Fall back to `{vaultRoot}/08 - System/Agent Directives/{name}.md`
4. If not found: warn + skip (not fatal)

**Experimenter auto-wiring:** If `directive:` is absent but `cycle_type:` is set on an experimenter-profile phase:

```typescript
const cycleMap = {
  learn:      'experimenter-researcher',
  design:     'experimenter-researcher',
  experiment: 'experimenter-engineer',
  analyze:    'experimenter-analyzer',
};
```

### The lean prompt pattern

`buildPrompt()` does NOT inject file content. It points the agent at file paths:

```
Read these files before starting:
- {directivePath}      (who you are)
- {profilePath}        (domain rules + acceptance gate)
- {overviewPath}       (project goals + constraints)
- {knowledgePath}      (all prior learnings)
- {contextDocPath}     (Repo Context / Source Context / Research Brief)
- {phasePath}          (what to do right now)

Your working directories: {addDirs}
Current task: {currentTask}
```

The agent reads the actual vault files natively via `--add-dir`. No content duplication. Context stays tight.

### 3-Strike retry

```
consecutiveFailures  0-2  → retry with revised prompt
consecutiveFailures  3    → writeHumanRequirement("## Human Requirements\n...")
                           → setPhaseTag('blocked')
                           → releaseLock()
                           → return { blocked: true }
```

Self-reported blockers: if agent output contains `BLOCKED: <reason>`, it counts as a failure.

### Shell fast-path

Safe whitelisted commands (ls, git status, npm test, echo, cat, etc.) can be executed directly without spawning an agent process. This keeps simple validation phases fast.

### Complexity classifier

`src/utils/complexityClassifier.ts` — reads task content and phase frontmatter to route to the right model tier:

| `complexity:` frontmatter | Model tier | Default model |
|---|---|---|
| `light` | light | claude-haiku-4-5 |
| *(unset)* | standard | claude-sonnet-4-6 |
| `heavy` | heavy | claude-opus-4-6 |
| *(planning calls)* | planning | claude-opus-4-6 |

---

## 6. Atomising

**File:** `src/planner/atomiser.ts`

Converts a phase stub (`state: backlog`) into a task plan with checkboxes.

Two strategies, selected by `planningUsesAgent()`:

**LLM direct** (default): Uses `chatCompletion()` → OpenRouter → returns task plan as text → written into phase file between managed block markers.

**Agent-write**: Spawns a Claude Code agent instructed to read the phase, explore the repo, and write the plan directly using Edit/Write tools. Used when the phase requires deep repo understanding.

**Managed block markers:**
```
<!-- AGENT_WRITABLE_START:phase-plan -->
## Implementation Plan
### [T1] Task name
**Files:** `path/to/file.ts`
**Steps:** ...
**Validation:** ...
**DoD:** ...
- [ ] [T1.1] Sub-task
- [ ] [T1.2] Sub-task
<!-- AGENT_WRITABLE_END:phase-plan -->
```

Agents MUST write tasks inside this block. The managed block system (`src/vault/managedBlocks.ts`) handles reading and replacing content between these markers.

**After atomising:** Phase tag transitions from `phase-backlog` → `phase-ready`.

**GROUNDING RULES (enforced via system prompt):**
- `Files:` lines must reference files that exist in the repo tree, or be marked `(new)`
- Do not invent file paths
- Validation steps must use commands that exist (check package.json scripts)

---

## 7. Replanning

**File:** `src/planner/replan.ts`

Called when a phase blocks after 3 consecutive failures. The replanner:

1. Reads the phase note (including `## Human Requirements` written by the executor)
2. Reads Knowledge.md and the blocker context
3. Calls the LLM with a revised plan prompt
4. Writes a new implementation plan back to the phase file (replacing the old one)
5. Sets phase tag back to `phase-ready` (or leaves as `blocked` if replanning itself fails)

**Replan limit:** After 3 consecutive replan attempts, the phase stays blocked and surfaces to the human.

---

## 8. Knowledge Consolidation

**File:** `src/planner/consolidator.ts`

Called after every phase execution (completed AND blocked). Extracts structured learnings from the phase log.

**System prompt instructs the LLM to produce:**
```json
{
  "learnings": ["reusable pattern or technique — 1-2 sentences, 2-5 items"],
  "decisions": ["Chose X over Y because Z — 1-3 items or []"],
  "gotchas":   ["X fails when Y, use Z instead — 1-3 items or []"]
}
```

**Output written to Knowledge.md:** Appended under `## Learnings`, `## Decisions`, `## Gotchas` sections.

**Cross-project principles:** A second LLM call deduplicates learnings against `08 - System/Cross-Project Knowledge.md`. Only genuinely new, project-agnostic principles get added. Each new entry includes: name, rule, why (failure mode it prevents), first_seen (project + context).

**Both outcomes captured:** Blocked phase logs generate gotchas. Completed phase logs generate learnings + decisions. Neither is skipped.

---

## 9. Healer

**File:** `src/healer/index.ts` — orchestrates all 5 healers via `runAllHeals(config)`

Called at the start of every `onyx run` and by `onyx heal`.

### 5 repair types

| Healer | File | What it fixes |
|---|---|---|
| `staleLocks` | `healer/staleLocks.ts` | Phases locked longer than `stale_lock_threshold_ms` (default 5 min) → clear lock fields, reset to `phase-ready` |
| `drift` | `healer/drift.ts` | Frontmatter drift: normalise `state` vs `tags` inconsistencies, fix tag format, remove duplicates |
| `migrateLogs` | `healer/migrateLogs.ts` | Migrate legacy log formats to current `Logs/L{n} - ...md` structure |
| `repairProjectId` | `healer/repairProjectId.ts` | Add missing `project_id` field to phase frontmatter based on folder path |
| `recoverOrphanedLocks` | `healer/recoverOrphanedLocks.ts` | Find phases locked by PIDs that no longer exist → clear lock, reset to ready |

### HealAction types

```typescript
type HealAction =
  | 'stale_lock_cleared'
  | 'frontmatter_drift_fixed'
  | 'tag_normalized'
  | 'missing_section_detected'
  | 'orphaned_lock_field_cleared'
  | 'replan_count_reset'
  | 'duplicate_nav_removed'
  | 'project_id_repaired'
```

Each healer returns a list of `HealAction` objects. The full set is logged to stdout and returned to the controller.

---

## 10. Vault I/O

**Files:** `src/vault/reader.ts`, `src/vault/writer.ts`

### Reader

```typescript
// Read a single phase node (frontmatter + body)
readPhaseNode(absolutePath: string): PhaseNode

// Read a raw file as string (null if not found)
readRawFile(absolutePath: string): string | null

// Read a full project bundle
readBundle(bundleDir: string): VaultBundle
```

### PhaseNode

```typescript
interface PhaseNode {
  path:        string;                       // Absolute path
  exists:      boolean;                      // false if file missing
  frontmatter: Record<string, unknown>;      // Parsed YAML frontmatter
  body:        string;                       // Content after frontmatter
  raw:         string;                       // Full file text
}
```

### Writer

```typescript
// Set phase tag state (e.g. 'phase-ready', 'phase-active', 'phase-blocked', 'phase-completed')
setPhaseTag(path: string, tagSuffix: string): void

// Append timestamped entry to the phase's log note
appendToLog(logNotePath: string, content: string): void

// Write any file atomically
writeFile(absolutePath: string, content: string): void

// Derive the log note path for a phase
deriveLogNotePath(phasePath: string, bundleDir: string): string
```

**Rule:** All vault writes go through the writer module. Never call `fs.writeFileSync` on vault files directly from controller, healer, or executor code.

### VaultBundle

```typescript
interface VaultBundle {
  bundleDir:  string;
  overview:   PhaseNode;
  knowledge:  PhaseNode;
  phases:     PhaseNode[];    // Sorted by phase_number
  logNotes:   PhaseNode[];
  docs:       PhaseNode[];    // Repo Context, Source Context, etc.
}
```

---

## 11. Discovery & Dependency Management

**File:** `src/vault/discover.ts`

### Phase discovery

```typescript
// All phases in vault (any state)
discoverAllPhases(vaultRoot, projectsGlob): PhaseNode[]

// Only ready phases (respects dependencies)
discoverReadyPhases(vaultRoot, projectsGlob): PhaseNode[]

// Only active phases (stale-lock detection)
discoverActivePhases(vaultRoot, projectsGlob): PhaseNode[]
```

Phase notes are found by:
1. `projectsGlob/Phases/*.md` pattern
2. Validation: `isPhaseNote()` check — requires `onyx-phase` tag OR `phase_number` field OR lives in `/Phases/` directory
3. Schema validation via `validatePhaseFrontmatter()` — hard-invalid notes are skipped with a warning

### Dependency resolution

```typescript
function dependenciesMet(phase: PhaseNode, allProjectPhases: PhaseNode[]): boolean {
  const deps = phase.frontmatter['depends_on'];
  // Handles numeric 1, string "1", and "P1"/"P2" shorthand
  // Returns false if any dependency is missing or not 'completed'
}
```

A phase with `depends_on: [P1, P2]` won't appear in the ready queue until both P1 and P2 are `completed`. Missing dependency = block (conservative).

### Cycle detection

```typescript
detectDependencyCycles(phases: PhaseNode[]): Array<{ cycle: number[] }>
```

DFS-based cycle detection. Called at controller startup. A cycle (e.g. P1 → P2 → P1) produces a permanent deadlock — both phases wait forever. If cycles are found, the controller logs a clear error and stops.

### Sort order (ready queue)

```typescript
// 1. priority (0–10, default 5) — higher runs first
// 2. risk (high:0 → medium:1 → low:2) — high risk phases run first as tiebreaker
// 3. phase_number ascending — natural progression
```

---

## 12. Configuration

**Files:** `onyx.config.json`, `.env`, `src/config/load.ts`

### onyx.config.json

```json
{
  "vault_root":             "/absolute/path/to/obsidian/vault",
  "projects_glob":          "01 - Projects/**",
  "agent_driver":           "claude-code",
  "stale_lock_threshold_ms": 300000,
  "max_iterations":         20,
  "model_tiers": {
    "planning":  "anthropic/claude-opus-4-6",
    "standard":  "anthropic/claude-sonnet-4-6",
    "light":     "anthropic/claude-haiku-4-5-20251001",
    "heavy":     "anthropic/claude-opus-4-6"
  },
  "llm": {
    "model":    "anthropic/claude-sonnet-4-6",
    "base_url": "https://openrouter.ai/api/v1"
  },
  "notify": {
    "stdout": true
  }
}
```

### .env (secrets — never commit)

```bash
ONYX_VAULT_ROOT=/absolute/path/to/vault    # Overrides config vault_root
OPENROUTER_API_KEY=sk-or-...               # LLM API key
LINEAR_API_KEY=lin_api_...                 # Linear integration (optional)
WHATSAPP_RECIPIENT=+447700000000           # WhatsApp notifications (optional)
WHATSAPP_API_KEY=...                       # WhatsApp API key (optional)
```

### Config loading precedence

```
ONYX_VAULT_ROOT env var  >  vault_root in onyx.config.json
OPENROUTER_API_KEY env   >  llm.api_key in config
.env file values         >  nothing (only sets if key not already in process.env)
```

### Deprecated keys (still supported, use new names)

| Old | New |
|---|---|
| `vaultRoot` | `vault_root` |
| `projectsGlob` | `projects_glob` |
| `staleLockThresholdMs` | `stale_lock_threshold_ms` |
| `maxIterations` | `max_iterations` |
| `agentDriver` | `agent_driver` |
| `modelTiers` | `model_tiers` |

---

## 13. Profiles & Directives System

### 13.1 Profiles

A **profile** is `08 - System/Profiles/{name}.md`. It defines the mechanical contract for a project type. Read at execution time to control:

- `required_fields` — what Overview must contain (preflight fatal if missing)
- Domain-specific acceptance rules
- Phase field conventions

**Profile resolution:** Read `profile:` from Overview frontmatter. Defaults to `engineering` if missing.

**Nine profiles:**

| Profile | required_fields | Acceptance gate |
|---|---|---|
| `general` | none | All tasks checked + output documented |
| `engineering` | `repo_path`, `test_command` | test_command exits 0 |
| `content` | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| `research` | `research_question`, `source_constraints`, `output_format` | source count + confidence gaps declared |
| `operations` | `monitored_systems`, `runbook_path` | runbook followed + outcome documented |
| `trading` | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest exits 0 + risk compliance |
| `experimenter` | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |
| `accounting` | `ledger_path`, `reporting_period` | trial balance verified |
| `legal` | `jurisdiction`, `matter_type` | evidence hierarchy followed + citations verified |

### 13.2 Directives

A **directive** is a markdown file prepended to the agent's context as the first item — before the profile, before the Overview. It defines who the agent is for the phase.

**Directive resolution order:**
1. Read `directive:` from phase frontmatter
2. Look for `{bundleDir}/Directives/{name}.md` — project-local first
3. Fall back to `{vaultRoot}/08 - System/Agent Directives/{name}.md`
4. If not found: warn + skip (not fatal)

**`cycle_type` auto-wiring** (experimenter profile only):

```typescript
const cycleMap = {
  learn: 'experimenter-researcher', design: 'experimenter-researcher',
  experiment: 'experimenter-engineer', analyze: 'experimenter-analyzer',
};
```

### 13.3 Context injection order

```
1. directivePath      (who the agent is — role, constraints, output format)
2. profilePath        (domain rules + acceptance gate)
3. overviewPath       (project goals + scope + required fields)
4. knowledgePath      (all prior learnings — compounds across phases)
5. contextDocPath     (Repo Context / Source Context / Research Brief / etc.)
6. phasePath          (what to do right now — tasks, acceptance criteria)
```

### 13.4 --add-dir access

The agent always gets `bundleDir` in `--add-dir`. For engineering profiles, `repoPath` is added too. This means:

- Content/research agents can read Source Context, Cognition Store, Directives, etc. without a git repo
- Engineering agents can read both the bundle docs AND the codebase

### 13.5 Preflight validation

Before acquiring the lock, ONYX runs profile-driven preflight:

```typescript
for (const field of requiredFields) {
  const val = String(ovFrontmatter[field] ?? '').trim();
  if (!val) fatal(`Missing required field "${field}" (profile: ${profileName})`);
  if (field === 'repo_path' && !fs.existsSync(val)) fatal(`repo_path does not exist: ${val}`);
}
```

Missing a required field → phase does not run. Fix the Overview, then retry.

---

## 14. Knowledge Compounding & Experimenter Loop

### 14.1 Knowledge.md as compounding memory

Every agent reads `Knowledge.md` before starting its phase. Knowledge accumulates across phases — what P1 discovered, P5 builds on. This is the primary mechanism by which a project improves without human re-briefing.

**Pattern for maximum value:**
- Every phase should include: `- [ ] Append learnings to Knowledge.md`
- Use the `knowledge-keeper` directive on post-execution phases to maintain Knowledge.md as a structured wiki
- The knowledge-keeper detects contradictions, cross-references topics, and maintains an index

### 14.2 The experimenter loop

The `experimenter` profile implements a four-phase LEARN → DESIGN → EXPERIMENT → ANALYZE cycle.

**Core insight:** Every trial must be recorded in full (hypothesis, config, raw result, analysis) so future agents never re-discover known territory. Negative results matter as much as positive ones.

**Two persistent artifacts:**

**Cognition Store** (`Project - Cognition Store.md`) — LLM-maintained structured knowledge base. Sections: What works / What doesn't work / Open hypotheses / Heuristics. Maintained by the `experimenter-analyzer` directive. Read by the `experimenter-researcher` to avoid re-testing known territory.

**Experiment Log** (`Project - Experiment Log.md`) — append-only full trial history. Each entry records: hypothesis, expected, actual, delta, configuration, raw output, anomalies, transferable lesson. Never edited — only appended.

**Cycle:**
```
P1: Bootstrap     → measure baseline, seed Cognition Store with open hypotheses
P2: LEARN         → researcher reads Cognition Store + Experiment Log, ranks candidates
P3: DESIGN        → researcher picks best candidate, writes precise experiment spec
P4: EXPERIMENT    → engineer executes spec exactly, records Trial T[n] to Experiment Log
P5: ANALYZE       → analyzer explains delta, extracts lesson, updates Cognition Store
P6: LEARN (cycle 2) → researcher reads updated Cognition Store, selects next candidate
...
```

**Cold-start elimination:** The Cognition Store means cycle 5's researcher starts with everything cycles 1–4 discovered. Learning compounds across cycles, not just within a cycle.

### 14.3 Cross-project knowledge

`08 - System/Cross-Project Knowledge.md` captures findings that apply across all projects. The consolidator's dedup LLM call populates this automatically. Update it directly when you discover something general — architecture patterns, API behaviors, model capabilities, workflow improvements.

---

## 15. Phase Scheduling & Control

### 15.1 Phase selection

`discoverReadyPhases()` returns phases sorted by:

```typescript
// 1. priority (0–10, default 5). Higher runs first.
const pa = Number(a.frontmatter['priority'] ?? 5);
// 2. risk (high first) as tiebreaker
const riskOrder = { high: 0, medium: 1, low: 2 };
// 3. phase_number ascending (natural order)
```

**Operator control knobs (no code changes required):**

| Frontmatter field | Effect |
|---|---|
| `priority: 9` | Run before default-priority phases |
| `priority: 1` | Only run when nothing more urgent is ready |
| `risk: high` | Tiebreaker: runs before medium/low risk |
| `depends_on: [P2, P3]` | Won't run until P2 and P3 are completed |
| `complexity: heavy` | Routes to Opus model |
| `complexity: light` | Routes to Haiku model |

### 15.2 Dependency resolution

`dependenciesMet()` handles: numeric `1`, string `"1"`, and `"P1"/"P2"` shorthand — all equivalent.

A phase with `depends_on: [P1, P2]` won't appear in the ready queue until both P1 and P2 are `state: completed`. If a dependency phase is missing entirely, the dependent phase is blocked (conservative: better to block than to skip a missing dependency).

### 15.3 Lock management

Lock fields in phase frontmatter:

```yaml
locked_by:       "claude-code"
locked_at:       "2026-04-16T10:05:00.000Z"
lock_pid:        12345
lock_hostname:   "macbook.local"
lock_ttl_ms:     300000
```

**Lock TTL:** 5 minutes default. If the agent process dies, the `staleLocks` healer detects the stale lock on the next `onyx run` and resets the phase to `phase-ready`.

**Manual unlock:** `onyx reset "Project"` or `onyx heal`.

### 15.4 `onyx explain` — system transparency

`onyx explain [project]` is a pure vault read (no LLM) that produces plain English output:
- Profile + required fields
- Active phase + directive currently injected + acceptance criteria
- Queued phases with priority and auto-wired directive
- Blocked phases with resolution hint
- Knowledge.md summary + Cognition Store / Experiment Log state

Run `onyx explain` before `onyx run` to confirm state is what you expect. This is the primary debugging tool.

---

## 16. CLI Reference

All commands as of v4.0 (2026-04-16):

### Execution
```bash
onyx run                             # autonomous loop — all phase-ready phases
onyx run --project "My Project"      # scope to one project
onyx run --once                      # single iteration then exit (safe for cron)
onyx run --phase 2                   # run a specific phase number (implies --once)
onyx run --dry-run                   # preview what would happen without running
onyx next                            # find highest-priority ready phase and run it
```

### Observability
```bash
onyx status                          # all projects + phase states
onyx status --json                   # machine-readable snapshot
onyx explain                         # plain English: what every project is doing
onyx explain "My Project"            # one project, detailed view
onyx logs "My Project"               # execution log
onyx logs "My Project" --recent      # most recent entries
onyx logs --audit                    # full audit trail
onyx doctor                          # pre-flight: config, vault, API keys, claude CLI
```

### Planning
```bash
onyx init "My Project"               # create bundle (prompts for profile, repo path)
onyx init "My Project" --profile engineering  # skip profile picker
onyx plan "My Project"               # decompose Overview → phase stubs → atomise to tasks
onyx plan "My Project" 2             # atomise one specific phase only
onyx plan "My Project" --extend      # add new phases to an existing project
onyx decompose "My Project"          # Overview → phase stubs only (no atomising)
onyx atomise "My Project"            # atomise all backlog phase stubs to tasks
onyx atomise "My Project" 1          # atomise a specific phase only
```

### Phase state management
```bash
onyx ready "My Project"              # auto-pick next backlog phase → set ready
onyx ready "My Project" 3            # set phase 3 specifically to ready
onyx block "My Project" "reason"     # block active phase with a reason
onyx reset "My Project"              # unblock → ready (after fixing the blocker)
onyx set-state <path/to/phase.md> ready  # force state transition (for scripts)
```

### Vault objects
```bash
onyx new phase "My Project" "Name"   # create a new phase file
onyx new directive <name>            # scaffold system directive stub
onyx new directive <name> --project "My Project"  # project-local directive
onyx new profile <name>              # scaffold new profile
```

### Maintenance & recovery
```bash
onyx heal                            # fix stale locks, frontmatter drift, graph links
onyx check "My Project"              # validate vault state (fields, deps, directives)
onyx consolidate "My Project"        # manually trigger Knowledge consolidation
onyx refresh-context "My Project"    # re-scan repo, update Repo Context doc
```

### Capture & daily planning
```bash
onyx capture "note text"             # append to Inbox.md for later triage
onyx daily-plan                      # generate today's time-blocked daily plan
```

### Integrations
```bash
onyx dashboard                       # web dashboard on localhost:7070
onyx import <linearProjectId>        # import Linear project as vault bundle
onyx linear-uplink "My Project"      # sync vault phases to Linear issues
```

---

## 17. Adding to ONYX

### Adding a new CLI command

1. Create `src/cli/my-command.ts` — export an async `run(args, config)` function
2. Register in `src/cli/onyx.ts` with `program.command('my-command').action(...)`
3. Build: `npm run build`

### Adding a new healer

1. Create `src/healer/myHealer.ts` — export `runMyHealer(config): HealAction[]`
2. Add to `src/healer/index.ts` `runAllHeals()` — call it and merge results
3. Add the new action type to the `HealAction` union if needed

### Adding a new profile

```bash
onyx new profile <name>
```

This scaffolds `08 - System/Profiles/<name>.md` with the required frontmatter structure. Fill in:
- `required_fields` — what Overview must contain
- Acceptance gate description
- Domain-specific phase conventions

### Adding a new directive

```bash
onyx new directive <name>                          # system-level
onyx new directive <name> --project "My Project"   # project-local
```

Fill in: role definition, what to read first, behavioral constraints, output format.

### Debugging a run

```bash
# See what would happen without running
onyx run --dry-run

# Check system health
onyx doctor

# Understand project state in plain English
onyx explain "My Project"

# See execution log
onyx logs "My Project" --recent

# Fix stale state
onyx heal
```

---

## 18. Invariants & Pitfalls

| Invariant | Correct pattern |
|---|---|
| All vault reads → reader module | Use `readPhaseNode()`, `readBundle()`, `readRawFile()` |
| All vault writes → writer module | Use `setPhaseTag()`, `appendToLog()`, `writeFile()` |
| Phase state changes → through FSM | Use `setPhaseTag()` — never write `state:` directly to frontmatter |
| Managed block content → `managedBlocks.ts` | Use `readManagedBlock()`, `writeManagedBlock()` |
| Config → `loadConfig()` | Never read `onyx.config.json` directly |
| Agent tasks are checkboxes | Agent ticks `- [ ]` → `- [x]`. Do not use other formats for task state. |
| Vault is the only state | Do not cache phase state in memory across loop iterations |

| Pitfall | Why it's wrong |
|---|---|
| Writing vault files with `fs.writeFileSync` directly | Bypasses atomic write guarantees, can corrupt frontmatter |
| Injecting file content into prompts | Bloats context. Use `--add-dir` and let the agent read natively. |
| Implementing task discovery locally | Import from `src/executor/selectTask.ts` — single implementation |
| Hard-coding model names | Read from `config.modelTiers` |
| Transitioning FSM state without `setPhaseTag()` | State and tags can diverge; healer will flag it as drift |
| Running `onyx run` without first running `onyx doctor` | Config errors surface late and cryptically |
| Skipping `onyx explain` before debugging | The healer may have already fixed the issue; explain shows current state |

---

*ONYX Architecture Directive v4.0 — Updated 2026-04-16*
*Maintained in: `08 - System/Agent Directives/ONYX Architecture Directive.md`*
