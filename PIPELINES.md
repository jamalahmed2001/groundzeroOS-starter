# Pipeline Starters

ONYX ships ready-to-fork pipeline scaffolds for the work shapes most agentic-framework users want to run. Each starter is a complete project bundle — Phases + Directives + Templates references — copy it, rename it, swap in your specifics.

The starters share the same foundation:
- All run on the same nine-operation runtime (`heal → route → atomise → execute → consolidate → replan → decompose-project → surface-blocker → consolidate-bundle`)
- All read the same Master Directive and Conventions
- All draw directives from `08 - System/Agent Directives/` (universal roles) and templates from `08 - System/Templates/`
- All produce vault-resident artefacts with frontmatter as the source of truth

Differences between starters live entirely in:
1. Which **profile** the project uses (drives required fields + acceptance gate)
2. Which **directives** the phases reference (drives behaviour per phase)
3. Which **templates** the bundle pre-populates (drives folder shape)

---

## Starters

### My First Project

- **Profile:** `general`
- **Phases:** 1
- **Demonstrates:** the loop runs end-to-end. Smoke test for installation.
- **Status:** ✅ shipped (in `01 - Projects/`)

After `onyx run` writes `hello.txt` and the phase transitions to `completed`, you've verified the runtime works.

### Engineering — Greenfield Service

- **Profile:** `engineering`
- **Phases:** 10 (Discovery → Architecture → Schema → Skeleton → Core feature → Tests → Hardening → Deploy → Observability → First iteration)
- **Demonstrates:** language-agnostic build pipeline. Phase atomisation discipline. Per-phase QC gate. Profile-routed shell whitelist. The kind of work most agentic-framework users actually want to do.
- **Status:** ✅ shipped (`01 - Projects/Engineering — Greenfield Service/`)

### Research — Investigation

- **Profile:** `research`
- **Phases:** 5 (Scope → Gather → Synthesise → Write → Review)
- **Demonstrates:** how the same engine handles non-creative knowledge work. Source verification. Evidence hierarchy. The lightest starter — good for a first-non-trivial-pipeline run.
- **Status:** ✅ shipped (`01 - Projects/Research — Investigation/`)

### Video — Animated Short

- **Profile:** `video-production`
- **Phases:** 9 (Premise → Script → Scenes → Visual package → Render → Audio → Export → Launch → Engagement)
- **Demonstrates:** audio-first pipeline; character continuity stack; last-frame seeding; per-shot model routing; brand-via-locked-sigil. The most directive-dense starter (~17 specialist directives loaded).
- **Status:** ✅ shipped (`01 - Projects/Video — Animated Short/`)

### Music — Album Release

- **Profile:** `audio-production`
- **Phases:** 11 (Concept + Tracklist → Lyrics → Generate + Curate → Master Audio → Visual Package → Metadata + SEO → Rollout + Pre-save → Playlist Pitching → Launch Day Ops → Post-Release Engagement → Analytics)
- **Demonstrates:** per-track style variation; single-workspace-per-brand; LUFS targets; distributor-wizard discipline (never auto-submit paid actions); pre-save campaign timing.
- **Status:** ✅ shipped (`01 - Projects/Music — Album Release/`)

### Podcast — Spoken Audio Show

- **Profile:** `audio-production`
- **Phases:** 7 (Plan → Research → Script → Audio → Render → Publish → Engage)
- **Demonstrates:** avatar diversity across episodes; verifiable-contact-details-only; pronunciation dictionary discipline; locale-first source priority; dated-citation discipline.
- **Status:** ✅ shipped (`01 - Projects/Podcast — Spoken Audio Show/`)

---

## Choosing a starter

| If your work is… | Start with |
|---|---|
| Software engineering on a real codebase | Engineering — Greenfield Service |
| A research / analysis report | Research — Investigation |
| A weekly newsletter, blog, or video essay | Engineering or Video, depending on output medium |
| A serial show — animated, fiction, or hybrid | Video — Animated Short |
| Music production, EPs / albums / singles | Music — Album Release |
| A podcast or spoken-audio show | Podcast — Spoken Audio Show |
| Something else | Start from `My First Project` and grow your own |

You can run multiple starters side-by-side. They don't conflict — each is a self-contained project bundle in `01 - Projects/`.

---

## Forking a starter

1. Copy the entire starter folder under `01 - Projects/`. Rename it to your real project name.
2. Open the project's Overview, fill in the placeholders.
3. If the starter has a Show Bible / Album Overview / Pronunciation Dictionary, fill those in next — those are the foundational documents the per-phase directives read first.
4. Set `status: backlog` on phase 1, `status: blocked` (with `blocked_by:` chain) on the rest.
5. Tell Claude: `"Plan My Project"` to atomise phase 1, then `"Execute next"` to begin.

The heal step runs automatically before every execution and normalises any frontmatter drift — you don't need to get every field right by hand.

---

## When a starter doesn't fit

If you can't see your work shape in the list, look at the closest two and either:

- Pick the closer one and override directives per-phase as you go (the cheap path), or
- Build your own pipeline from `08 - System/Agent Directives/` + `08 - System/Templates/` (the long path)

If a new work shape recurs across multiple projects you've built, propose adding it as a starter via PR — the framework grows by accreting starter shapes that have proven themselves twice.
