# Pipelines

> **In ONYX v2, a pipeline is a first-class unit of work.** Phases are one-off, locked, system-changing. Pipelines are repeatable, journal-only, and append-safe. Same vault, different shape.

This file describes how pipelines are declared and run, and lists patterns for common work shapes. For the runtime semantics, see §C of `08 - System/ONYX v2 Runtime.md` in your vault.

---

## Anatomy of a pipeline

A pipeline lives at `pipelines/<Project> - <pipeline-name>.md` inside a project bundle. The file is its own journal — every invocation appends a row to it.

```yaml
---
project: my-app
pipeline: daily-report
inputs:
  - kind: shell
    cmd: gh issue list --state open --json number,title
stages:
  - kind: agent
    role: summariser
    prompt: "Summarise open issues into a one-page status."
  - kind: skill
    name: slack-post
    args: { channel: "#engineering", file: "artifacts/daily-report.md" }
verify:
  steps:
    - kind: shell
      step: test -f artifacts/daily-report-$(date +%F).md
gates:
  filter: ""           # optional — see Promotion below
  hitl: false
  promote_to: ""
schedule: "0 8 * * *"  # optional — informational; cron lives in your OS
---

## Journal

| iso | outcome | metric | artifact | notes |
|-----|---------|--------|----------|-------|
```

---

## Stage kinds

| Kind | What runs it | When to use it |
|---|---|---|
| **`shell:`** | Bash | Deterministic, well-defined I/O. Migrations, queries, file ops. |
| **`skill:`** | A named skill from `~/clawd/skills/<name>/` | Deterministic with structure — API calls, browser recipes, binary tools (ffmpeg, suno, elevenlabs). |
| **`agent:`** | The same LLM executor as `execute` | Reasoning — summarise, generate, post-mortem, score, classify. |
| **`human:`** | A person ticking a box | HITL gates, paid actions, "looks right" review. |

`agent:` failures are **not** auto-retried — non-determinism dressed up as recovery just hides the failure. Write the reason to the journal row and let the failure policy fire.

---

## How `run` executes a pipeline

```
1. Read pipeline file. Validate frontmatter.
2. Read declared `inputs:` (shell output, file contents, vault frontmatter scans).
3. Open a session log.
4. Execute stages in order.
5. Run `verify.steps`. Red → write `outcome: failed` row, close log, abort.
6. Green → append `outcome: success` row with metrics + artifact path.
7. Check `gates.filter`:
      hitl: false → invoke `promote_to` pipeline directly
      hitl: true  → write a Promotion Queue row, leave for human
8. Close log.
```

**No phase lock.** Two invocations run in parallel as long as their outputs don't share a write target. The journal is append-only and safe under concurrent writes.

---

## Promotion queues

When a pipeline output should trigger another pipeline (paper-trade → live, draft → publish, candidate → backtest), use a gate.

```yaml
gates:
  filter: "metric.sharpe > 1.5 and metric.max_drawdown < 0.2"
  hitl: true
  promote_to: live-promote
```

- `hitl: false` and a passing filter → `run` invokes `promote_to` immediately.
- `hitl: true` → `run` writes a row to `<Project> - Promotion Queue.md` with `approved_by:` empty. The next pipeline reads only rows whose `approved_by:` is a real person.

A project can authorise agent approval (`hitl: false` on money-touching gates) only if all three are present:

1. A `Decisions.md` ADR explicitly authorises it.
2. A `refs/<Project> - Risk Budget.md` defines hard caps the agent must respect.
3. The Promotion Queue row records the budget the auto-promotion ran under.

Safety is enforced, not asserted.

---

## Pattern: scheduled content pipeline

For "generate something every day": one pipeline, scheduled by OS cron, journal-only.

```yaml
---
project: my-podcast
pipeline: generate-episode
inputs:
  - kind: shell
    cmd: cat next-episode-brief.md
stages:
  - kind: skill
    name: suno-generate
  - kind: skill
    name: audio-master
  - kind: human
    description: "Review master before publish"
  - kind: skill
    name: rss-publish
verify:
  steps:
    - kind: shell
      step: test -f artifacts/episode-$(date +%F).mp3
---
```

The `human:` stage pauses the run until a person ticks the box. If you cron this daily, missed approvals just mean today's run waits — tomorrow's invocation is independent.

---

## Pattern: fan-out then evaluate

For "generate N candidates, score them, keep the winners": two pipelines.

**`generate-strategies`** — `agent:` stage produces N candidates, writes them to `phases/<project>-strategy-<n>.md` with `status: backlog`. One journal row per invocation.

**`backtest`** — reads all candidate phases, runs each through a `shell:` backtest, writes the score to the candidate's frontmatter. Journal row records aggregate metrics.

**`promote`** — reads the backtest journal, filters by `gates.filter`, either auto-promotes (if a Risk Budget authorises) or queues for human approval.

Three small pipelines beats one large one because each has a single output target and can rerun independently.

---

## Pattern: monitoring + alerting

For "score incoming events, only ping me when something interesting happens": one pipeline, threshold-gated.

```yaml
---
project: ops
pipeline: classify-incidents
inputs:
  - kind: shell
    cmd: gh issue list --label incident --state open --json number,title,body
stages:
  - kind: agent
    role: classifier
    prompt: "Score each incident severity 1-5. Output JSON."
gates:
  filter: "severity >= 4"
  hitl: false
  promote_to: page-oncall
---
```

The `page-oncall` pipeline only fires for sev-4+. Everything else is just a journal row.

---

## Pattern: investigation (one-off, not repeatable)

This is **not** a pipeline — it's a phase. If you'd do it once and never repeat it, use `execute`. If you'd do it again next week unchanged, use `run`.

---

## Useful workflows in this repo's skills

The `skills/` directory provides effectors that compose well as pipeline stages:

| Stage role | Skill |
|---|---|
| Pull issues | `linear` |
| Pull RSS | `rss-fetch` |
| Generate audio | `suno-generate`, `elevenlabs-tts` |
| Master audio | `audio-master` |
| Publish RSS | `rss-publish` |
| Publish to Spotify Creators | `spotify-creators` |
| Distribute music | `music-distro` |
| Browser automation (Clerk/session-bound) | `browser-automate`, `headless-browser` |
| DNS sync | `cloudflare-dns-sync` |
| Notify human | `notify` |

Each ships with a `SKILL.md` describing verbs, flags, output shape, and prerequisites. Treat the `SKILL.md` as the contract; the implementation is the agent's problem.

---

## When pipelines turn into phases (and vice versa)

A signal that what you called a phase should be a pipeline: you find yourself copy-pasting the phase file every week with one or two values changed. Promote it: extract the variable parts to `inputs:`, move the file to `pipelines/`, delete the per-run phase files.

A signal that what you called a pipeline should be a phase: you keep tweaking the stages, the verify step, and the gates between runs. There's no settled work shape yet. Drop back to phases until the shape settles, then promote.

---

*Phases are one-off, locked, system-changing. Pipelines are repeatable, journal-only, append-safe. Same vault, different shape.*
