---
name: experimenter
type: profile
version: 1.0
required_fields:
  - hypothesis
  - success_metric
  - baseline_value
phase_fields:
  - cycle_type        # learn | design | experiment | analyze
  - hypothesis        # falsifiable claim this phase tests
  - expected_result   # predicted outcome before running
  - actual_result     # measured outcome after running
  - delta             # actual - baseline (filled at completion)
  - parent_experiment # phase number this builds on
  - exploration_bonus # 0.0–1.0, UCB1 exploration weight hint
init_docs:
  - Experiment Log
  - Cognition Store
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: experimenter

> For structured, iterative discovery — prompt engineering, agent configuration, ML pipelines, A/B testing, scientific research, or any project where you are systematically testing ideas and accumulating evidence. Phases are falsifiable claims. Each cycle: **LEARN → DESIGN → EXPERIMENT → ANALYZE**. The Cognition Store is the long-term memory that eliminates cold-start.

---

## When to use this profile

- Prompt engineering — testing variations against a measurable metric
- Agent configuration — finding the best directive/model/temperature combination
- ML experimentation — systematic hyperparameter or architecture search
- Scientific investigation — where evidence compounds across trials
- Any project where "we don't know what works yet" is the honest starting state

If you already know what to build, use **engineering**. If you need to discover what to build, use **experimenter**.

---

## Core idea (from ASI-Evolve + LLM Wiki)

**ASI-Evolve** showed that autonomous agents running 50–200 experiments/week outperform human researchers running 5–10 — not because they're smarter, but because they compound learning. The insight: every trial must be recorded in full (motivation, code, metric, analysis) so future agents never re-discover what's already been found.

**LLM Wiki** showed that a persistent, LLM-maintained knowledge base eliminates the "cold start" problem: instead of re-reading raw sources on every query, the agent reads structured, pre-synthesized knowledge pages.

Combined in ONYX: the **Cognition Store** is the pre-synthesized knowledge base. The **Experiment Log** is the full trial history. Every ANALYZE phase writes to both. Every LEARN phase reads from both. Knowledge compounds.

---

## Required Overview fields

```yaml
profile: experimenter
hypothesis: "Using chain-of-thought prompts will improve task accuracy by ≥10% vs baseline"
success_metric: "task_accuracy (0.0–1.0)"
baseline_value: 0.64
```

`hypothesis` — the primary claim being investigated. Falsifiable, measurable. The whole project is structured around testing this.

`success_metric` — a single, measurable number. How you know whether an experiment worked. Must be comparable across trials.

`baseline_value` — what you're beating. Establishes the floor for the first experiment.

---

## Phase fields

Each phase carries these additional frontmatter fields:

```yaml
cycle_type: experiment        # learn | design | experiment | analyze
hypothesis: "CoT adds 8pts"   # the specific claim this phase tests
expected_result: 0.72         # your prediction before running
actual_result: ~              # filled by agent on completion
delta: ~                      # actual_result - baseline_value (filled on completion)
parent_experiment: 1          # which prior phase this builds on
exploration_bonus: 0.2        # 0.0 = exploit best known; 1.0 = explore novel territory
```

`cycle_type` drives which directive the agent uses:
- `learn` → `experimenter-researcher` directive
- `design` → `experimenter-researcher` directive (proposes what to test)
- `experiment` → `experimenter-engineer` directive (runs the experiment)
- `analyze` → `experimenter-analyzer` directive (synthesizes, writes to Cognition Store)

---

## The four-phase cycle

```
P1: LEARN — Map the landscape
  Researcher reads Cognition Store + Experiment Log
  Identifies what's known, what's unknown, what the highest-leverage question is
  Output: 3-5 candidate experiments, ranked by expected value

P2: DESIGN — Specify the experiment
  Researcher picks the best candidate
  Writes a precise experiment spec: hypothesis, inputs, control conditions, measurement method
  Output: Experiment spec ready for the Engineer to execute

P3: EXPERIMENT — Run it
  Engineer implements + executes the experiment
  Records: code/config, raw output, metric value
  Does NOT interpret results — that's the Analyzer's job
  Output: raw result logged to Experiment Log

P4: ANALYZE — Distill what was learned
  Analyzer reads the experiment log entry
  Compares actual vs expected, explains the delta
  Extracts transferable lessons and writes them to Cognition Store
  Proposes next cycle (what this result suggests to test next)
  Output: Cognition Store updated, next hypothesis proposed
```

Repeat cycles P(n) → P(n+3) until hypothesis confirmed, refuted, or project goal reached.

---

## Bundle structure

```
My Experiment/
├── My Experiment - Overview.md           ← hypothesis, success_metric, baseline_value
├── My Experiment - Experiment Log.md     ← full trial history (append-only)
├── My Experiment - Cognition Store.md    ← structured learnings (LLM-maintained)
├── My Experiment - Knowledge.md          ← cross-project findings worth keeping
├── Phases/
│   ├── P1 - Map the landscape.md         ← LEARN: what do we know / not know?
│   ├── P2 - Design first experiment.md   ← DESIGN: specify the test
│   ├── P3 - Run baseline experiment.md   ← EXPERIMENT: execute + record
│   ├── P4 - Analyze baseline results.md  ← ANALYZE: distill + propose next
│   └── ... (next cycle)
└── Logs/
    └── ...
```

---

## Cognition Store structure

The Cognition Store is an LLM-maintained knowledge base (Karpathy LLM Wiki pattern). The analyzer directive maintains it. Structure:

```markdown
# Cognition Store — [Project Name]

## Index
- [What we know works](#what-we-know-works)
- [What we know doesn't work](#what-we-know-doesnt-work)
- [Open hypotheses](#open-hypotheses)
- [Heuristics](#heuristics)

## What we know works
[Findings with evidence, confidence level, source experiment]

## What we know doesn't work
[Negative results — equally important]

## Open hypotheses
[Untested ideas ranked by expected value]

## Heuristics
[Transferable rules of thumb distilled from multiple experiments]
```

The analyzer maintains this. The researcher reads it before proposing next experiments. This is the compound interest of systematic experimentation.

---

## Experiment Log structure

The Experiment Log is append-only (never edit past entries). Each entry:

```markdown
---
## Trial T[n] — [short name]

**Date:** YYYY-MM-DD
**Phase:** P[n]
**Hypothesis:** [exact claim]
**Expected:** [predicted metric value]
**Actual:** [measured metric value]
**Delta:** [actual - baseline]

### What we did
[Config, code, prompt text, settings — enough to reproduce]

### What happened
[Raw output, error messages, timing, resource usage]

### Why we think it happened
[Brief causal explanation — filled by analyzer, not engineer]

### Transferable lesson
[One sentence that generalizes beyond this specific trial]
---
```

---

## Acceptance verification

Experimenter phases don't accept "it ran" — they accept "it was properly measured and recorded."

For EXPERIMENT phases:
1. `actual_result` is set in phase frontmatter (a number)
2. `delta` is computed and set
3. Trial entry written to Experiment Log with all required fields
4. Raw output archived (log file has enough to reproduce)

For ANALYZE phases:
1. Cognition Store updated with at least one new entry
2. At least one transferable lesson written
3. Next hypothesis proposed (even if null: "experiment is complete, goal achieved")
4. `open_hypotheses` section in Cognition Store reflects current best candidates

---

## UCB1 exploration hint

When multiple experiment phases are ready, `exploration_bonus` in phase frontmatter is a hint to ONYX's scheduler. Higher value = prefer this phase even if its expected value is lower (exploration). Lower value = only run if expected value is competitive (exploitation).

Default is 0.3 — slight exploration bias. Set to 0.0 for pure exploitation (run the best-looking experiment). Set to 1.0 to force exploration of an untested idea.

---

## Notes for the agent

- **The hypothesis is the job.** Every action traces back to: does this advance our ability to test the hypothesis?
- **Negative results are full results.** A trial that falsifies the hypothesis is not a failure — it's information. Record it with the same care as a positive result.
- **Don't interpret in the EXPERIMENT phase.** The engineer records. The analyzer interprets. This separation prevents motivated reasoning from contaminating the record.
- **Cognition Store is authoritative, not Knowledge.md.** For experimenter projects, Cognition Store is the primary knowledge artifact. Knowledge.md is for cross-project learnings worth carrying elsewhere.
- **State what you expected before you look at results.** If you can't write `expected_result` before running, the experiment isn't specific enough. Go back to DESIGN.
