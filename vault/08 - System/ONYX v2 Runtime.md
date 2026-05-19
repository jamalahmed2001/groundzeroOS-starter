---
type: runtime
graph_domain: system
up: "[[System Hub]]"
created: 2026-05-17
updated: 2026-05-17
---

## 🔗 Navigation
**UP:** [[System Hub]]

# ONYX v2 — Runtime Cheat-Sheet

> Read this once per session. Procedures only — this file stands alone. For cross-project wisdom + gotchas see `PRINCIPLES.md` (on demand).

---

## A. Cold start — 4 reads + git probes

1. **`<Project> - Overview.md`** — identity, verify defaults, roles, `requires:`
2. **`<Project> - Status.md`** — active phase, last action, pipeline queue
3. **The active phase file** in full — pay attention to `## Progress`, `touches:`, `verify:`
4. **The newest `logs/*.md`** — handoff via `## What's next`. If newest `outcome:` is `blocked` or `abandoned`, also read the prior log (real handoff is the last `outcome: progress` session).
5. **(If `repo_path:` set)** run `git status --porcelain` + `git log -5 --oneline` inside the repo. Catches "vault says X but disk says Y."
6. **(If active phase has `touches:`)** read those files (or their headers) — code grounding without grep.

**Stale-Progress rule (treat as cold-start on the phase, not a resume):**
- Time-stale: Progress `Updated:` > 24h old.
- Content-stale: any `touches:` file's mtime newer than Progress `Updated:`.

**Degraded paths (most common just after `new`):**
- No active phase → read first backlog phase as a *candidate*; ask operator before starting.
- No logs → skip read 4.
- No Status → rebuild from phase frontmatter (run `heal` mental procedure), then read.
- Empty bundle → help operator draft P01; don't pretend there's work to resume.
- Missing file that should exist → state the gap, offer to scaffold from `Templates/`, never invent.

---

## B. Phase hot loop (`execute <project> <phase>`)

**Every turn is a pause point.** Write `## Progress` and append to the session log after every meaningful action — not when you plan to stop. Rate limits, terminal closes, model swaps don't announce themselves.

```
acquire lock         write `lock: <agent>:<session-uuid>:<iso>` + `status: active` to phase
open session log     logs/<Project> - <iso> - <summary>.md, outcome: progress

for each unchecked task in `## Steps`:
    execute (Bash, Edit, Write, skill, sub-agent)
    on success →
        tick `- [x]`
        append bullet to log "## What I did"
        overwrite phase `## Progress` (Updated / Last step / Last command / Working hypothesis / Partial state)
        refresh `lock:` timestamp
        — session can die here; next agent resumes cleanly —
    on failure → retry 3× with backoff (1s, 2s, 4s)
    3 consecutive failures → BLOCKING (see D)
    every 5min while working → refresh lock

after all tasks ticked:
    run every `verify.step`
        shell strings exit 0
        skill: stages exit 0
        human: items ticked
    red → BLOCKING
    green →
        append 1–3 lines to `<Project> - Knowledge.md`
        close log: ended, outcome: done, "## What I learned", "## What's next: idle"
        write `status: done`, clear `lock:`
        rebuild `<Project> - Status.md`
```

Refresh lock every 5 min. Stale at 30 min — `heal` auto-frees.

---

## C. Pipeline loop (`run <project> <pipeline>`)

Pipelines define repeatable work. Each invocation appends a journal row — **no phase file per run.**

```
1. Read pipeline file. Validate frontmatter.
2. Read declared `inputs:`.
3. Open session log.
4. Execute stages in order (shell / skill / agent / human).
5. Run `verify.steps`. Red → write `outcome: failed` journal row, close log, abort.
6. Green → append `outcome: success` row with metrics + artifact path.
7. Check `gates.filter`. If matched:
      - hitl: false → invoke `promote_to` pipeline directly
      - hitl: true → write a Promotion Queue row, leave for human approval
8. Close log.
```

**No phase lock.** Two pipeline invocations run in parallel as long as their outputs don't share a write target (Strategy Generator → Candidate Strategies needs a per-pipeline output-ref lock; journal-only pipelines need none — append-safe).

**Stage kinds:**
| Kind | What runs it | When to use |
|---|---|---|
| `shell:` | Bash | Deterministic, well-defined I/O. |
| `skill:` | Named skill from `~/clawd/skills/` | Deterministic with structure (API calls, browsers, binaries). |
| `agent:` | Same LLM executor as `execute` | Reasoning: summarise, generate, post-mortem, score, classify. |
| `human:` | Person tick | HITL gates, paid actions, "looks right" review. |

`agent:` failures aren't auto-retried (non-determinism masquerading as recovery). Write the reason to the journal row, let the failure policy fire.

---

## D. Termination modes

| Mode | Action |
|---|---|
| **Clean** | tasks done, verify green, knowledge appended, log closed, lock released, `status: done` |
| **Pause** | `## Progress` written, log finalised (`outcome: progress`), lock released, `status: active` |
| **Blocked** | `## Human Requirements` written, log `outcome: blocked`, lock released, `status: blocked` |
| **Abandoned** | Lock TTL expires (30 min) → `heal` frees → next agent resumes from `## Progress` as a pause |

---

## E. The six verbs

| Verb | Purpose |
|---|---|
| `new <project> [--kind X] [--repo path]` | Scaffold a bundle from `Templates/` (kind-specific Overview, plus Phase / Status / Knowledge / Decisions / dirs). For engineering kinds, `--repo` creates the symlink during scaffolding. |
| `execute <project> [phase]` | Run phase hot loop (B). For **system-changing work**. |
| `run <project> <pipeline> [--input X] [--dry-run]` | Run pipeline loop (C). For **repeatable work**. |
| `heal` | Rebuild every `<Project> - Status.md` + `00 - Dashboard/Central Dashboard.md`; free stale phase locks (>30 min); fix broken `up:`; flag files past compaction thresholds; flag pipeline schedule drift. |
| `compact <project>[/<file>]` | Archive-then-rewrite an append-only file (Knowledge, journal digest, log digest). Move original to `_archive/<file>.<iso>.md` verbatim; rewrite for density; add `compacted_from:` pointer. **Human-triggered, never automatic.** |
| `consolidate` | Scan all `<Project> - Knowledge.md` for cross-project repetition; emit a diff proposal to `08 - System/Proposals/PRINCIPLES-diff-<iso>.md` for human review. Never writes to PRINCIPLES.md directly. |

---

## F. Frontmatter is the cheap index; bodies are the expensive read

Tools that rebuild Status / Dashboard scan only frontmatter across many files. Agents doing real work read bodies. Same files, different cost.

---

## G. Vault structure cheat-sheet

```
<Project>/
├── <Project> - Overview.md          ← anchor (up: parent domain hub)
├── <Project> - Status.md            ← derived (up: Overview)
├── <Project> - Knowledge.md         ← append-only (up: Overview)
├── <Project> - Decisions.md         ← append-only ADRs (up: Overview)
├── repo  →  <abs path>              ← symlink for engineering kinds
├── refs/                            ← long-lived references (≤3 → bundle root; ≥4 → this folder)
├── pipelines/                       ← always its own folder when project has any pipelines
├── episodes/                        ← per-instance content (Script, Keyframes) grouped by type
├── phases/<Project> - P<N> - <Title>.md
├── logs/<Project> - <iso> - <summary>.md
└── artifacts/                        ← binary outputs (mp4, mp3, png, json snapshots)
```

**Naming rule.** Every vault-tracked file in the bundle carries the project prefix: `<Project> - <Type>.md`. Project IDs are kebab-case, stable across renames.

**`08 - System/` layout** — read on demand only:
```
08 - System/
├── ONYX v2 Runtime.md     ← this file. Once per session.
├── PRINCIPLES.md          ← wisdom + gotchas. On demand.
├── Proposals/             ← `consolidate` diffs awaiting human review
├── Roles/                 ← cross-project agent role briefs
├── Agent Skills/          ← cross-project Skill Overviews (one per skill in ~/clawd/skills/)
└── Templates/             ← the 12 templates `new` scaffolds from
```

**Nav rules (the fractal tree):**
- Every file has exactly **one** `up:` in frontmatter.
- Inside a bundle: Overview points up at its parent domain hub; everything else (Status, Knowledge, Decisions, refs/*, pipelines/*, phases/*, logs/*) points up at the Overview.
- Hubs list children **down**, never up.
- Cross-branch relationships → frontmatter fields (`depends_on:`, `based_on:`, `supersedes:`, `role:`). **Never body wikilinks across branches.**
- Plain-text mentions in prose ("the Mani Plus voice profile") are fine; they don't count as wikilinks.

---

## H. Safety

- Never modify `08 - System/` outside `Proposals/` without a human-approved proposal.
- Money-touching pipelines default to human `approved_by:` in the Promotion Queue (Paper→Live, Stage→Distro). Filter rows whose `approved_by:` is an agent identity — safety is enforced, not asserted. **Override:** a project may switch a specific gate to agent approval only if (a) a Decisions ADR explicitly authorizes it, (b) a `refs/<Project> - Risk Budget.md` defines hard caps the agent must respect, and (c) the Promotion Queue records the budget the auto-promotion ran under. No project may auto-approve without all three.
- Never auto-submit paid actions. Leave wizards at review.
- Never claim a fresh lock that already exists (< 5 min old).
- Never transition `done → active` without explicit human edit.
- Never delete a phase file. Archive to `_archive/` with `<iso>` suffix.

---

*That's the runtime. Everything else is either reference (PRINCIPLES.md, full spec) or vault content (your project bundle).*
