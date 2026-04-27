---
title: Operations Hub
tags:
  - hub
  - hub-subdomain
  - system
  - operations
  - onyx
type: hub
version: 0.1
created: 2026-04-24
updated: 2026-04-27T10:52:05Z
graph_domain: system
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**Related:** [[08 - System/ONYX Master Directive.md|ONYX Master Directive]] · [[08 - System/ONYX - Decomposition Plan.md|Decomposition Plan]] · [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# Operations Hub

> **What lives here.** One markdown file per runtime operation. Each file is the complete contract + procedure for that operation — read it end-to-end before executing. Together, these are the "middle layer" between the [[08 - System/ONYX Master Directive.md|Master Directive]] (the loop) and the [[08 - System/Agent Skills/Agent Skills Hub.md|runtime skills]] (the atomic how-tos).
>
> **When you're the runtime.** Master Directive §5 routes each phase to one operation based on `status:`. Open the linked file, follow it exactly, return to the loop.

---

## The eight operations

| Status → | Operation | Directive | Replaces (src/) | Lines in TS | Stage | Status |
|---|---|---|---|---|---|---|
| `backlog` | atomise | [[08 - System/Operations/atomise.md]] | `src/planner/atomiser.ts` | 498 | 4 | **draft** (atomise-phase + repo-scan) |
| `planning` | *(wait, no-op)* | — | — | — | — | in Master Directive §6.2 |
| `ready` / `active` | execute | [[08 - System/Operations/execute-phase.md]] | `src/executor/runPhase.ts` + `selectTask.ts` | 833 | 5 | **draft** (task loop + selection inlined; lock-lifecycle shared skill) |
| `blocked` | surface_blocker | [[08 - System/Operations/surface-blocker.md]] | `src/notify/*` (partial) | ~50 | 3 | **draft** (inline-only, no skills) |
| `completed` / parent shipped / bundle marked complete | consolidate *(unified — phase, bundle, children all one operation)* | [[08 - System/Operations/consolidate.md]] | `src/planner/consolidator.ts` | 238 | 4 | **active v1.0** (agent reads children, picks shape) |
| *(whole project)* | decompose-project | [[08 - System/Operations/decompose-project.md]] | `src/planner/phasePlanner.ts` | 785 | 6 | **draft** (phase-decompose shared with replan) |
| *(blocked → re-atomise)* | replan | [[08 - System/Operations/replan.md]] | `src/planner/replan.ts` | 226 | 6 | **draft** (inline-only, no new skills) |
| *(every iteration, step 1)* | heal | [[08 - System/Operations/heal.md]] | `src/healer/*.ts` | 882 | 3 | **draft** (9 heal-* skills incl. heal-cross-link) |
| *(every iteration, step 5)* | route | [[08 - System/Operations/route.md]] | `src/controller/router.ts` | 38 | 2 | **draft** (inline-only, no skills) |
| *(operator: bring Linear project in)* | linear-import | [[08 - System/Operations/linear-import.md]] | `src/linear/import.ts` + `src/linear/merge.ts` + `src/cli/import-linear.ts` | 410 | 7 | **draft** (uses `linear` skill — bash + curl + jq) |
| *(operator: push vault phases out)* | linear-uplink | [[08 - System/Operations/linear-uplink.md]] | `src/linear/uplink.ts` + `src/cli/linear-uplink.ts` | 309 | 7 | **draft** (uses `linear` skill) |
| *(after a phase completes — engineering)* | phase-review | [[08 - System/Operations/phase-review.md]] | `src/skills/phaseReview.ts` | 91 | 7 | **draft** (agent reads git diff, writes review — no separate LLM call) |
| *(operator: explain project state)* | explain | [[08 - System/Operations/explain.md]] | `src/cli/explain.ts` | 209 | 7 | **draft** (pure read, no LLM) |
| *(operator: pre-execution scout)* | research | [[08 - System/Operations/research.md]] | `src/cli/research.ts` | 162 | 7 | **draft** (agent scouts repo + writes Research note) |
| *(operator: rescan repo)* | refresh-context | [[08 - System/Operations/refresh-context.md]] | `src/cli/refresh-context.ts` | 108 | 7 | **draft** (managed-block update of Repo Context.md) |
| *(operator: what's next)* | next | [[08 - System/Operations/next.md]] | `src/cli/next.ts` | 169 | 7 | **draft** (sort ready phases, dispatch to execute-phase) |
| *(operator: roll up daily plans)* | monthly-consolidate | [[08 - System/Operations/monthly-consolidate.md]] | `src/cli/monthly-consolidate.ts` | 307 | 7 | **draft** (agent reads month of dailies, writes overview, optional prune) |
| *(operator: pre-flight)* | doctor | [[08 - System/Operations/doctor.md]] | `src/cli/doctor.ts` | 271 | 7 | **draft** (env + config + vault + agent binary + key validity checks) |
| *(operator: atomic phase commands)* | phase-ops | [[08 - System/Operations/phase-ops.md]] | `src/cli/phase-ops.ts` | 354 | 7 | **draft** (4 verbs: ready / block / new-phase / check) |
| *(operator: daily plan)* | plan | [[08 - System/Operations/plan.md]] | `src/cli/plan.ts` | 97 | 7 | **draft** (uses plan-my-day skill, injects ready phases) |
| *(operator: reset blocked phase)* | reset | [[08 - System/Operations/reset.md]] | `src/cli/reset.ts` | 50 | 7 | **draft** (frontmatter-only writes, clear locks, reset replan_count) |
| *(operator: capture inbox item)* | capture | [[08 - System/Operations/capture.md]] | `src/cli/capture.ts` | 30 | 7 | **draft** (one-line append to Inbox.md) |
| *(operator: print phase log)* | logs | [[08 - System/Operations/logs.md]] | `src/cli/logs.ts` | 62 | 7 | **draft** (read-only log viewer, supports `--recent`) |
| *(operator: scaffold directive/profile)* | new | [[08 - System/Operations/new.md]] | `src/cli/new.ts` | 212 | 7 | **draft** (template writes, no LLM) |
| *(operator: bootstrap project)* | init | [[08 - System/Operations/init.md]] | `src/cli/init.ts` | 986 | 7 | **draft** (renders templates from `08 - System/Templates/`, scans repo via repo-scan skill) |

### Consolidate (one operation)

**[[consolidate]] v1.0** — collapsed 2026-04-27 from the previous tier/mode architecture into a single self-contained operation. Same principle every time: take a folder of children, produce one parent node containing everything important from them, archive the children. The agent reads what is there and picks the right shape (prose for narrative, tables for structured rows, mixed for both, verbatim `<details>` for full-fidelity preservation) — not "modes", just doing the job intuitively.

The retired sub-files [[consolidate-bundle]] and [[consolidate-children]] remain as redirects to keep existing wikilinks resolvable. The weekly scan routine invokes `consolidate` per candidate (no tier branching).

**Why the simplification.** The previous architecture had 3 operations × 3 modes × 3 sub-skills = 9 surfaces to keep in sync. The actual mental model is one principle: children → parent, info-dense, archived, with the agent picking shape based on content. One directive that the agent reads end-to-end beats nine that need to be cross-referenced.

---

## Support documents

- [[08 - System/Operations/_tools.md|Tool Catalog]] — the **one** irreducible shell tool operations invoke (`write-exec-log.sh`); everything else uses native agent primitives
- [[08 - System/Operations/_template.md|Operation Directive Template]] — the canonical shape every operation file follows
- [[08 - System/Operations/_agent-native-validation.md|Validation Log]] — probe-by-probe record of agent-native replacements for retired tools
- [[08 - System/Operations/_shadow.md|_shadow (meta-directive)]] — how operations graduate from `draft` → `active` (TS + directive parallel runs, classified diffs, 7-run GREEN streak)
- [[08 - System/Shadow Logs/Shadow Logs Hub.md|Shadow Logs Hub]] — append-only verdict ledger, one file per operation in shadow mode

---

## How operations relate

```
Master Directive
     │  (§5 Routing)
     ▼
┌────────────────────────────┐
│ heal  (step 1, always)     │
├────────────────────────────┤
│ route (step 5, dispatcher) │
│   ├─ atomise               │
│   ├─ execute               │
│   │    └─ consolidate      │  (on completion)
│   ├─ surface_blocker       │
│   └─ replan                │  (explicit)
└────────────────────────────┘
         │
         ▼
 Runtime Skills (_onyx-runtime/*)
         │
         ▼
 Tool scripts (tools/*.sh)
```

- **heal** runs every iteration before work starts.
- **route** maps phase status → operation.
- **execute** is the hot path; **consolidate** (phase-level) runs when execute transitions to `completed`.
- **consolidate-bundle** is the manual "this work is done, fold the bundle" move — content/engineering/research/personal/client/business — invoked once a bundle has shipped or been abandoned. Profile-agnostic; reacts to kind tags. Not in the routine loop.
- **consolidate-children** is the third tier of the consolidate family. Folds atomic per-unit children (shots/takes/beats/iterations) into a `## <Atoms>` table inside an existing shipped-parent node, then archives the children. The parent stays active; only its production scratch collapses. Wired into the weekly consolidate scan alongside consolidate-bundle.
- **atomise** / **decompose-project** / **replan** are planner operations.
- **surface_blocker** makes a blocked phase visible to a human.

---

## Contribution rules

1. Operations are only added or modified via a phase in `08 - System/` with profile `engineering`, reviewed by a human. (Master Directive invariant 9.)
2. Operations must not duplicate logic — if two operations need the same procedure, extract it into a skill under `08 - System/Agent Skills/_onyx-runtime/` and reference it.
3. Each operation's `replaces:` frontmatter points at its src/ source so migration status is auditable.
4. When an operation migrates from `stub` → `draft` → `shadow-mode` → `active`, its src/ source is deleted only after a shadow-mode week with zero behavioural diff.
5. Operations may only invoke: other operations, skills listed in their `Skills Invoked` section, and tools in [[08 - System/Operations/_tools.md|the tool catalog]]. Nothing else.
