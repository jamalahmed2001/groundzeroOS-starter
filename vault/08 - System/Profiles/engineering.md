---
name: engineering
type: profile
version: 1.1
required_fields:
  - repo_path
  - test_command
phase_fields:
  - complexity
  - files_touched
  - branch
init_docs:
  - Repo Context
tags: [onyx-profile]
allowed_shell:
  - ls
  - test
  - grep
  - rg
  - cat
  - sed
  - awk
  - echo
  - git
  - pnpm
  - npm
  - npx
  - node
  - timeout
  - mkdir
  - wc
  - find
  - which
denied_shell:
  - rm
  - mv
  - cp
  - dd
  - mkfs
  - chmod
  - chown
  - sudo
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: engineering

> For software engineering projects with a git repository. Covers feature development, bug fixes, refactors, infrastructure, and tests. The agent has full read/write access to the repo; phases are validated by a test command.

---

## When to use this profile

- Any project with a `repo_path` — a git repo the agent reads and writes
- Feature development, bug fixing, refactoring
- Infrastructure automation, scripts, pipelines
- API integrations, backend services, frontend apps

If there's no git repo involved, this profile is the wrong choice.

---

## Required Overview fields

```yaml
profile: engineering
repo_path: /absolute/path/to/repo      # where the code lives
test_command: pnpm test                 # run to validate phase completion
stack: TypeScript / Next.js / Postgres  # optional — helps agent pick idioms
```

`repo_path` is required. Without it, ONYX cannot inject the codebase into the agent's context.

`test_command` is required. It is the acceptance gate for every phase. If the command exits non-zero, the phase is not complete.

`stack` is optional but helpful — reduces agent guesswork on language and framework conventions.

---

## Phase fields

Phases in engineering projects can carry these optional frontmatter fields:

```yaml
complexity: standard          # light | standard | heavy — drives model tier selection
files_touched: []             # list of files this phase modifies (planning aid)
branch: feature/my-feature    # git branch the agent should work on
```

`complexity` maps to model selection:
- `light` → haiku (trivial changes, docs, config tweaks)
- `standard` → sonnet (normal feature work, default if omitted)
- `heavy` → opus (architecture decisions, security-critical, complex refactors)

---

## Shell command policy

The `allowed_shell:` and `denied_shell:` frontmatter fields replace the old `src/executor/runPhase.ts` `isSafeShellCommand` whitelist. The agent **must** check these before any Bash invocation, per [[08 - System/ONYX Master Directive.md|Master Directive]] invariant.

**Rule.**
1. Split the command on whitespace; the first token is the binary name.
2. If the first token appears in `denied_shell`, refuse and mark the task `- [!]` with reason `"denied by profile.denied_shell"`.
3. Else if the first token appears in `allowed_shell`, run via native Bash.
4. Else refuse and mark the task `- [!]` with reason `"not in profile.allowed_shell"`.
5. Additionally, scan the full command for destructive substrings (`rm -rf`, `> /dev/sd*`, `:(){ :|:& };:`, etc.) — refuse on match regardless of first token.

Other profiles can be stricter (content may omit `npm`/`pnpm`; research may omit `git tag`).

---

## Bundle structure

When `onyx init` creates an engineering project, it generates:

```
My Project/
├── My Project - Overview.md      ← project goals, repo_path, test_command, stack
├── My Project - Knowledge.md     ← learnings compound here
├── My Project - Repo Context.md  ← codebase summary (agent fills this in P1)
├── Phases/
│   └── P1 - Bootstrap.md         ← verify repo access, run tests, document structure
└── Logs/
    └── L1 - Bootstrap.md
```

The **Repo Context** note is engineering-specific. Its job is to give every subsequent agent a codebase map without forcing it to re-explore from scratch. The P1 bootstrap phase always populates this.

---

## When creating a new bundle

**For the LLM generating the Overview at `onyx init` time:**

The Overview.md for an engineering project must include:
1. A `## Goals` section — what this project is building and why
2. A `## Scope` section — what is in scope, what is explicitly out of scope
3. A `## Stack` section — languages, frameworks, key dependencies
4. A `## Constraints` section — performance targets, security requirements, compatibility limits
5. A `## Repo structure` subsection in Stack — key directories and their purpose (agent fills after P1)

The Knowledge.md starts empty. The agent populates it as phases complete.

The Repo Context note starts with this template:
```
# Repo Context — [Project Name]

> Populated by the P1 bootstrap phase. Do not edit manually.

## Directory map
[agent fills]

## Key entry points
[agent fills]

## Test suite
[agent fills]

## Known gotchas
[agent fills]
```

---

## Acceptance verification

Before ONYX marks a phase `completed`, the agent must verify:

1. **Test command passes** — run `test_command` from Overview. Exit code must be 0. If it fails: fix the failure or mark the phase `blocked` with the error in `## Human Requirements`.
2. **All tasks checked** — every `- [ ]` in the Tasks section is ticked.
3. **No regressions** — tests that passed before the phase must still pass.
4. **Knowledge updated** — any gotcha, decision, or learned pattern appended to Knowledge.md.

If `test_command` is absent from the Overview, fall back to: verify all tasks are checked and the code compiles without errors.

---

## Context the agent receives

ONYX injects these into the agent's context (in order):

1. This profile file
2. Project Overview.md
3. Project Knowledge.md
4. Project Repo Context.md (if it exists)
5. The phase file

The agent should read in this order. The profile tells it the rules. The Overview tells it the project. Knowledge tells it what was learned. Repo Context tells it where to look. The phase tells it what to do.

---

## Notes for the agent

- Always run the test command before declaring a phase complete
- If you create a new file, add it to Repo Context under the relevant section
- If you discover a gotcha (API quirk, build assumption, env dependency), write it to Knowledge.md immediately — don't wait for phase completion
- Prefer editing existing files over creating new ones unless the task explicitly requires a new file
- One phase = one reviewable diff. If the diff is growing beyond ~400 lines, consider whether you've drifted into a second phase
