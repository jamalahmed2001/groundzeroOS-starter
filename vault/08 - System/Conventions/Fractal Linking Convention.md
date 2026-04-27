---
title: Fractal Linking Convention
tags:
  - system
  - convention
  - graph
  - linking
  - onyx
type: convention
version: 0.1
created: 2026-04-24
updated: 2026-04-24
graph_domain: system
up: Conventions Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Conventions/Conventions Hub.md|Conventions Hub]]
**Related:** [[08 - System/Conventions/Tag Convention.md|Tag Convention]] · [[08 - System/ONYX Master Directive.md|Master Directive §19]] · [[08 - System/Operations/heal.md|heal operation]]

# Fractal Linking Convention

> **The rule.** Every note has exactly one parent. The graph is a tree, not a hairball. Folder structure mirrors graph structure — if folder `A/` contains `B/`, then the node corresponding to `B`'s root links up to the node corresponding to `A`'s root, and no further.
>
> **Why this matters.** When every note links to every other "related" note, the graph view collapses into noise and navigation becomes guesswork. A strict parent-only-up rule makes the tree walkable, renders clearly in Obsidian's graph, and gives the healer / graph-maintainer unambiguous rules for detecting drift.

---

## 1. The pattern

Every project (and every domain) follows this recursive shape:

```
<Project> - Overview        ← root of a subtree
├── <Project> - Phases Hub       ← hub node
│   ├── P01 / O1 / …                 ← leaf (phase)
│   ├── P02 / O2
│   └── ...
├── <Project> - Directives Hub   ← hub node
│   ├── directive-one
│   ├── directive-two
│   └── ...
├── <Project> - Agent Log Hub    ← hub node
│   ├── L01 - <phase-title>          ← leaf (log)
│   └── ...
├── <Project> - Docs Hub         ← hub node (if Docs/ folder has >2 children)
│   ├── Brand Bible
│   ├── Tooling Stack
│   └── ...
├── <Project> - <Collection> Hub ← project-specific (e.g. Episodes Hub, Albums Hub)
│   └── <collection-item>            ← leaf (sometimes a subtree root)
├── <Project> - Knowledge            ← leaf (no hub — single file)
└── <Project> - Kanban               ← leaf
```

**Three node kinds:**
- **Root** — the `Overview.md` of a project or domain. Links UP to its parent domain (e.g. `Automated Distribution Pipelines Hub`).
- **Hub** — a navigation-only note whose body is mostly a ToC of its children. Links UP to its Overview. Down-links listed in body.
- **Leaf** — a phase, directive, log, knowledge, kanban, or reference doc. Links UP to its direct parent hub (NOT to Overview).

---

## 2. The rules

### 2.1 Every note has exactly one `up:`

Every note carries an `up:` frontmatter field naming its direct parent. The parent is:
- For a **leaf**: its parent hub.
- For a **hub**: its project's Overview.
- For a **project Overview**: the domain Overview or domain Hub it belongs to.
- For a **domain Hub**: the top-level domain hub (or nothing, if root).

### 2.2 Leaves do not link to their grandparent

A phase leaf does **not** have `up: <Project> - Overview`. It has `up: <Project> - Phases Hub`. The grandparent is reachable transitively via the hub.

Body nav blocks on leaves reduce to a single line:
```markdown
## 🔗 Navigation

**UP:** [[<parent hub>|<hub short name>]]
```

No other links in the nav block. Sideways references (a directive a phase uses, a show bible an episode extends) belong in body prose, not in the nav block.

### 2.3 Hubs list their children, nothing else

A hub's nav block is **UP-only** — a single link to its parent Overview. No sideways links (not to Knowledge, not to Kanban, not to the Episodes Hub, not to other sibling hubs). Navigation from a hub sideways must flow through the parent Overview, not directly.

**The hub has three responsibilities, in order:**
1. Link UP to its parent Overview (one link, in the nav block).
2. List every child in the body (usually as a table or bullet list).
3. Nothing else related to navigation. Body prose beyond the child list is fine (explanatory text, subsection context, etc.) but must not introduce structural cross-links.

A hub is the **only** node that names its children. Children never list themselves back; they only know their hub via their own `up:` field.

```markdown
## 🔗 Navigation

**UP:** [[<Project> - Overview|<Project>]]

# <Project> — <Collection> Hub

## Children

| # | Child | <column> |
|---|---|---|
| 1 | [[<child-1>]] | … |
| 2 | [[<child-2>]] | … |
```

### 2.4 Overview nav lists hubs, not leaves

The project Overview's nav block lists only its **direct hub children** (plus the single-file leaves like Knowledge/Kanban/Decisions). It does **not** list individual phases, directives, or logs — those reach through their hub.

```markdown
## 🔗 Navigation

**UP:** [[<Domain Hub>|<Domain>]]

**Children (fractal):**
- [[<Project> - Phases Hub|Phases Hub]]
- [[<Project> - Directives Hub|Directives Hub]]
- [[<Project> - Agent Log Hub|Agent Log Hub]]
- [[<Project> - Knowledge|Knowledge]]
- [[<Project> - Kanban|Kanban]]
```

### 2.5 Cross-domain and sideways links are discouraged

If a phase in project A needs context from project B, reference B **in body prose** with a wikilink, not in the nav block. Nav blocks are for structural parent traversal only; body prose is for content references.

Exception: a per-phase "craft reference" to the directive governing that phase MAY appear in body prose near the phase's Acceptance Criteria — but not in the nav block.

### 2.6 Folder structure mirrors graph structure

If a folder `A/` exists under `Project/` and contains markdown files, either:
- `A/` has exactly one "hub-looking" file (e.g. `Project - A Hub.md`) that is the parent of every file under `A/`; OR
- `A/` has no hub file, and the files inside `A/` are leaves whose hub is the project's Overview (acceptable only for folders with ≤ 2 files).

The healer reports any folder with > 2 markdown files but no obvious hub as a `structural_drift` detection.

### 2.7 Per-collection roots (episodes, albums) nest recursively

When a leaf is actually the root of its own subtree (an episode with show bible + per-part files, an album with per-track files), the fractal rule applies recursively:

```
<Project> - Albums Hub
└── <Album> - Overview           ← root of album subtree, up: Albums Hub
    ├── <Album> - T01 - <title>  ← leaf, up: <Album> - Overview
    ├── <Album> - T02 - <title>
    └── cover/                   ← asset folder, no markdown
```

The album Overview's `up:` is the Albums Hub. The track's `up:` is the album Overview. Neither links directly to the project Overview.

### 2.8 Context-only notes are graph-invisible

Notes carrying the `context-only` tag (see [[Tag Convention]] §4.1) are reference material, not graph nodes. The healer skips them when verifying fractal compliance. Their `up:` field is optional; their nav blocks, if present, are free-form.

---

## 3. The 5-check fractal audit

Mechanised by [[08 - System/Agent Skills/_onyx-runtime/heal-fractal-links/SKILL.md|heal-fractal-links]]. For every note in the vault (excluding archives, trash, templates, context-only):

1. **`up:` present** — the note has a non-empty `up:` frontmatter field.
2. **`up:` target exists** — the file named by `up:` exists in the vault.
3. **`up:` points at the correct parent** — matches the folder-structure expectation in §1.
4. **Body nav has no redundant cross-link to grandparent** — a leaf's nav block doesn't link to its grandparent (the Overview when the parent is a hub).
5. **Hub-node children coverage** — if a hub-node exists for a folder, its body lists every markdown child in that folder (modulo sub-hubs).

Failures are either **auto-fixed** (rules 1–4) or **flagged for human review** (rule 5 — omissions may be intentional).

---

## 4. Examples

### 4.1 Compliant phase file
```yaml
---
project: Clutr
project_id: Clutr
phase_number: 3
phase_name: Redis cache adapter
status: ready
up: Clutr - Phases Hub    # ← parent is the hub, not Overview
---
```
Body nav:
```markdown
## 🔗 Navigation

**UP:** [[Clutr - Phases Hub|Phases Hub]]
```

### 4.2 Non-compliant (double-linked)
```yaml
up: Clutr - Overview      # ← WRONG: phase's parent should be the hub
```
Body nav:
```markdown
## 🔗 Navigation

- [[Clutr - Overview|Clutr]]
- [[Clutr - Phases Hub|Phases Hub]]
- [[Clutr - Knowledge|Knowledge]]
```
Violations: rule 3 (`up:` wrong), rule 4 (nav links to grandparent + sideways to sibling).

### 4.3 Compliant hub file
```yaml
---
title: Clutr - Phases Hub
type: hub
up: Clutr - Overview
---
```
Body:
```markdown
## 🔗 Navigation

**UP:** [[Clutr - Overview|Clutr]]

# Clutr — Phases Hub

## Children
| # | Phase | Status |
|---|---|---|
| 1 | [[Clutr - P01 - Bootstrap]] | backlog |
| 2 | [[Clutr - P02 - Data layer]] | ready |
```

---

## 5. Migration notes

When this convention is introduced to an existing project that doesn't follow it:

1. For every folder with > 2 markdown children and no hub, **create a hub** named `<Project> - <Folder> Hub.md`. Example: if `Phases/` has 10 phase files, create `<Project> - Phases Hub.md` at the project root (or inside `Phases/`).
2. Set every child's `up:` to the new hub. Strip any other `up:` value.
3. Rewrite every child's nav block to the UP-only pattern.
4. List every child in the new hub's body.
5. Ensure the project Overview's nav block lists the new hub.

After migration, run `heal-fractal-links` to verify zero violations. See [[08 - System/Operations/_agent-native-validation.md|heal probe]] for fixture-testing the skill.

---

## 6. Relationship to other conventions

- [[Tag Convention]] defines tag families; one of them is `hub-*` (family 4). Every hub node in this convention carries a family-4 tag. Children carry their note-kind tag (family 2).
- [[Minimal Code Max Utility]] argues for minimal structure. Fractal linking is the minimum structure that makes a vault navigable at scale — not extra — the smallest set of rules that prevents the graph from collapsing.
- [[08 - System/ONYX Master Directive.md|Master Directive §19]] is the authoritative source for vault organisation; this convention drills into the linking sub-rule.
