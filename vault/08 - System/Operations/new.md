---
title: new (scaffolding)
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/new.ts
lines_replaced: 212
version: 0.1
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: draft
migration_stage: 7
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: new (scaffolding directives + profiles)

> Two scaffolding verbs in one directive: `new directive` and `new profile`. Each writes a stub file from a template — pure file write, no LLM, no agent execution. The templates live in this directive's body so they're agent-readable.

## Verbs

| Verb | What | Where it writes |
|---|---|---|
| `new directive <name>` | System-level directive stub | `<vault>/08 - System/Agent Directives/<name>.md` |
| `new directive <name> --project <project>` | Project-local directive stub | `<bundle>/Directives/<name>.md` |
| `new profile <name>` | Profile stub | `<vault>/08 - System/Profiles/<name>.md` |

In every case, exit if the target file already exists.

## Common helper — `title-case`

Convert kebab/snake/space-delimited input to Title Case:
- `"content-marketer"` → `"Content Marketer"`
- `"audio_producer"` → `"Audio Producer"`
- `"qc reviewer"` → `"Qc Reviewer"`

## Verb 1 — `new directive <name> [--project <project>]`

### Procedure

1. Resolve target path:
   - With `--project <project>`: use the [[08 - System/Operations/phase-ops.md#Common helper — match-project|match-project helper]] to find the bundle. Path: `<bundle>/Directives/<name>.md`. `mkdir -p Directives/`.
   - Without: `<vault>/08 - System/Agent Directives/<name>.md`.
2. If file exists → print `[onyx] Directive already exists: <path>` + `Edit it directly, or use a different name.` and exit.
3. Write the file using the **Directive Template** below, substituting `${name}` and `${title-case(name)}`.
4. Print:
   ```
   [onyx] Created <scope> directive: <basename>
     → <path>
     To use: add  directive: <name>  to any phase frontmatter.
     [project-local note OR system-local hint]
     See: 08 - System/Agent Directives/Agent Directives Hub.md for the template guide.
   ```
   Where `<scope>` is `system-level` or `project-local (<project>)`.

### Directive Template

```markdown
---
title: <Title Case Name> Directive
type: directive
version: 1.0
---

# <Title Case Name> Directive

> **Functions:** [One sentence — what mechanical, data-driven work this agent performs.]
> This directive captures what is executable without human judgment, not a full professional simulation.

## What you read first
1. Project Overview.md — scope and constraints
2. [Domain context doc, e.g. Source Context / Research Brief / Strategy Context]
3. Project Knowledge.md — prior phase learnings
4. The phase file — what to do this phase

## Functions this agent executes
- [Specific, concrete, executable action]
- [Another action — keep these verifiable, not aspirational]

## Data access
| Source | Setup | What it provides |
|---|---|---|
| [Free API / curl] | None | [Description] |
| [Keyed API] | `ENV_VAR` in `.env` | [Description] |
| [Build script] | `pnpm run script` | [Description] |

*No data sources needed? Work from bundle documents only.*
*See [[08 - System/ONYX Integrations.md]] for available integrations by domain.*

## Output
- **Deliverable:** [What file or document is produced]
- **Location:** [Where in the bundle it goes]
- **Format:** [Markdown / JSON / CSV / other]

## Human handoff — when to block
Block and write `## Human Requirements` when:
- [Any judgment call that requires expertise beyond mechanical execution]
- [Any decision that carries professional liability]

## Must not do
- [Hard constraint — something this directive never does]
- [Never produce output that simulates professional advice (legal, medical, financial)]
```

## Verb 2 — `new profile <name>`

### Procedure

1. Target path: `<vault>/08 - System/Profiles/<name>.md`.
2. If file exists → print `[onyx] Profile already exists: <path>` + exit.
3. `mkdir -p` the parent (`08 - System/Profiles/` should already exist).
4. Write the file using the **Profile Template** below.
5. Print:
   ```
   [onyx] Created profile: <name>
     → <path>
     Fill in:
       required_fields — what Overview.md must have
       init_docs — context docs onyx init creates for this profile
       Acceptance gate — domain-specific completion criteria
     Then add "<name>" to PROFILES in src/cli/init.ts (or to the init directive's profile list once init has graduated)
     See: 08 - System/ONYX - Reference.md → Extending ONYX
   ```

### Profile Template

```markdown
---
title: <Title Case Name> Profile
type: profile
version: 1.0
required_fields:
  - TODO_required_field_1
init_docs:
  - TODO Context Doc
---

# <Title Case Name> Profile

> **Domain:** [One sentence — what kind of work this profile handles.]
> **When to use:** [Specific scenario where this profile applies instead of `general`.]

## Required fields (Overview.md must have these)

\`\`\`yaml
# Add to your project Overview.md frontmatter:
TODO_required_field_1: ""   # [description of what goes here]
\`\`\`

## Bundle structure

`onyx init` creates these files for this profile:

| File | Purpose |
|---|---|
| `[Project] - Overview.md` | Goals, scope, required fields |
| `[Project] - TODO Context Doc.md` | [Domain-specific context — rename this] |
| `[Project] - Knowledge.md` | Accumulated learnings (auto-maintained) |
| `[Project]/Phases/` | Phase files |
| `[Project]/Logs/` | Execution logs |

## Artifact flow

| Artifact | Produced by | Consumed by | Notes |
|---|---|---|---|
| `[Project] - TODO Context Doc.md` | P1 Bootstrap | All phases | [What this doc contains and why every agent needs it] |
| Phase output | Each phase | Next phase or human | [What form does output take? Where does it go?] |
| `Knowledge.md` | Every phase | Every subsequent phase | Accumulated learnings. Append only. |

## State transitions

| Transition | Trigger | Gate |
|---|---|---|
| `backlog → ready` | Human sets `phase-ready` tag | — |
| `ready → active` | ONYX dispatches agent | All `depends_on` phases completed |
| `active → completed` | Agent finishes tasks | [Domain-specific: what must be true for the phase to be done] |
| `active → blocked` | Agent cannot proceed | `## Human Requirements` written with specific ask |
| `blocked → ready` | Human resolves | `onyx reset "<project>" <phase>` |

## Suggested directives

Use these on your phases (set `directive:` in phase frontmatter):

| Phase type | Directive |
|---|---|
| [Phase type 1] | `TODO_directive_name` |
| [Phase type 2] | `general` |

*See [[08 - System/Agent Directives/Agent Directives Hub.md]] for all available directives.*

## Human sign-off required for
- [List any decisions that must have human approval before the phase completes]
```

## Skills invoked
None.

## Tools invoked
None.

## Native primitives relied on
- **Bash** — `mkdir -p`.
- **Write** — the new file.

## Acceptance (self-check)
- File exists at the expected path with the template content.
- Title Case substitution correct.
- No other file modified.

## Shadow-mode comparison criteria
**RED:** different file path written, template content drift, missing frontmatter fields.
**YELLOW:** none — the template is byte-deterministic.
**GREEN:** byte-equal output for the same `<name>` input.

Two GREEN runs (one directive, one profile) → graduate, delete `src/cli/new.ts`.

## Forbidden patterns
- **Never** overwrite an existing file. Exit on collision.
- **Never** alter the template's section structure — downstream readers (other ops, healers) rely on these section names.
- **Never** drop the `---` frontmatter delimiter. Frontmatter is mandatory for graph membership.
