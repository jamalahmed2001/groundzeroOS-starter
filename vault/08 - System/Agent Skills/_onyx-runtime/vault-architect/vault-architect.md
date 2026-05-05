# vault-architect

Maintains the Obsidian graph pattern for all project bundles. Three subsystems run automatically inside the controller loop (and via `onyx heal`):

1. **Graph Maintainer** — enforces fractal nav links, removes wrong links, auto-creates missing hub nodes
2. **Hub Splitter** — splits overpopulated sub-hubs into groups (Phase Groups, Log Groups, Doc Categories)
3. **Node Consolidator** — archives completed Phase Groups and merges similar docs into consolidated nodes

---

## The Graph Pattern (fractal/flower model)

Each project bundle forms a flower shape in Obsidian's graph view:

```
Dashboard  (root)
  └── My Projects Hub  (domain hub — one per area)
        └── PROJECT - Overview  ← main node (flower center)
              ├── PROJECT - Docs Hub       (branch → doc petals)
              │     └── PROJECT - Knowledge  (double petal — also links Overview)
              ├── PROJECT - Kanban         (branch → phase petals)
              │     └── P1 - Phase Name    (phase petal / bridge node)
              │           └── L1 - Phase   (log stamen)
              └── PROJECT - Agent Log Hub  (branch → log stamens)
                    └── L1 - Phase         (same log — two parents)
```

Multiple projects = multiple flowers. Domain Hub groups them. Dashboard is root only.

### Bridge nodes (phases)

Phase notes are **bridge nodes**: they sit between two clusters (Kanban and Agent Log Hub) by linking to both Kanban and their own Log note. This creates the characteristic petal+stamen shape.

### Double petal (Knowledge)

Knowledge links to **both** Overview and Docs Hub, creating a triangle edge. This makes Knowledge visually prominent — it is the accumulating memory of the project.

---

## Link Rules (STRICT)

| Node | Links TO | Notes |
|---|---|---|
| Dashboard | Domain Hubs only | Never links to Overviews or phases directly |
| Domain Hub | Dashboard | Back-link only |
| Overview | Docs Hub, Kanban, Agent Log Hub | Three outgoing edges — the flower branches |
| Docs Hub | Overview | Single back-link |
| Knowledge | Overview + Docs Hub | Double petal (two parents) |
| Kanban | Overview | Single back-link |
| Agent Log Hub | Overview | Single back-link |
| Phase (Pn) | Kanban + its Log | Bridge node — connects two clusters |
| Phase Group | Kanban | When Kanban is split into Phase Groups |
| Log (Ln) | Phase + Agent Log Hub | Stamen node — two parents |
| Log Group | Agent Log Hub | When Log Hub is split into Log Groups |

**No cross-links between siblings** (e.g. phases don't link to each other).
**Logs do not link to Overview or Kanban** — only phase + log hub.
**Phases do not link to Knowledge** — no noise.

The pattern reads: "everything knows its parent, parent knows its children, siblings don't know each other."

---

## Nav Section Rewrite Algorithm

`graphMaintainer.ts` **fully rewrites** the `## 🔗 Navigation` section for every file — it does not add to or partially edit it. This removes wrong links as well as adding missing ones.

```
For each file:
  1. Determine file type from tags/frontmatter/filename
  2. Compute canonical nav links for that type
  3. Replace entire ## 🔗 Navigation section
  4. Leave body content untouched
```

Canonical nav links by file type:

| File type | Canonical nav links |
|---|---|
| `domain-hub` | `[[Dashboard\|Dashboard]]` |
| `overview` | `[[PROJECT - Docs Hub\|Docs]]` · `[[PROJECT - Kanban\|Kanban]]` · `[[PROJECT - Agent Log Hub\|Agent Logs]]` |
| `docs-hub` | `[[PROJECT - Overview\|Overview]]` |
| `knowledge` | `[[PROJECT - Overview\|Overview]]` · `[[PROJECT - Docs Hub\|Docs Hub]]` |
| `kanban` | `[[PROJECT - Overview\|Overview]]` |
| `agent-log-hub` | `[[PROJECT - Overview\|Overview]]` |
| `phase` | `[[PROJECT - Kanban\|Kanban]]` · `[[Ln - Pn - Name\|Ln — Execution Log]]` |
| `phase-group` | `[[PROJECT - Kanban\|Kanban]]` |
| `log` | `[[Pn - Name\|Pn — Name]]` · `[[PROJECT - Agent Log Hub\|Agent Log Hub]]` |
| `log-group` | `[[PROJECT - Agent Log Hub\|Agent Log Hub]]` |

---

## Hub Splitting (prevents overcrowding)

Large projects automatically split overpopulated sub-hubs into smaller group nodes.

### Phase Groups (deterministic)

Triggered when Kanban lists **> 8 phases**.

```
Phases 1-8  → PROJECT - Phase Group 1 (P1–P8).md
Phases 9-16 → PROJECT - Phase Group 2 (P9–P16).md
```

Each Phase Group links: Kanban ← Phase Group ← individual phases (phases nav updated to point at group instead of Kanban).

### Log Groups (deterministic, mirrors Phase Groups)

Triggered when Agent Log Hub lists **> 12 logs**.

```
L1-L8   → PROJECT - Log Group 1 (L1–L8).md
L9-L16  → PROJECT - Log Group 2 (L9–L16).md
```

### Doc Categories (deterministic-first, LLM fallback)

Triggered when Docs Hub lists **> 8 docs**.

1. **Prefix detection**: groups docs by common title prefix (e.g. "API" vs "UX" vs "Architecture")
2. **LLM fallback**: if prefixes are ambiguous, LLM assigns category names
3. Creates: `PROJECT - Docs - CATEGORY.md` nodes under Docs Hub

---

## Node Consolidation

`nodeConsolidator.ts` runs after graph maintenance each loop cycle.

### Phase Group Archiving

When **all phases** in a Phase Group reach `phase-completed`:

1. Creates `PROJECT - Phase Group N - Archive.md` under the bundle root
2. Archive node links: Kanban
3. Archive body: inline summaries from each phase's Acceptance Criteria + Log sections
4. Originals tagged `phase-archived` (never deleted)
5. Idempotent: archive file presence prevents re-archiving

```
Archive nav: [[PROJECT - Kanban|Kanban]]
```

### Doc Consolidation

When docs within the same Doc Category have **> 60% title word similarity** (Jaccard similarity on words > 3 chars):

1. Pairs flagged as merge candidates (deterministic)
2. If > 2 pairs: LLM confirms which to merge
3. Creates: `PROJECT - Docs - CATEGORY - Consolidated.md`
4. Originals tagged `archived` (never deleted)
5. Consolidated node links: Docs Hub

```
Consolidated nav: [[PROJECT - Docs Hub|Docs Hub]]
```

---

## What Runs Each Loop Cycle

```
onyx run:
  1. runAllHeals()            — stale locks, frontmatter drift, tag normalisation
  2. maintainVaultGraph()     — nav rewrites, wrong link removal, hub splitting, auto-create missing hubs
  3. consolidateVaultNodes()  — phase group archiving, doc consolidation
  4. ... executor loop
```

```
onyx heal:
  Runs steps 1-3 only (no executor).
```

Output format:
```
[ONYX] heal_complete · graph: 3 link repairs, 2 wrong links removed
[ONYX] heal_complete · consolidate: 8 phases archived, 2 docs merged
```

---

## File Naming Convention (required for graph to resolve)

Obsidian resolves wikilinks by basename — folder path is irrelevant. Every file must have a unique basename.

```
<projects-root>/
  My Projects Hub.md                     ← domain hub
  PROJECT_NAME/
    PROJECT_NAME - Overview.md           ← main node (Overview)
    PROJECT_NAME - Docs Hub.md           ← doc aggregator
    PROJECT_NAME - Knowledge.md          ← double petal
    PROJECT_NAME - Kanban.md             ← phase aggregator
    PROJECT_NAME - Agent Log Hub.md      ← log aggregator
    PROJECT_NAME - Phase Group 1 (P1–P8).md   ← if > 8 phases
    PROJECT_NAME - Phase Group 1 - Archive.md ← if group completed
    PROJECT_NAME - Docs - API.md         ← if docs split by category
    Phases/
      P{N} - {Phase Name}.md
    Logs/
      L{N} - P{N} - {Phase Name}.md
```

Bundle folder name must match `project:` frontmatter field. Domain hub is auto-created by `onyx init`.

---

## Obsidian Settings Recommended

For best graph appearance:
- Graph view → Filters: enable "Existing files only"
- Graph view → Filters: hide `project-log` tagged notes to reveal hub shapes
- Graph view → Groups: colour `onyx-project` (Overview nodes) differently — they are the flower centers
- Graph view → Groups: colour `onyx-phase` nodes as petals
- Graph view → Display: node size by degree (Overview nodes become largest per project)
- Appearance → Link style: arrows on (the directed hierarchy is meaningful)
- Core plugins → Templates: point at `vault/08 - System/Agent Directives/Templates/`
