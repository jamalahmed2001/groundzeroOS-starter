---
tags:
  - system
  - status-active
graph_domain: system
created: 2026-03-09T00:00:00.000Z
updated: 2026-03-24T00:00:00.000Z
status: active
priority: high
version: ONYX-1.1-Contextual
up: OpenClaw Projects Hub
---
## 🔗 Navigation

# Vault Architect Directive – Ground Zero

> Overarching principles and structure for the **OnyxVault** graph.
>
> Design goals:
> - Strict, layered hierarchy (no spaghetti)
> - Single clear parent for every node
> - Clean separation of life vs work, domains vs projects, hubs vs work
> - Easy for agents to navigate and maintain safely

---

## 0. Contextual placement — nothing is fixed

**No path, folder name, or domain label in this directive is universal law.** Placement is always resolved from **task**, **project**, **intent**, and **configuration** (e.g. `vault_root`, `projects_root`, area maps, `Orchestrator.json` when used — see Observer Directive KISS §3.1.1).

| Layer | What stays stable | What is contextual |
| :--- | :--- | :--- |
| **Invariants** | Hierarchy shape, bundle contents, nav patterns, linking rules (§1–4) | — |
| **Paths** | — | Every vault-relative path: hub locations, `bundle_path`, planning folders, archive layout |

**Concrete paths below** (e.g. `03 - Ventures/`, `00 - Dashboard/`) are **examples from this vault’s current layout** or **templates** — swap in whatever your resolved graph uses. Agents must **resolve** where a note belongs before writing; they must not copy literal segments from this doc by default.

This directive is anchored to one on-disk vault for illustration:

```text
/home/jamal/clawd/openclaw/vaults/OnyxVault
```

---

## 1. Core Principles

### 1.1 Strict Hierarchy & Single Parent

Every note has **exactly one structural parent hub**:

```text
Task / Phase → Project → Domain / Area Hub → Work Hub or Life Hub → Central Dashboard
```

Rules:
- No note should link "UP" to more than one hub.
- A deeper node only "knows" its **immediate parent hub(s)**, never grandparents.
- Cross‑domain visibility is provided via hubs and dashboards, not arbitrary links.

### 1.2 Hubs vs Work Nodes

There are three conceptual layers:

1. **Dashboards / Hubs** – navigation & summaries only
2. **Project Hubs** – scope, goals, links to work surfaces
3. **Work Nodes** – Kanban, Knowledge, Phases, logs, resources

**Hubs are maps; work nodes are terrain.**

- Dashboards/hubs must not contain raw task lists or detailed execution.
- Execution happens in phases, daily plans, kanban boards, and knowledge/log notes.

### 1.3 Domain Isolation

Work and life are split into **isolated domain clusters**. **Which** domains exist and what they are called follow your vault’s hub graph and intent — not a fixed enum. Examples in this vault include employment, client work, internal platform, personal ventures, and planning; yours may differ.

Projects only link **up** into their own domain hub, never directly into other domains.
Cross‑project links must be intentional and documented in a dedicated knowledge or hub note.

### 1.4 Busy Hub Decomposition

Any hub that becomes too "busy" must be decomposed into sub‑hubs:

- When a hub has **too many direct children** or mixes concerns, introduce sub‑hubs.
- The parent hub then links **only** to those sub‑hubs; projects and work nodes move under the appropriate sub‑hub.
- Example (illustrative hub names):
  - `Work Hub` → several domain sub‑hubs; if one hub becomes crowded, split again into narrower sub‑hubs.

This keeps the graph structured as a **tree of hubs → sub‑hubs → projects → work**, instead of large, flat hubs with many mixed children.

---

## 2. Top-Level Hub Hierarchy

Hub **file paths** are contextual: resolve the dashboard, work hub, domain hubs, and planning hubs from your vault’s tree + task. Patterns below use placeholders; **example paths** match this repo’s current layout (§0).

### 2.1 Central Dashboard

The root of the life/work graph:

```text
<Dashboard>/<Central Dashboard>.md
```

*Example (this vault):* `00 - Dashboard/Central Dashboard.md`

- Single entry point into the system.
- Links down to Life Hub, Work Hub, and other life domain hubs as needed.

### 2.2 Work Tree

```text
Central Dashboard
  → Work Hub
    → <Domain Hub A>
    → <Domain Hub B>
    → …
```

#### Work Hub

*Example path:* `00 - Dashboard/Work Hub.md`

- **UP:** Central Dashboard.
- **DOWN:** **only** to work sub‑hubs (paths resolved per domain — not hardcoded).
- Must **not** link directly to project Overviews, Kanbans, or Knowledge nodes.

#### Domain/Area Hubs

Each domain hub:

- **UP:** Work Hub (or appropriate parent).
- **DOWN:** **only** project Overviews for that domain.

*Examples in this vault (illustrative):* hubs under `03 - Ventures/...` and `00 - Dashboard/Projects Hub.md` for personal ventures — **reuse the pattern**, not necessarily these folders.

**Hub rule:**
- Domain/area hubs only connect to **project Overviews** in their domain.
- They must not link directly to project Kanban/Knowledge/Phase notes.

### 2.3 Life & Planning Tree

```text
Central Dashboard
  → Life Hub
    → Daily Plans Hub
    → Monthly Overviews Hub
```

- **Life Hub** — *example:* `00 - Dashboard/Life Hub.md`: **UP** Central Dashboard; **DOWN** life sub‑hubs and links to planning hubs.
- **Daily Plans Hub** — *example:* `04 - Planning/Daily Plans Hub.md`: parent of daily planning notes for that layout.
- **Monthly Overviews Hub** — *example:* `04 - Planning/Monthly Overviews Hub.md`: anchor for monthly review notes.

Planning folder names may differ; keep the **chain** (dashboard → life → planning → note), not the literal `04 - Planning` string unless that is your resolved path.

---

## 3. Project Bundles

All work projects live under a **resolved bundle path** `<bundle_path>/` — typically `<projects_area>/<Domain?>/<Project>/` where `projects_area` and domain come from **intent, project metadata, and config** (§0), not a single hardcoded folder.

*Example (this vault):* many projects sit under `03 - Ventures/...`; another vault might use `02 - Clients/` or multiple roots.

### 3.1 Bundle Layout (per project)

Each project bundle has this **shape** (paths are relative to `<bundle_path>/`):

```text
<bundle_path>/
  <Project> - Overview.md
  <Project> - Kanban.md
  <Project> - Knowledge.md
  <Project> - Docs Hub.md   # required once Docs/ grows beyond a few files
  Phases/
    Phase N - <Name>.md
  Docs/
    <Topic> - <Short Title>.md
```

All project‑specific work must live **inside** its bundle directory.

**Docs folder semantics (graph shape):**
- `Docs/` is the home for **supporting design/decision/spec documents** for that project (e.g. "Design System Audit", "Event Queue Model", "Polling Inventory").
- Each project SHOULD start with a simple Docs section inside Knowledge; once `Docs/` grows beyond a few files, a dedicated **Docs Hub** note (e.g. `Almani Docs Hub.md`) becomes **required** and MUST:
  - Live at the root of the project bundle (alongside Overview/Kanban/Knowledge).
  - List and organise all docs from `Docs/`.
  - Link **up** to the project Overview and Knowledge.
- Docs themselves are **owned by the project Docs Hub and Knowledge node**, not by Phases directly.
- To keep the graph visually clean (see Almani example):
  - Docs should link "UP" only to the **Docs Hub** and project Knowledge node, not to phases, domain hubs, other projects, **or to other docs**.
  - Within a project, docs do not form their own mesh of cross-links; all structural linking happens via the Docs Hub and Knowledge node.
  - Phases may reference docs **indirectly** via the Knowledge node or Docs Hub ("Related Docs" / "Used in this Phase" sections), but must not treat docs as structural parents; phase nav blocks should never point "UP" to individual docs as parents.

### 3.2 Overview Navigation & Single Parent

Each project Overview has **one** parent hub, chosen from **domain + intent** — link to the correct domain hub for *this* project, not a path copied from examples.

*Illustrative mapping (this vault):* employment → Fanvue hub; client → Paid hub; internal OpenClaw → OpenClaw hub; personal ventures → Personal/Projects hub — **resolve actual paths** from the live graph.

**Standard Overview nav block:**

```markdown

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

## §7 Dynamic Domain System

Domain folders follow the convention `NN-Label` where `NN` is a zero-padded number and `Label` is a human-readable name (e.g. `03 - Ventures`, `10 - OpenClaw`). The numbering is cosmetic — it controls sort order in the file system. The label is authoritative for domain identification.

### Auto-Discovery

`navNormaliser.ts` discovers domains dynamically at runtime by scanning the vault root for folders matching the `NN - Label` pattern. There is no hardcoded domain registry. Adding a new folder (e.g. `11 - Research/`) automatically makes it a valid domain in the next maintenance run.

### Hub File Convention

Every domain folder requires a hub file at its root named `[Label] Hub.md`:

```
03 - Ventures/
  Ventures Hub.md        ← domain hub
  ProjectA/
    ProjectA - Overview.md
```

Sub-domain hubs follow the same pattern:

```
10 - OpenClaw/
  OpenClaw Hub.md        ← domain hub
  Core Platform/
    Core Platform Hub.md ← sub-domain hub
    ProjectX/
      ProjectX - Overview.md
```

Hub naming rule: the hub file name is always `[Label] Hub.md` where `Label` matches the folder name (without the numeric prefix). The `navNormaliser` uses this convention to wire parent-child hub relationships.

### Adding a New Domain

1. Create the folder: `NN - Label/` under the vault root
2. Create `Label Hub.md` inside it with appropriate frontmatter
3. Link the new hub into its parent (Work Hub or Central Dashboard)
4. Run `vaultMaintenance.ts --apply-force` to wire nav throughout

---

## §8 Self-Healing Maintenance

`vaultMaintenance.ts` is the single command that fixes the vault. It is the reconciliation layer between the ideal structure defined in this directive and the real state of files on disk.

```bash
npx tsx src/onyx/vault/vaultMaintenance.ts --apply-force
```

### What It Fixes

| Issue | Repair action |
|-------|--------------|
| Missing or stale `up:` frontmatter | Inferred from hub hierarchy, rewritten |
| Broken `
| Stale `bundle_path` in Orchestrator.json | Located by project name scan, path corrected |
| Stale phase `file` paths in Orchestrator.json | Located by basename within bundle, path corrected |
| Missing `graph_domain` frontmatter | Inferred from containing domain folder, written |
| Incorrect or missing `tags` | Normalised against standard tag set |

### What It Reports (Does Not Auto-Fix)

- **Orphaned notes**: notes with no hub parent — surfaced for manual review
- **Dead wikilinks**: links pointing to non-existent files — reported with source location
- **Corrupt Orchestrator.json**: schema validation failures — reported with field-level detail

### When to Run

- After moving any file or folder in the vault
- After creating new hub files or domain folders
- After any agent run that created or modified bundle structure
- As a health check at the start of any maintenance session

Running maintenance is always safe — without `--apply-force` it is a dry run only.

---

## §9 Bundle Portability

Project bundles are self-contained units. Every file a project needs lives inside its bundle directory. This makes bundles freely movable.

### What "Self-Contained" Means

A bundle at `03 - Ventures/ProjectName/` contains:
- `ProjectName - Overview.md` — the only file other notes link to from outside the bundle
- All Kanban, Knowledge, Docs Hub, phase files — internal to the bundle
- `ProjectName - Orchestrator.json` — all paths are vault-relative, resolvable after a move

External notes link **only** to the Overview. They never link directly to Kanban, Knowledge, or phase files. This is the rule that makes portability possible — only one external link to update.

### Moving a Bundle

```bash
# 1. Move the folder
mv "03 - Ventures/ProjectName" "10 - OpenClaw/ProjectName"

# 2. Repair everything
npx tsx src/onyx/vault/vaultMaintenance.ts --apply-force
```

The maintenance run:
- Updates `Orchestrator.json bundle_path` to the new location
- Updates all phase `file` paths within the Orchestrator
- Rewires the Overview's `up:` link to the correct new parent hub
- Updates any hub files that linked to the old Overview path

No manual path hunting. Move the folder, run maintenance, done.

### Orchestrator.json Path Repair Logic

The repair uses basename lookup: given a stale path like `03 - Ventures/ProjectName/Phases/Phase 1 - Init.md`, the repairer searches the vault for any file named `Phase 1 - Init.md` within any directory named `ProjectName`. If found unambiguously, the path is updated. If multiple matches exist, the conflict is reported for manual resolution.

---

## §10 Vault-as-Code

The vault is not documentation of the system — it **is** the system's state. Vault files and execution state must remain in sync at all times.

### Principle: Dual Authorship

Two processes write to the vault:
- **Agents** — write phase outputs, update Kanban/Knowledge, modify Orchestrator.json during execution
- **Maintenance tooling** — normalises structure, repairs paths, enforces hierarchy rules

Neither process should undo the other's work. Agents write content; maintenance tools write structure. The separation is:

| Written by agents | Written by maintenance |
|-------------------|----------------------|
| Task content, outputs, decisions | Nav blocks, `up:` fields, `graph_domain` |
| Orchestrator phase statuses | Orchestrator path corrections |
| Kanban card states | Hub file registries |
| Knowledge note context | Frontmatter tag normalisation |

### graphBuilder.ts as Code-to-Vault

`graphBuilder.ts` translates an execution roadmap (the "code") into vault artefacts. It is the authoritative writer of initial bundle structure. After initial creation, agents take over as writers for content; maintenance takes over for structure.

```bash
npx tsx src/onyx/vault/graphBuilder.ts \
  --roadmap src/onyx/roadmaps/project-roadmap.md \
  --output "10 - OpenClaw/ProjectName/"
```

### Detecting Drift

`navNormaliser.ts` and `frontmatterNormaliser.ts` act as drift detectors. On each maintenance run they compare the live vault state against the expected structure (derived from hub discovery) and report or repair deviations.

If vault state and execution state diverge — e.g. a phase is marked `completed` in Orchestrator.json but the phase file still shows open tasks — the discrepancy is surfaced. Agents must not silently ignore such mismatches; they should resolve the conflict before continuing.

### Rule: Never Infer State from Memory

Agents must read Orchestrator.json and relevant vault notes at the start of every execution context. The vault is the source of truth. Memory and cached context may be stale. If it is not written in the vault, it is not part of the system state.
