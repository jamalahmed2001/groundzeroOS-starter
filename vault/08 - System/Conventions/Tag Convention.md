---
title: Tag Convention
tags:
  - obsidian
  - system
  - convention
  - tags
type: convention
version: 0.2
created: 2026-04-24
updated: 2026-04-27T10:52:05Z
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

## 1. The eight tag families

Tags split into eight families by concern. They are **always** listed in frontmatter in this order (most specific / hottest first, most stable / widest last):

| # | Family | Prefix | Examples | Purpose |
|---|---|---|---|---|
| 1 | **Phase state** | `phase-` | `phase-ready`, `phase-active`, `phase-blocked`, `phase-completed`, `phase-backlog`, `phase-planning`, `phase-archived` | Mechanical state of a work unit. Changes often. One per phase note. |
| 2 | **Note kind (structural)** | `onyx-`, `project-` | `onyx-phase`, `onyx-operative`, `onyx-project`, `project-overview`, `project-knowledge`, `project-log`, `project-kanban`, `project-docs`, `directive`, `pipeline-artefact`, `context-only` | What kind of note this is — structural classification. One per note. |
| 3 | **Lifecycle status** | `status-` | `status-active`, `status-draft`, `status-archived`, `status-paused` | Project / hub lifecycle. Coarser than phase state. Applied at project or hub level, not phases. |
| 4 | **Hub tier** | `hub-` | `hub-root`, `hub-domain`, `hub-subdomain`, `hub-project`, `hub-phase-group`, `hub-log-group`, `hub-logs`, `hub-docs`, `hub-subsection` | Tier in the navigation hierarchy. One per hub note. |
| 5 | **Pipeline** | *(no prefix — name only)* | `my-podcast`, `my-album`, `suno-library`, `my-show`, `hitpapers`, `gzos` | Which ONYX pipeline the note belongs to. Zero or one per note. |
| 6 | **Venture / domain** | *(no prefix)* | `fanvue`, `openclaw`, `personal`, `finance`, `legal` | Top-level business domain. Zero or one per note. |
| 7 | **Craft / tool** | *(no prefix)* | `elevenlabs`, `ffmpeg`, `remotion`, `audio`, `video`, `cli`, `dashboard`, `obsidian` | Tools or crafts referenced. Zero to many. |
| 8 | **Media content type** | `onyx-` | `onyx-show`, `onyx-episode`, `onyx-track`, `onyx-album`, `onyx-asset` | Content-bundle classification for media pipelines (cartoon shows, podcast episodes, music tracks). One per content node; mutually exclusive with family 2 kinds (a track is `onyx-track`, not `onyx-phase`). |

**Ordering rule:** tags appear in frontmatter in the order above. The agent writes them in this order; the healer normalises (enforced by [[08 - System/Agent Skills/_onyx-runtime/heal-frontmatter-drift/heal-frontmatter-drift.md|heal-frontmatter-drift]] Rule 7).

### 1.1 Canonical kind tags (the colour-coded set)

These are the **structural** tags every reader should recognise instantly. One per note; the healer auto-classifies based on file location when missing (see [[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]]).

| Kind tag | Family | Applies to | Derivation rule |
|---|---|---|---|
| `hub-domain` | 4 | top-level domain hubs (<workplace> Hub, Ventures Hub, OpenClaw Hub, Life Hub) | folder is `0X - <Domain>/`, file is `<Domain> Hub.md` |
| `hub-subdomain` | 4 | sub-domain hubs (<workplace> Core, <workplace> Experiments, Automated Distribution Pipelines) | nested hub one level under a domain |
| `hub-project` | 4 | per-bundle hubs (Phases Hub, Directives Hub, Agent Log Hub, etc.) | filename matches `<project_id> - <Folder> Hub.md` |
| `onyx-project` | 2 | bundle Overview file | filename matches `<project_id> - Overview.md` at bundle root |
| `onyx-phase` | 2 | regular project phases | in `Phases/`, filename starts with `P\d+` |
| `onyx-operative` | 2 | operative-directive phases (reusable production stages) | in `Phases/`, filename matches `<project_id> - O\d+(\.\d+)? - <name>.md` OR contains `operative` in frontmatter `type:` |
| `directive` | 2 | agent directive | in `Directives/`, OR frontmatter `type: directive` |
| `project-log` | 2 | execution log | in `Logs/`, filename matches `L\d+ - <name>.md` |
| `project-knowledge` | 2 | knowledge base | filename matches `<project_id> - Knowledge.md` |
| `project-kanban` | 2 | kanban board | filename matches `<project_id> - Kanban.md` |
| `pipeline-artefact` | 2 | pipeline output (frequently read, rarely edited) | frontmatter `type: artefact` OR in `Outputs/`, `Artefacts/`, or matching show-bundle subfolders |
| `context-only` | 2 | reference material, not active graph | manual; healer skips these |
| `onyx-show` | 8 | show-level overview / bible | in `Shows/<show>/` or matching show-bundle root, filename ends `Overview.md` or `Bible.md` |
| `onyx-episode` | 8 | individual episode | in `Episodes/<show>/`, filename starts with `E\d+` |
| `onyx-track` | 8 | individual music track | in `Albums/<album>/`, filename matches `<album> - T\d+.*` |
| `onyx-album` | 8 | album overview | in `Albums/<album>/`, filename matches `<album> - Overview.md` |
| `onyx-asset` | 8 | non-markdown asset reference (.md sidecar for images/audio/video) | manual; honoured by healer |

---

## 2. Colour assignment

Assign colours by family so the eye picks up the state/kind/owner instantly. Hex codes chosen to be distinct under both light and dark Obsidian themes. Copy the CSS snippet in §5 into your vault's snippets folder.

| Family | Colour | Hex | Rationale |
|---|---|---|---|
| Phase state | **Green family** (gradient by state) | `#16a34a` ready, `#2563eb` active, `#f59e0b` blocked, `#6b7280` completed, `#94a3b8` backlog, `#a855f7` planning, `#475569` archived | Phase state is the most important signal. Gradient so the eye reads it left-to-right on a list. |
| Note kind (structural) | **Blue family** | `#3b82f6` phase, `#6366f1` operative, `#8b5cf6` directive, `#0ea5e9` project/overview, `#06b6d4` log, `#14b8a6` knowledge, `#5eead4` artefact, `#a8a29e` context-only | Structural — what the file *is*. Sub-shades distinguish phases vs operatives vs directives at a glance. |
| Lifecycle status | **Amber** | `#d97706` | Caution colour — tells you if content is live, drafted, or retired. |
| Hub tier | **Purple family** | `#9333ea` project, `#7e22ce` subdomain, `#581c87` domain, `#6b21a8` root | Navigation chrome. Darker purple = wider scope. |
| Pipeline | **Teal** | `#0d9488` | Pipeline identity; differentiates my-podcast from suno from cartoon at a glance. |
| Venture / domain | **Slate** | `#334155` | Ownership signal — which business this belongs to. |
| Craft / tool | **Stone** (neutral) | `#78716c` | Least hot signal; intentionally muted so it doesn't compete with state/kind. |
| Media content type | **Pink/rose family** | `#ec4899` show, `#f43f5e` episode, `#fb7185` track, `#fda4af` album, `#fecdd3` asset | Distinct family for media bundles — pink stays out of the structural blue and the navigation purple, so a show node is instantly distinguishable from a phase or hub. |

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
  - my-album                # family 5: pipeline
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
  - my-album                # family 5: pipeline
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
  - my-album                # family 5: pipeline
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

/* Family 2 — Note kind (blue family, sub-shaded) */
.tag[href="#onyx-phase"]       { background: #3b82f6; color: #fff; } /* phase = primary blue */
.tag[href="#onyx-operative"]   { background: #6366f1; color: #fff; } /* operative = indigo */
.tag[href="#directive"]        { background: #8b5cf6; color: #fff; } /* directive = violet */
.tag[href="#onyx-project"],
.tag[href="#project-overview"] { background: #0ea5e9; color: #fff; } /* project = sky */
.tag[href="#project-log"]      { background: #06b6d4; color: #fff; } /* log = cyan */
.tag[href="#project-knowledge"]{ background: #14b8a6; color: #fff; } /* knowledge = teal-blue */
.tag[href="#project-kanban"],
.tag[href="#project-docs"],
.tag[href="#project-doc"]      { background: #38bdf8; color: #fff; } /* kanban/docs = sky-light */
.tag[href="#pipeline-artefact"]{ background: #5eead4; color: #000; } /* artefact = teal-light */
.tag[href="#context-only"]     { background: #a8a29e; color: #fff; } /* context-only = muted stone */

/* Family 3 — Lifecycle status (amber) */
.tag[href="#status-active"],
.tag[href="#status-draft"],
.tag[href="#status-archived"],
.tag[href="#status-paused"]    { background: #d97706; color: #fff; }

/* Family 4 — Hub tier (purple family — darker = wider scope) */
.tag[href="#hub-root"]         { background: #6b21a8; color: #fff; } /* root = darkest */
.tag[href="#hub-domain"]       { background: #581c87; color: #fff; } /* domain = dark */
.tag[href="#hub-subdomain"]    { background: #7e22ce; color: #fff; } /* subdomain = mid */
.tag[href="#hub-project"],
.tag[href="#hub-phase-group"],
.tag[href="#hub-log-group"],
.tag[href="#hub-logs"],
.tag[href="#hub-docs"],
.tag[href="#hub-subsection"]   { background: #9333ea; color: #fff; } /* project hubs = standard purple */

/* Family 5 — Pipeline (teal) */
.tag[href="#my-podcast"],
.tag[href="#my-podcast-run"],
.tag[href="#my-podcast-weekly"],
.tag[href="#my-album"],
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

/* Family 8 — Media content type (pink/rose family) */
.tag[href="#onyx-show"]        { background: #ec4899; color: #fff; } /* show = pink */
.tag[href="#onyx-episode"]     { background: #f43f5e; color: #fff; } /* episode = rose */
.tag[href="#onyx-track"]       { background: #fb7185; color: #fff; } /* track = rose-light */
.tag[href="#onyx-album"]       { background: #fda4af; color: #000; } /* album = rose-pale */
.tag[href="#onyx-asset"]       { background: #fecdd3; color: #000; } /* asset = rose-faintest */
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
| Domains | `tag:#hub-domain OR tag:#hub-root` | `#581c87` |
| Hubs | `tag:#hub-project OR tag:#hub-subdomain` | `#9333ea` |
| Projects | `tag:#onyx-project OR tag:#project-overview` | `#0ea5e9` |
| Phases | `tag:#onyx-phase` | `#3b82f6` |
| Operatives | `tag:#onyx-operative` | `#6366f1` |
| Directives | `tag:#directive` | `#8b5cf6` |
| Logs | `tag:#project-log` | `#06b6d4` |
| Knowledge | `tag:#project-knowledge OR tag:#project-kanban` | `#14b8a6` |
| Artefacts | `tag:#pipeline-artefact` | `#5eead4` |
| Shows | `tag:#onyx-show` | `#ec4899` |
| Episodes | `tag:#onyx-episode` | `#f43f5e` |
| Tracks/Albums | `tag:#onyx-track OR tag:#onyx-album` | `#fb7185` |
| Pipelines | `tag:#my-podcast OR tag:#my-album OR tag:#my-show OR tag:#hitpapers` | `#0d9488` |
| Ventures | `tag:#fanvue OR tag:#openclaw OR tag:#personal` | `#334155` |
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

- **Every note has exactly one structural-kind tag** — drawn from family 2 (`onyx-phase`, `onyx-operative`, `onyx-project`, `directive`, `project-log`, `project-knowledge`, `project-kanban`, `pipeline-artefact`, `context-only`) OR family 8 (`onyx-show`, `onyx-episode`, `onyx-track`, `onyx-album`, `onyx-asset`). Mutually exclusive: a track is `onyx-track`, not `onyx-phase`.
- Phase notes have exactly one family-1 tag, matching their `status:` frontmatter.
- Hub notes have exactly one family-4 tag.
- Tags appear in frontmatter in family order (1→8).
- No tag appears in two families (i.e. `my-album` is only a pipeline tag, never a venture tag).
- `context-only` and `pipeline-artefact` are mutually exclusive.
- `context-only` overrides every other family tag for healer purposes — the file is graph-invisible.
- Colour hex codes in the CSS snippet match the hexes listed in §2 exactly — changes happen in both places in lockstep.

## 9. Healer responsibilities

[[08 - System/Agent Skills/_onyx-runtime/heal-frontmatter-drift/heal-frontmatter-drift.md|heal-frontmatter-drift]]:
- Rule 7 (NEW): every note has exactly one family-2 OR family-8 structural-kind tag. Missing → invoke [[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]] for derivation.
- Rule 8 (NEW): tag-order normalisation — frontmatter `tags:` are written in family order 1→8.

[[08 - System/Agent Skills/_onyx-runtime/heal-kind-tag/heal-kind-tag.md|heal-kind-tag]] (NEW):
- Classifies files by location + name pattern (per §1.1).
- Inserts the canonical kind tag.
- Detect-only when location is ambiguous (multiple matches, or no rule applies).
