---
name: research
type: profile
version: 1.0
required_fields:
  - research_question
  - source_constraints
  - output_format
phase_fields:
  - methodology
  - source_count
  - confidence_level
  - open_questions
init_docs:
  - Research Brief
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: research

> For investigation, analysis, and synthesis projects. Market research, competitive intelligence, technical deep-dives, literature reviews. The agent's job is to find, evaluate, and synthesise — not to build. Acceptance is about completeness and source quality, not a test command.

---

## When to use this profile

- Market research and competitive intelligence
- Technical investigation (evaluating a library, understanding a protocol, mapping an API)
- Literature review and synthesis
- Due diligence on a decision
- Any project where the output is insight, not code

If the research feeds directly into building something, consider whether the build phases should be a separate engineering bundle with the research output feeding in as context.

---

## Required Overview fields

```yaml
profile: research
research_question: "What are the viable options for real-time order routing in a crypto exchange?"
source_constraints: "primary sources only (docs, papers, official APIs); no blog posts without citations"
output_format: "decision matrix + recommendation memo"
```

`research_question` is required. It anchors every phase. The agent returns to it before concluding any phase — does this output actually answer the question?

`source_constraints` is required. It defines what counts as credible evidence for this investigation. Enforced at acceptance: the agent must cite sources that meet these constraints.

`output_format` is required. It tells the agent what shape the final output takes — so every phase accumulates toward that shape.

---

## Phase fields

Research phases carry these optional frontmatter fields:

```yaml
methodology: "systematic literature review"   # how this phase conducts its research
source_count: 5                                # minimum number of qualifying sources this phase must cite
confidence_level: medium                       # low | medium | high — agent self-assesses on completion
open_questions: []                             # gaps the agent couldn't close; feeds into next phase or blocks
```

`source_count` is the acceptance gate. If the phase's methodology requires 5 sources and the agent finds 3, it should either find more or mark the phase blocked.

`confidence_level` is the agent's honest self-assessment. `low` = significant gaps remain; `high` = well-evidenced conclusion. This propagates to Knowledge.md so future phases know what to trust.

---

## Bundle structure

When `onyx init` creates a research project, it generates:

```
My Project/
├── My Project - Overview.md          ← research question, source constraints, output format
├── My Project - Knowledge.md         ← findings compound here, organised by sub-question
├── My Project - Research Brief.md    ← context, prior work, what's already known
├── Phases/
│   ├── P1 - Map the landscape.md     ← identify key players, sources, sub-questions
│   ├── P2 - Deep dive [area A].md    ← focused investigation per sub-question
│   └── Pn - Synthesise + write.md    ← produce output_format deliverable
└── Logs/
    ├── L1 - Map the landscape.md
    └── ...
```

The **Research Brief** note is research-specific. It captures the context the agent needs to understand *why* this question is being investigated — what decisions depend on it, what's already known, what hypotheses exist. Prevents the agent from re-explaining basics in every phase.

---

## When creating a new bundle

**For the LLM generating the Overview at `onyx init` time:**

The Overview.md for a research project must include:
1. A `## Research question` section — the primary question, precisely stated. Sub-questions if known.
2. A `## Why this matters` section — what decision or action this research informs. Grounds the agent in purpose.
3. A `## Prior knowledge` section — what is already known or assumed going in. Saves the agent from re-establishing known facts.
4. A `## Source constraints` section — what counts as a valid source (peer-reviewed only? official docs only? any public source?).
5. A `## Output format` section — what the final deliverable looks like (decision memo, report, comparison table, slide deck summary).
6. A `## Timeline` section — if there's a decision deadline, the agent should know.

The Research Brief starts with this template:
```
# Research Brief — [Project Name]

> Populated by the human and refined at P1. Provides standing context for all subsequent phases.

## Background
[Why is this question being asked? What triggered it?]

## What we already know
[Prior knowledge, assumptions, things that can be taken as given]

## Hypotheses
[Working theories going in — the agent should test these, not assume them]

## Key players / sources to examine
[Known starting points — people, orgs, papers, products]

## Decision criteria
[What would a good answer look like? What would make one option clearly better than another?]
```

---

## Acceptance verification

Research phases don't have a test command. Acceptance is based on completeness and source quality:

1. **All tasks checked** — every `- [ ]` in the Tasks section is ticked.
2. **Source count met** — if `source_count` is set, the phase log must cite at least that many qualifying sources. Sources must meet `source_constraints` from the Overview.
3. **Research question addressed** — the agent explicitly checks: does this phase's output move toward answering the primary research question? If not, explain why (sub-question was a dead end, re-scope, etc.).
4. **Open questions documented** — any gaps that couldn't be closed in this phase are written into `open_questions` in the phase frontmatter, and explained in the log.
5. **Knowledge updated** — findings written to Knowledge.md, organised by sub-question or theme. Confidence level noted.

If the agent cannot meet source count or cannot meaningfully address the research question, it marks the phase `blocked` with a `## Human Requirements` note explaining what additional resources, access, or clarification are needed.

---

## Context the agent receives

ONYX injects these into the agent's context (in order):

1. This profile file
2. Project Overview.md
3. Project Knowledge.md (all prior findings)
4. Project Research Brief.md (if it exists)
5. The phase file

The agent reads all prior Knowledge before starting a phase — research compounds. A finding from P2 should inform P4.

---

## Notes for the agent

- The research question is the anchor. Before concluding any phase, ask: does this output actually address the question?
- Confidence levels matter. If evidence is thin, say `confidence_level: low` and document the gaps. Don't dress up weak evidence as a conclusion.
- `open_questions` in the phase frontmatter is where dead ends go. These feed into the next phase or bubble up to the human. Don't silently drop a sub-question that couldn't be answered.
- Knowledge.md is your running findings document. Organise it by sub-question, not by phase — future agents need to find information by topic, not by when it was discovered.
- If a source doesn't meet `source_constraints`, cite it anyway but flag it: "This source is a blog post and does not meet the source constraints. Included for context only; do not treat as evidence."
- Never synthesise past what the evidence supports. If the sources are ambiguous, reflect the ambiguity. If a decision can't be made cleanly, say so and explain what additional evidence would resolve it.
