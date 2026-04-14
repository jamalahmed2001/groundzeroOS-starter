---
name: content
type: profile
version: 1.0
required_fields:
  - voice_profile
  - pipeline_stage
phase_fields:
  - episode_number
  - pipeline_stage
  - safety_rules
  - output_format
init_docs:
  - Source Context
tags: [onyx-profile]
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: content

> For content production pipelines — podcasts, newsletters, video series, social campaigns. Multi-stage, multi-agent by nature. Each pipeline stage has distinct constraints: research needs citation rules, scripting needs voice rules, distribution needs platform-specific formats. This profile defines the pipeline's mechanical structure; directives define each agent's identity within it.

---

## When to use this profile

- Any recurring content production pipeline (podcast, video series, newsletter)
- Multi-stage workflows where different expertise is needed at each stage
- Projects where brand voice, safety rules, or output format must be enforced consistently

If it's a one-off piece of content, an engineering project is probably a closer fit. This profile is for recurring pipelines with defined stages.

---

## Required Overview fields

```yaml
profile: content
voice_profile: "Docs/ManiPlus - Voice Guide.md"   # path to voice guide, or inline description
pipeline_stage: research                             # current production stage (informational)
safety_rules: no-medical-advice, cite-all-claims    # comma-separated safety constraints
```

`voice_profile` is required. It tells every agent in the pipeline whose voice to write in and what constraints that imposes. Can be a vault path (preferred) or an inline summary.

`pipeline_stage` tracks where in the production lifecycle the project currently sits. Updated by the agent as stages complete.

`safety_rules` lists non-negotiable constraints that apply across the entire pipeline. The agent treats these as hard rules, not suggestions.

---

## Phase fields

Content pipeline phases carry these optional frontmatter fields:

```yaml
pipeline_stage: script                # research | script | audio | video | distribution | engagement | analytics
episode_number: 8                     # which episode/issue this phase produces
output_format: "800-1200 word script" # what the deliverable looks like
safety_rules: no-medical-advice       # phase-level override if different from project-level
```

`pipeline_stage` on the phase is the single most important field — it tells the agent exactly where it sits in the production sequence and what the upstream/downstream handoffs are.

---

## Bundle structure

When `onyx init` creates a content project, it generates:

```
My Project/
├── My Project - Overview.md           ← goals, voice_profile, pipeline_stage, safety_rules
├── My Project - Knowledge.md          ← learnings: voice refinements, safety lessons, audience feedback
├── My Project - Source Context.md     ← show identity, positioning, audience definition
├── Directives/                        ← project-specific agent directives per pipeline stage
│   ├── researcher.md
│   ├── script-writer.md
│   └── distributor.md
├── Phases/
│   └── P1 - Bootstrap.md              ← define pipeline stages, create directives, verify voice guide
├── Logs/
│   └── L1 - Bootstrap.md
└── Episodes/ (or Issues/, Editions/)  ← output files land here
    └── E01 - Pilot.md
```

The **Source Context** note is content-specific. It defines the show's identity, target audience, tone, and positioning — the stable facts every agent needs before touching anything. The bootstrap phase populates it from the Overview and any existing brand documents.

The **Directives/** folder lives inside the bundle (not in the system folder) because content pipeline directives are project-specific — they encode Mani's voice, this newsletter's tone, not generic rules.

---

## When creating a new bundle

**For the LLM generating the Overview at `onyx init` time:**

The Overview.md for a content project must include:
1. A `## Goals` section — what this pipeline produces, for whom, and why it matters
2. A `## Pipeline stages` section — numbered list of stages (research → script → audio → video → distribution is a common sequence; adapt to the actual pipeline)
3. A `## Voice` section — high-level description of the content's voice and tone (the detailed voice guide goes in Source Context or a linked doc)
4. A `## Safety constraints` section — what the content must never say, claim, or imply
5. A `## Output format` section — what each episode/issue delivers (length, structure, platform formats)

The Source Context note starts with this template:
```
# Source Context — [Project Name]

> Stable identity facts for this content pipeline. Populated at P1, updated as positioning evolves.

## Show identity
[What this is, in one sentence]

## Audience
[Who it's for, what they already know, what they need]

## Voice and tone
[How it sounds. What it avoids. Specific examples if possible.]

## Positioning
[What makes this different from other content in this space]

## Safety rules
[Non-negotiable constraints — medical, legal, ethical]
```

---

## Acceptance verification

Content phases don't have a test command. Acceptance criteria are domain-specific:

1. **All tasks checked** — every `- [ ]` in the Tasks section is ticked.
2. **Safety filter passed** — agent reviews output against `safety_rules` from Overview and phase. If any rule is violated, the phase is `blocked` with the violation in `## Human Requirements`.
3. **Voice check** — agent confirms output matches the voice described in `voice_profile`. If uncertain, flags for human review rather than guessing.
4. **Output in the right place** — deliverable is written to the designated output location (Episodes/, Issues/, etc.), not just the log.
5. **Knowledge updated** — any voice refinement, audience insight, or safety lesson appended to Knowledge.md.

If a phase produces a draft that needs human approval before the next stage runs, the agent sets the phase to `blocked` with a `## Human Requirements` note: "Review draft at Episodes/E08.md before running the distribution phase."

---

## Context the agent receives

ONYX injects these into the agent's context (in order):

1. This profile file
2. The phase's directive (if set) — agent identity for this pipeline stage
3. Project Overview.md
4. Project Knowledge.md
5. Project Source Context.md (if it exists)
6. The phase file

The directive comes before the Overview — the agent reads who it is before it reads what the project is.

---

## Notes for the agent

- Voice consistency is non-negotiable. When in doubt, read three recent episodes before writing.
- Safety rules are hard constraints, not style preferences. If a rule blocks you, mark the phase blocked — do not find a workaround.
- Output files go in the designated folder (Episodes/, Issues/, etc.), not in the log. The log records what happened; the output folder is what gets used.
- The Knowledge note is where the pipeline gets smarter. Write to it: what worked, what the audience responded to, what safety edge cases emerged. Future agents compound on this.
- If you are in a distribution phase, never publish without checking that the upstream output exists and has passed its acceptance criteria.
