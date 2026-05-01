---
tags:
  - status-active
  - system
  - onyx
  - proposal
  - engineering
  - profiles
  - directives
graph_domain: system
created: 2026-04-28
updated: 2026-04-28
status: active
up: System Hub
---
# ONYX - Engineering Harness Proposal

> Proposal: evolve ONYX engineering from mostly static profiles/directives into a measurable, adaptive **harness system** that improves context selection, execution quality, and learning across projects.

## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

---

## 1. Why this exists

The core idea behind this proposal is simple:

**model quality is not only determined by the model; it is also determined by the harness around the model** — the rules that decide what context is loaded, what is remembered, what is ignored, how execution is structured, and what gets written back afterward.

ONYX is already a harness in practice. It decides:
- which bundle is active
- which profile applies
- which directive is used
- which phase is being executed
- which context files are injected
- which logs and notes are written back

This proposal says ONYX should make that layer more explicit, more measurable, and more improvable.

---

## 2. Architectural fit with ONYX

This proposal is intentionally aligned with the existing ONYX boundary:

- **ONYX Core** remains invariant
- **Profiles** remain domain specialisations
- **Bundles** remain concrete project instances
- **Directives** remain execution contracts for agent behaviour

The proposal does **not** redefine Phase, Log, DoD, or project lifecycle semantics.

### Core rule preserved

A phase remains:

> the smallest reviewable execution unit with explicit goals, tasks, acceptance criteria, and a linked log.

So this proposal is not a replacement for ONYX Core. It is a refinement of how ONYX engineering work is surfaced to agents.

---

## 3. The shift in mindset

### Old framing

Engineering profile = a mostly static file that says:
- repo path
- test command
- stack
- a few engineering-specific expectations

Directive = a role prompt telling the agent how to behave.

### New framing

Engineering profile + directive + retrieval logic + trace logging + evaluation rules together form an **Engineering Harness**.

That harness controls:
- what context is loaded first
- what additional context is fetched if blocked
- what evidence is required before completion
- what is logged after execution
- what gets learned for the next run

This is the key shift:

**from prompt templates to harness programs**

Not necessarily executable code on day one — but clearly specified, structured, and testable orchestration logic.

---

## 4. Why this matters for ONYX

Without a harness-aware approach, engineering quality drifts because agents are forced to re-solve the same orchestration problems repeatedly:
- which files matter
- which tests to inspect first
- whether to trust old context
- when to broaden search
- what to persist as a future heuristic

That leads to:
- wasted context windows
- unnecessary repo exploration
- inconsistent execution quality
- repeated mistakes across phases
- poor reuse of prior logs and learned patterns

A harness-aware ONYX engineering system should instead:
- load narrower, higher-signal context first
- escalate context progressively only when needed
- preserve useful execution traces in reusable structure
- compare harness variants empirically
- improve engineering performance across all bundles, not just ONYX itself

---

## 5. Two scopes of application

This proposal should be understood in **two layers**.

### Layer A — Meta-ONYX application

Use the idea to improve ONYX's own internal engineering directives, profiles, and orchestration.

This means ONYX becomes better at improving itself:
- better context injection for ONYX repo work
- better use of prior phase logs
- better reflection on what repo context was useful
- better evaluation of directive/profile variants

### Layer B — General engineering profile for all ONYX projects

This is the more important generalisation.

The proposal should become a reusable **Engineering Harness profile** that can apply to any engineering bundle under ONYX, for example:
- ONYX itself
- My Podcast
- OpenClaw-adjacent repos
- product apps
- automations
- scripts and tooling
- infrastructure repos

So the target is **not** “Meta-ONYX only”.

The better framing is:

> build a general ONYX Engineering Harness profile, then use ONYX itself as one high-leverage proving ground.

---

## 6. Proposed concept: Engineering Harness

An **Engineering Harness** is the structured execution layer used by ONYX for software projects.

It combines five things:

1. **Project contract**
   - repo path
   - test command
   - stack
   - constraints
   - definition of done
   - rollback expectations

2. **Context policy**
   - what to read first
   - what to defer
   - what to summarise
   - what to avoid
   - when to expand search

3. **Execution policy**
   - how phases are validated
   - how tests are run
   - when to stop and ask for human input
   - how large a diff can grow before rephasing

4. **Trace policy**
   - what gets logged from each run
   - what was useful vs wasted context
   - what heuristics were discovered
   - what failure mode occurred

5. **Evaluation policy**
   - how harness quality is measured across runs
   - how profile/directive variants are compared
   - how improvements are promoted or rejected

---

## 7. Design principles

### 7.1 Keep ONYX Core stable

Profiles can add structure and procedures.
They must not redefine core ONYX semantics.

### 7.2 Optimise retrieval, not just prompting

The biggest gains are likely to come from better:
- context ordering
- context filtering
- escalation policy
- execution trace reuse

### 7.3 Progressive disclosure of context

Do not inject the whole repo or every prior note by default.
Context should expand in stages.

### 7.4 Logs must become reusable learning artifacts

Engineering logs should not only record what happened for a human reviewer.
They should also preserve structured signal for future runs.

### 7.5 Measure the harness itself

The system should not only ask “did the task complete?”
It should also ask “was this harness variant efficient and robust?”

### 7.6 General before bespoke

Anything useful for ONYX itself should be extracted into a general engineering pattern where possible.
Meta-ONYX can be a proving ground, not the only use case.

---

## 8. What changes in the engineering profile

The current engineering profile is a good base, but it mostly defines static contract fields.

This proposal extends it in four directions.

### 8.1 Add retrieval strategy

The profile should define an explicit retrieval ladder.

Example:

```yaml
retrieval_strategy:
  initial:
    - phase_file
    - latest_log
    - overview
    - knowledge
    - repo_context
    - files_declared_in_phase
    - nearest_tests
  expand_if_blocked:
    - sibling_modules
    - architecture_docs
    - similar_patterns_search
    - recent_related_phases
  avoid_by_default:
    - lockfiles
    - generated_files
    - dist_build_output
    - unrelated_docs
```

This makes context selection visible and auditable.

### 8.2 Add context budgets

The profile should set soft operating limits.

Example:

```yaml
context_budget:
  max_initial_files: 8
  max_initial_log_count: 2
  prefer_summary_over_raw_for_large_files: true
  expand_only_on_blocker: true
```

This helps prevent overloading the model with low-value context.

### 8.3 Add trace schema

Each engineering run should emit structured observations.

Example:

```yaml
trace_schema:
  useful_context: true
  wasted_context: true
  failure_mode: true
  heuristic_learned: true
  followup_risk: true
  touched_entry_points: true
```

### 8.4 Add evaluation metrics

Example:

```yaml
evaluation_metrics:
  - tests_passed
  - retries_needed
  - token_cost
  - time_to_green
  - human_corrections_after_run
  - rollback_needed
  - context_waste_ratio
```

This turns the profile into an optimisable system, not just a static contract.

---

## 9. What changes in directives

Profiles define mechanical rules. Directives define behavioural execution style.

Under this proposal, engineering directives should become more explicit about:
- how to choose the first files to inspect
- when to inspect tests before implementation
- when to stop broad exploration and commit to a path
- when to write a heuristic to Knowledge or log
- when a task has drifted into a new phase
- when uncertainty is high enough to ask for human clarification

### Directive evolution example

Instead of only saying:

> behave like a strong software engineer

The directive should encode rules like:

- inspect adjacent tests before editing implementation when tests exist
- search for an existing pattern before introducing a new abstraction
- prefer local consistency with repo conventions over idealised greenfield architecture
- log any discovered build or environment gotcha at the moment it is found
- if diff scope exceeds reviewable size, stop and recommend rephasing

That is much closer to a harness than a generic role prompt.

---

## 10. Proposed retrieval ladder for engineering phases

A default ONYX engineering harness should use progressive retrieval.

### Tier 1 — Immediate execution context
Load first:
- profile
- directive
- project overview
- current phase
- latest relevant log
- project knowledge
- repo context

### Tier 2 — Direct code adjacency
Load next if needed:
- files named in the phase
- nearest tests
- sibling modules
- directly imported or neighbouring files

### Tier 3 — Structural repo context
Load only if blocked or uncertain:
- architecture docs
- docs hub docs relevant to the subsystem
- search results for similar implementations
- prior related phases/logs

### Tier 4 — Broad exploration
Only when necessary:
- wider repo search
- historical patterns across the codebase
- infra/config surfaces outside the immediate subsystem

This gives ONYX a clear escalation path instead of all-or-nothing context loading.

---

## 11. Proposed engineering trace format

Every completed or blocked engineering phase should leave behind machine-usable trace data in its log.

Suggested sections:

### Useful context
Which files or notes materially helped?

### Wasted context
Which files or notes were loaded but not useful?

### Failure mode
What stopped the run or made it inefficient?
Examples:
- missing test fixture
- stale repo context
- hidden dependency
- misleading phase scope
- architecture ambiguity

### Heuristics learned
What should future runs try first?
Examples:
- inspect route handlers before service layer in this repo
- check generated types after schema changes
- prefer repo-local utility over creating a new helper

### Risk surfaced
What still looks brittle even if tests pass?

### Next-time rule
What should the harness change next time?

Example:

```yaml
trace:
  useful_context:
    - src/api/auth.ts
    - tests/auth.spec.ts
    - Docs/Auth Flow.md
  wasted_context:
    - package-lock.json
    - unrelated deployment doc
  failure_mode: stale repo context note
  heuristics_learned:
    - inspect tests before touching auth middleware
    - search for existing request wrapper before adding a new fetch helper
  risk_surfaced:
    - hidden env dependency not covered by CI
  next_time_rule:
    - inject env setup note whenever auth files are in scope
```

---

## 12. Proposed evaluation loop

ONYX should begin measuring harness quality across engineering phases.

### Metrics worth tracking
- completion success rate
- first-pass test pass rate
- retries per phase
- time to passing tests
- human correction rate after completion
- rollback frequency
- number of files read
- ratio of useful to wasted context
- token usage or context cost
- number of clarification loops

### What to compare
Compare variants of:
- engineering profile versions
- engineering directive versions
- retrieval ladders
- log/trace schemas
- repo context note formats

### Promotion rule
A harness variant should only be promoted if it improves outcomes on real tasks or replay tasks without violating ONYX core invariants.

---

## 13. Proposed artifact additions in ONYX

### 13.1 Profile extension
Extend `08 - System/Profiles/engineering.md` with harness-oriented fields such as:
- retrieval strategy
- context budget
- trace schema
- evaluation metrics

### 13.2 Harness notes or configs
Potential future artifacts:
- `08 - System/Profiles/engineering-harness.md`
- `08 - System/Conventions/Engineering Retrieval Convention.md`
- `08 - System/Templates/Engineering Trace Template.md`

### 13.3 Better log structure
Engineering phase logs should become structured enough to support later analysis.

### 13.4 Benchmark or replay set
Over time, ONYX could maintain a set of representative engineering tasks used to compare harness variants.

---

## 14. How this should relate to the existing engineering profile

This proposal should **not** replace the current engineering profile abruptly.

Recommended path:

### Phase 1 — Proposal and schema extension
- keep the current engineering profile intact
- add optional harness fields
- define recommended retrieval and trace conventions

### Phase 2 — Soft adoption
- use the harness fields on ONYX itself first
- test the pattern on one or two other engineering bundles
- compare outputs manually

### Phase 3 — Generalised profile hardening
- promote the best retrieval ladder
- standardise trace sections
- make some harness fields first-class defaults for engineering bundles

### Phase 4 — Optional automation
- introduce harness evaluation or replay tooling
- allow ONYX to recommend profile/directive improvements based on observed logs

---

## 15. Practical first version for ONYX

A useful v1 does **not** need autonomous self-rewriting.

A strong v1 could simply do the following:

1. Extend the engineering profile with retrieval, trace, and evaluation sections
2. Update engineering directives to encode better retrieval/execution heuristics
3. Standardise engineering logs so they record useful vs wasted context
4. Start comparing outcomes across a few real phases
5. Capture lessons in a reusable convention

This would already make ONYX materially stronger without adding dangerous complexity.

---

## 16. Risks and failure modes

### 16.1 Over-engineering the harness
Risk: building a complex meta-system before basic profile quality is stable.

Mitigation:
- start with explicit fields and conventions
- keep the first version mostly declarative

### 16.2 Profile drift from ONYX Core
Risk: engineering profile starts redefining phase semantics.

Mitigation:
- keep hard boundaries
- treat harness rules as additive, not redefining

### 16.3 Premature automation
Risk: ONYX begins mutating its own profiles/directives without sufficient evaluation.

Mitigation:
- start with recommend-only mode
- require explicit review before promotion

### 16.4 Metric gaming
Risk: optimising for token cost or speed at the expense of engineering correctness.

Mitigation:
- keep tests, reviewability, and rollback safety as primary metrics
- treat efficiency as secondary

---

## 17. Recommendation

The right implementation path is:

### Recommendation A
Treat this as a **general ONYX Engineering Harness proposal**, not a Meta-ONYX-only idea.

### Recommendation B
Use ONYX itself as the first proving ground, because it gives the fastest feedback loop.

### Recommendation C
Evolve the existing engineering profile into a harness-aware profile rather than creating an entirely separate disconnected system.

### Recommendation D
Keep ONYX Core invariant and use profiles/directives to carry the adaptive layer.

---

## 18. Suggested next concrete deliverables

1. **Revise `engineering.md`**
   - add retrieval strategy
   - add context budgets
   - add trace schema
   - add evaluation metrics

2. **Create an engineering trace template**
   - useful context
   - wasted context
   - failure mode
   - heuristic learned
   - risk surfaced
   - next-time rule

3. **Create a retrieval convention note**
   - default tiered context ladder for engineering phases

4. **Update the ONYX engineering directive(s)**
   - add behavioural heuristics for context selection and scope control

5. **Pilot on 2-3 real engineering bundles**
   - ONYX
   - My Podcast
   - one smaller repo

6. **Review logs after several runs**
   - identify repeated wasted context
   - identify repeated winning heuristics
   - promote improvements into the profile

---

## 19. One-sentence summary

**Turn ONYX engineering from a static role-and-prompt setup into a measurable, reusable Engineering Harness that improves context selection, execution quality, and learning across all engineering bundles.**

---

## 20. Source idea

Primary inspiration: *Meta-Harness: End-to-End Optimization of Model Harnesses* (`arXiv:2603.28052`).

The key takeaway applied here is not “let the system rewrite itself blindly”, but:

> make harness design explicit, structured, evaluable, and improvable.
