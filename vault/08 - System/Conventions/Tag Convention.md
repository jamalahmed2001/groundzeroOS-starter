---
title: Tag Convention
tags:
  - system
  - convention
  - tags
  - obsidian
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
**Related:** [[08 - System/System Hub.md|System Hub]] · [[08 - System/ONYX Master Directive.md|ONYX Master Directive]]

# Tag Convention

> **Purpose.** Define the tag families, ordering, and Obsidian color assignments so tags work as a visual information layer — not just metadata. A reader should be able to see a note's tags and instantly know: what kind of note it is, what state it's in, who owns it, which pipeline it belongs to.
>
> **Scope.** Every note in the vault has frontmatter `tags:`. This document defines which tags are allowed, in what order, and what Obsidian colour each family gets.

---

## 1. The seven tag families

Tags split into seven families by concern. They are **always** listed in frontmatter in this order (most specific / hottest first, most stable / widest last):

| # | Family | Prefix | Examples | Purpose |
|---|---|---|---|---|
| 1 | **Phase state** | `phase-` | `phase-ready`, `phase-active`, `phase-blocked`, `phase-completed`, `phase-backlog`, `phase-planning`, `phase-archived` | Mechanical state of a work unit. Changes often. One per phase note. |
| 2 | **Note kind** | `onyx-`, `project-` | `onyx-phase`, `onyx-project`, `project-overview`, `project-knowledge`, `project-log`, `project-kanban`, `project-docs`, `directive` | What kind of note this is. One per note. |
| 3 | **Lifecycle status** | `status-` | `status-active`, `status-draft`, `status-archived`, `status-paused` | Project / hub lifecycle. Coarser than phase state. Applied at project or hub level, not phases. |
| 4 | **Hub tier** | `hub-` | `hub-root`, `hub-domain`, `hub-subdomain`, `hub-project`, `hub-phase-group`, `hub-log-group`, `hub-logs`, `hub-docs`, `hub-subsection` | Tier in the navigation hierarchy. One per hub note. |
| 5 | **Pipeline** | *(no prefix — name only)* | `maniplus`, `suno-albums`, `suno-library`, `cartoon`, `hitpapers`, `gzos` | Which ONYX pipeline the note belongs to. Zero or one per note. |
| 6 | **Venture / domain** | *(no prefix)* | `fanvue`, `openclaw`, `personal`, `finance`, `legal` | Top-level business domain. Zero or one per note. |
| 7 | **Craft / tool** | *(no prefix)* | `elevenlabs`, `ffmpeg`, `remotion`, `audio`, `video`, `cli`, `dashboard`, `obsidian` | Tools or crafts referenced. Zero to many. |

**Ordering rule:** tags appear in frontmatter in the order above. The agent writes them in this order; the healer normalises (TODO: add to heal.md as a sub-rule).

---

## 2. Colour assignment

Assign colours by family so the eye picks up the state/kind/owner instantly. Hex codes chosen to be distinct under both light and dark Obsidian themes. Copy the CSS snippet in §5 into your vault's snippets folder.

| Family | Colour | Hex | Rationale |
|---|---|---|---|
| Phase state | **Green family** (gradient by state) | `#16a34a` ready, `#2563eb` active, `#f59e0b` blocked, `#6b7280` completed, `#94a3b8` backlog, `#a855f7` planning, `#475569` archived | Phase state is the most important signal. Gradient so the eye reads it left-to-right on a list. |
| Note kind | **Blue** | `#3b82f6` | Structural — what the file *is*. |
| Lifecycle status | **Amber** | `#d97706` | Caution colour — tells you if content is live, drafted, or retired. |
| Hub tier | **Purple** | `#9333ea` | Navigation chrome. Appears on hubs only; colour signals "this is a landing page." |
| Pipeline | **Teal** | `#0d9488` | Pipeline identity; differentiates maniplus from suno from cartoon at a glance. |
| Venture / domain | **Slate** | `#334155` | Ownership signal — which business this belongs to. |
| Craft / tool | **Stone** (neutral) | `#78716c` | Least hot signal; intentionally muted so it doesn't compete with state/kind. |

Within the **phase state gradient**, the ordering (left-to-right in a pipeline) is:
```
backlog (slate) → planning (purple) → ready (green) → active (blue) → blocked (amber) → completed (grey) → archived (dim-slate)
```

---

## 3. Frontmatter examples

### 3.1 A phase note
```yaml
---
tags:
  - phase-ready                # family 1: state
  - onyx-phase                 # family 2: kind
  - suno-albums                # family 5: pipeline
  - openclaw                   # family 6: venture
---
```

### 3.2 A project Overview note
```yaml
---
tags:
  - onyx-project               # family 2: kind
  - project-overview           # family 2: kind (sub)
  - status-active              # family 3: lifecycle
  - suno-albums                # family 5: pipeline
  - openclaw                   # family 6: venture
---
```

### 3.3 A hub note
```yaml
---
tags:
  - hub-subdomain              # family 4: tier
  - status-active              # family 3: lifecycle
---
```

### 3.4 A log note
```yaml
---
tags:
  - project-log                # family 2: kind
  - suno-albums                # family 5: pipeline
---
```

### 3.5 A context/archive note (e.g. legacy Suno track)
```yaml
---
tags:
  - context-only               # family 2: kind (new — see §4)
  - suno-library               # family 5: pipeline
---
```

---

## 4. New tags to introduce

Two new tags should be added to fix specific current pain:

### 4.1 `context-only`
**Family:** Note kind (family 2).
**Purpose:** marks a note as reference material, NOT part of the active graph. The healer, graph-maintainer, and orphan-attach skills MUST skip files carrying this tag. Use for legacy content (e.g. `Suno Library/Tracks/*.md`) and archival reference.
**Colour:** **Stone-light** `#a8a29e` — muted, signals "read-only" visually.

### 4.2 `pipeline-artefact`
**Family:** Note kind (family 2).
**Purpose:** output of a pipeline run (a log, a generation, a rendered video). Read frequently but rarely edited by humans.
**Colour:** **Teal-light** `#5eead4`.

Both should be added to [[08 - System/ONYX - Artifact Reference.md|Artifact Reference]] after this convention is ratified.

---

## 5. Obsidian CSS snippet

Save this as `<vault>/.obsidian/snippets/tag-colours.css` and enable under Settings → Appearance → CSS snippets.

```css
/* ONYX tag colour convention — see 08 - System/Conventions/Tag Convention.md */

/* Family 1 — Phase state (gradient) */
.tag[href="#phase-backlog"]    { background: #94a3b8; color: #fff; }
.tag[href="#phase-planning"]   { background: #a855f7; color: #fff; }
.tag[href="#phase-ready"]      { background: #16a34a; color: #fff; }
.tag[href="#phase-active"]     { background: #2563eb; color: #fff; }
.tag[href="#phase-blocked"]    { background: #f59e0b; color: #fff; }
.tag[href="#phase-completed"]  { background: #6b7280; color: #fff; }
.tag[href="#phase-archived"]   { background: #475569; color: #fff; }

/* Family 2 — Note kind (blue) */
.tag[href="#onyx-phase"],
.tag[href="#onyx-project"],
.tag[href="#project-overview"],
.tag[href="#project-knowledge"],
.tag[href="#project-log"],
.tag[href="#project-kanban"],
.tag[href="#project-docs"],
.tag[href="#project-doc"],
.tag[href="#directive"]        { background: #3b82f6; color: #fff; }

/* Family 2 — context-only (muted stone) */
.tag[href="#context-only"]     { background: #a8a29e; color: #fff; }
.tag[href="#pipeline-artefact"]{ background: #5eead4; color: #000; }

/* Family 3 — Lifecycle status (amber) */
.tag[href="#status-active"],
.tag[href="#status-draft"],
.tag[href="#status-archived"],
.tag[href="#status-paused"]    { background: #d97706; color: #fff; }

/* Family 4 — Hub tier (purple) */
.tag[href="#hub-root"],
.tag[href="#hub-domain"],
.tag[href="#hub-subdomain"],
.tag[href="#hub-subsection"],
.tag[href="#hub-project"],
.tag[href="#hub-phase-group"],
.tag[href="#hub-log-group"],
.tag[href="#hub-logs"],
.tag[href="#hub-docs"]         { background: #9333ea; color: #fff; }

/* Family 5 — Pipeline (teal) */
.tag[href="#maniplus"],
.tag[href="#maniplus-run"],
.tag[href="#maniplus-weekly"],
.tag[href="#suno-albums"],
.tag[href="#suno-library"],
.tag[href="#suno-run"],
.tag[href="#suno-track"],
.tag[href="#suno-workspace"],
.tag[href="#cartoon"],
.tag[href="#cartoon-run"],
.tag[href="#hitpapers"],
.tag[href="#gzos"],
.tag[href="#gz-project"],
.tag[href="#gz-phase"]         { background: #0d9488; color: #fff; }

/* Family 6 — Venture (slate) */
.tag[href="#fanvue"],
.tag[href="#openclaw"],
.tag[href="#personal"],
.tag[href="#finance"],
.tag[href="#legal"]            { background: #334155; color: #fff; }

/* Family 7 — Craft / tool (stone) */
.tag[href="#elevenlabs"],
.tag[href="#elevenlabs-tts"],
.tag[href="#ffmpeg"],
.tag[href="#remotion"],
.tag[href="#audio"],
.tag[href="#audio-master"],
.tag[href="#video"],
.tag[href="#cli"],
.tag[href="#dashboard"],
.tag[href="#obsidian"]         { background: #78716c; color: #fff; }
```

To apply:
1. Save the snippet file at `<vault>/.obsidian/snippets/tag-colours.css`.
2. Reload Obsidian (or Settings → Appearance → CSS snippets → toggle off/on).
3. Enable the snippet.

---

## 6. Graph view colour groups

Obsidian's graph view supports **colour groups** via Settings → Files and links. Configure groups matching this convention:

| Group name | Query | Colour |
|---|---|---|
| Phase: ready | `tag:#phase-ready` | `#16a34a` |
| Phase: active | `tag:#phase-active` | `#2563eb` |
| Phase: blocked | `tag:#phase-blocked` | `#f59e0b` |
| Phase: completed | `tag:#phase-completed` | `#6b7280` |
| Hubs | `tag:#hub-domain OR tag:#hub-subdomain OR tag:#hub-root` | `#9333ea` |
| Projects | `tag:#onyx-project OR tag:#project-overview` | `#3b82f6` |
| Pipelines | `tag:#maniplus OR tag:#suno-albums OR tag:#cartoon` | `#0d9488` |
| Context-only (dim) | `tag:#context-only` | `#a8a29e` (opacity 40%) |

Context-only nodes appear dimmed so the graph reads as "active work" vs "archival reference" at a glance.

---

## 7. Migration path

To roll this convention onto the existing vault:

1. **Ratify this file.** Human review; adjust families or colours before applying.
2. **Introduce `context-only` tag.** Add to [[08 - System/ONYX - Artifact Reference.md|Artifact Reference]].
3. **Apply `context-only` to legacy Suno Library tracks** (19 files under `Suno Library/Tracks/`). Precondition for the healer / graph-maintainer skip rule.
4. **Add a `heal-tag-order` skill** (new, under `_onyx-runtime/`) that normalises frontmatter `tags:` to the family ordering from §1. Include it as Step 8 in [[08 - System/Operations/heal.md|heal]].
5. **Install the CSS snippet** (§5) in the vault's `.obsidian/snippets/` folder.
6. **Configure graph groups** (§6) via Obsidian UI.
7. **Spot-check a selection of notes** for tag compliance; sweep anomalies in a follow-up phase.

---

## 8. Invariants

- Every note has at least one family-2 (note kind) tag.
- Phase notes have exactly one family-1 tag, matching their `status:` frontmatter.
- Hub notes have exactly one family-4 tag.
- Tags appear in frontmatter in family order (1→7).
- No tag appears in two families (i.e. `suno-albums` is only a pipeline tag, never a venture tag).
- `context-only` and `pipeline-artefact` are mutually exclusive.
- Colour hex codes in the CSS snippet match the hexes listed in §2 and §4 exactly — changes happen in both places in lockstep.
