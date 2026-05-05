---
name: plan-my-day
description: Generate an energy-optimised, time-blocked daily plan from your ONYX vault. Reads active project phases, inbox captures, and personal commitments — writes a full day plan back to the vault.
---

# Plan My Day

Generate a realistic, hour-by-hour plan for today (or a given date). Reads from your vault only — no external sources.

**Core principle:** This is a plan for a whole day, not just a task list. Schedule work blocks, breaks, meals, and personal commitments in a structure you can actually follow.

---

## Configuration (read first)

Read the vault root from `ONYX_VAULT_ROOT` environment variable or from `onyx.config.json`:
```bash
node -e "const c=require('./onyx.config.json'); console.log(c.vault_root || process.env.ONYX_VAULT_ROOT)"
```

All vault paths below are relative to that root.

---

## Optional: direction override

Before building the plan, check for a direction file:
- **Path:** `{vault_root}/00 - Dashboard/.plan-direction.md`

If it exists and is non-empty:
1. Read it — contains a user-written focus note and optionally an energy level (`low / medium / high`)
2. Let it override the plan structure and task selection
3. After reading, delete it: `rm "{vault_root}/00 - Dashboard/.plan-direction.md"`
4. Include at the top of the plan: `> Direction: <brief summary>`

Energy guidance:
- **low**: lighter cognitive work, more admin, longer breaks. No deep 2h focus blocks.
- **high / sprint**: front-load hardest tasks, maximise deep-work blocks.
- **medium** (default): balanced structure.

---

## What to read from the vault

### 1. Inbox (always read first)
- `00 - Dashboard/Inbox.md`

Scan for unchecked `- [ ]` items. Route small ones into today's plan. Note larger items in "Inbox to Triage" at the bottom.

### 2. Planning surfaces
- `00 - Dashboard/Central Dashboard.md` (if exists)
- `04 - Planning/Planning Hub.md` (if exists)

### 3. Today's existing plan (for continuity)
- `09 - Archive/Daily Archive/Daily - YYYY-MM-DD.md`

If it exists: roll forward unchecked tasks. Do not overwrite — append a revision block.

### 4. Active project work
Read domain hub files to find what is active right now. Common locations:
- `01 - Projects/` — all active projects
- Any domain folder with a `*Hub.md` file

For each active project, pull:
- `<Project> - Overview.md`
- `<Project> - Kanban.md`
- Active phase notes (`Phases/` folder, `phase-ready` or `phase-active` tagged)

**Task selection:** Prioritise unchecked items under `## Tasks`. Ignore Acceptance Criteria checkboxes. Cap at 3–5 tasks per work block.

### 5. Personal context (if present)
Check for a personal/life area in the vault (e.g. `01 - Life/`, `Personal/`). Use it to schedule:
- Morning routine
- Exercise or movement blocks
- Meals (lunch, dinner)
- Family or personal commitments
- Admin tasks

---

## Scheduling principles

1. **No more than 3–4 hours of deep work total** — two 90-min blocks with a break between is the ceiling.
2. **Morning routine is a block** — 30–60 min at the start (wake, breakfast, prep).
3. **Include at least one proper break** — 30–45 min mid-day.
4. **Admin/messages** — one dedicated 30–45 min block, not scattered.
5. **Meals are blocks** — lunch ~45 min, dinner ~45 min. No deep work through meals.
6. **Close of day** — 15–20 min wind-down: review, update plan, prep for tomorrow.
7. **Realistic task volume** — 6–10 concrete tasks total. Under-promise, over-deliver.
8. **Risk-first ordering** — if energy is medium or high, schedule the highest-risk phase task in the first deep-work block.

---

## Phase intelligence

When listing work tasks from phase notes, enrich each with:

**Risk signal:** Check `risk` frontmatter field. Schedule `high` risk tasks early when cognitive capacity is highest.

**Phase type:** Check `phase_type` frontmatter:
- `slice` — vertical capability. Plan 90–120 min. Label with 🔪.
- `task` — narrower work. Plan 45–60 min. Label with ✅.

**Dependency check:** Check `depends_on` and `## Consumes` sections. If a phase requires output from a blocked phase, flag it as 🔗 BLOCKED and suggest what to unblock first.

**Produces:** Read `## Produces` section. Include a one-liner in the block so you know what "done" looks like.

**Complexity estimate:**
- Phase with > 5 tasks → 2h block
- Phase with 3–5 tasks → 90 min block
- Phase with 1–2 tasks → 45 min block

---

## Work block format

```markdown
### HH:MM - HH:MM: [🔪/✅] Deep Work — {Project} · P{n} {Phase Name}

**Risk:** {low/medium/high}
**Produces:** {one-liner from ## Produces}
**Focus:** {first unchecked task}

- [ ] {task 1}
- [ ] {task 2}
- [ ] {task 3}

**Target:** Phase moves to phase-completed ✓
```

---

## Output format

```markdown
# Daily Plan - [Day], [Date Month Year]

<!-- Direction: <one-line summary if direction was provided> -->

## Today's Mission

**Primary Goal:** <one sentence>

**Top 3 Priorities:**
1. <specific, actionable>
2. <specific, actionable>
3. <specific, actionable>

---

## Time-Blocked Schedule

### HH:MM - HH:MM: Morning Routine
- [ ] Wake, breakfast, prep

---

### HH:MM - HH:MM: Deep Work — <Project>
**Focus:** <what you're working on>
- [ ] <concrete task from vault>
- [ ] <concrete task from vault>

**Target:** <what done looks like>

---

(continue for each block)

---

## Success Criteria

### Must-Have
- [ ] <non-negotiable outcome>

### Should-Have
- [ ] <important but not critical>

### Nice-to-Have
- [ ] <bonus if time permits>

---

## Source links (vault)
- [[path/to/note.md|label]]
```

---

## Write-back (required)

**Primary destination:** `09 - Archive/Daily Archive/Daily - YYYY-MM-DD.md`

Rules:
1. File doesn't exist → create it.
2. File exists → **append** a revision block, do NOT overwrite:
```md
---

## Revised Plan (HH:MM)

<full generated plan>
```

**Update hub (idempotent):** Ensure `04 - Planning/Daily Plans Hub.md` has a link to today's plan under "Recent Daily Plans". Create the file if it doesn't exist.

---

## Capture triage

After reading Inbox, for each unchecked item:
- Maps to an existing phase task → add to that phase block
- Small task (< 30 min) → Quick Win block
- New phase-level work → note in "Inbox to Triage" at bottom of plan
- Mark all inbox items as `- [x]` after routing them

---

## Quality bar

Before writing:
- [ ] At least one personal/life block exists (not all work)
- [ ] Morning routine and close of day are scheduled
- [ ] Task count is realistic (not 20+ tasks)
- [ ] All priorities map to actual vault content
- [ ] No work block spans more than 2 hours without a break
