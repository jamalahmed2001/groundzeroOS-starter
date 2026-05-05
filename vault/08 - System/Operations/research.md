---
title: research
tags:
  - system
  - operation
  - onyx
type: operation-directive
version: 1.0
created: 2026-04-27
updated: 2026-04-27
graph_domain: system
up: Operations Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/Operations/Operations Hub.md|Operations Hub]]

# Operation: research

> Pre-execution codebase research. Given a phase, scout the repo (file tree + git log), read the phase plan, and write a Research note to the project bundle that gets injected into agent context at execute time.
>
> The TS version made an OpenRouter call. The directive version uses the running agent (Claude / Cursor / etc.) to read the inputs and produce the research note directly — no separate LLM client.

## Preconditions
- A phase exists in the vault matching the operator's `<phase-name-or-number>` argument.
- The phase's project has a resolvable repo path (Overview frontmatter `repo_path`, or fuzzy match under `repos_root`).
- The agent has read access to the repo directory.

## Invocation context
- Operator: `onyx research <phase-name-or-number>` — typically run before flipping a phase to `phase-ready`, so the executor has good context.
- Agent-driven: invoked from `decompose-project` or `atomise` if the bundle's Overview has `auto_research: true`.

## Read order
1. The matched phase file (frontmatter + body — the phase plan goes into the prompt).
2. The Overview's `repo_path` frontmatter field.
3. Repo file tree (filtered).
4. Repo git log (last 10 commits).

## Procedure

### Step 1 — Locate the phase

Glob `<vault_root>/<projects_glob>/Phases/*.md`. For each, read frontmatter. Match against the operator's argument by either:
- `phase_number == <arg>` (exact numeric match, OR
- `phase_name` contains `<arg>` case-insensitively.

If no match: print available phases (each as `P<N> — <name>`) and exit. If multiple match: take the first one (or list and exit if ambiguity is total).

### Step 2 — Resolve the repo path

Read the project's Overview at `<bundle_dir>/<project_id> - Overview.md`. Extract `repo_path` from frontmatter.

If `repo_path` is set and exists on disk → use it.

If absent or doesn't exist → fuzzy-match under `repos_root` (config field): list directories at `repos_root`, find the one whose basename most closely matches `project_id` (lowercase substring match, then Levenshtein if needed). On match, write the resolved path back to Overview frontmatter so subsequent runs are deterministic.

If still unresolved → fall back to the bundle directory itself (so we at least have something to scout). Note this in the research output.

### Step 3 — Scout the repo

```bash
find "$repo_path" -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.rb" -o -name "*.java" -o -name "*.kt" \) \
  | grep -v node_modules | grep -v dist | grep -v .git | grep -v __pycache__ \
  | head -80
```

Cap output at 2000 chars (truncate if over). If find times out (10s) or errors → set `repoScan = "(could not scan repo)"` and proceed.

```bash
git -C "$repo_path" log --oneline -10
```

5s timeout. If errors → `gitLog = "(no git history)"`.

### Step 4 — Compose the research note

Read the phase's full body (cap at 2000 chars to keep prompt size manageable). Combine with the scan + git log into the Research note's body.

The note has these four sections (in order, each H2):

```markdown
## Don't Hand-Roll
What already exists in the codebase that this phase should USE rather than reimplement?
List specific files, functions, utilities, patterns. Be concrete: name the file path,
the function name, the imports.

## Key Files to Touch
Based on the phase plan and repo structure, which files will likely need to be modified
or created? List 3-8 concrete paths. Include "create new file: ..." for additions.

## Common Pitfalls
3-5 most likely mistakes or gotchas when implementing this phase. Be specific to THIS
codebase — not generic "remember to write tests". Look at recent commits for clues
about previous mistakes.

## Recommended Approach
One paragraph on the best approach given what you've seen. Anchor in the codebase's
actual idioms (visible from the file tree + recent commits), not in best-practice
abstractions.
```

The whole note body should be **under 600 words**. Be specific to this codebase; reject generic advice.

### Step 5 — Write the note

File path: `<bundle_dir>/P<phase_number> - <phase_name> - Research.md`.

Frontmatter:

```yaml
---
project: "<project_id>"
phase_number: <N>
phase_name: "<phase_name>"
type: research
created: <YYYY-MM-DD>
up: <project_id> - Phases Hub        # or - Overview if no Phases Hub exists
---
```

Body header:

```markdown
## 🔗 Navigation

**UP:** [[<project_id> - Phases Hub|Phases Hub]]
**Related:** [[P<N> - <phase_name>|Phase Note]]

# Research — P<N> <phase_name>
```

Then the four sections from Step 4.

### Step 6 — Print + return

Print the path written + the full research body to stdout. Return the path for the caller (decompose-project or atomise) to wikilink-reference.

## Post-conditions & transitions
- A `P<N> - <phase_name> - Research.md` exists in the bundle directory.
- The phase note's frontmatter is unchanged.
- The phase's Overview may have gained a `repo_path` value (if it was fuzzy-resolved).
- No status transitions.

## Error handling
- **RECOVERABLE:** repo scan times out → write the note with "(scan unavailable)" sections; the agent will research fresh at execute time.
- **RECOVERABLE:** Overview missing → use bundle dir as repo path, note in research that no Overview was found.
- **BLOCKING:** phase argument doesn't match any phase → exit with the available-phases list, no note written.
- **NEVER WRITE A PARTIAL FILE** — either the note has all four sections or none of it.

## Skills invoked
None — pure agent-native operation.

## Tools invoked
- `find` (repo file tree).
- `git log` (commit history).
- Both via Bash, profile-whitelisted (`engineering` profile has both).

## Native primitives relied on
- **Glob** — phase discovery.
- **Read** — phase, Overview.
- **Bash** — find + git.
- **Write** — the new Research note.
- **Edit** — Overview frontmatter writeback (only when fuzzy-resolved a repo path).

## Acceptance (self-check before exit)
- The Research note exists at the expected path.
- It has all four sections (Don't Hand-Roll, Key Files to Touch, Common Pitfalls, Recommended Approach).
- The body is under 600 words.
- No vault file other than the new note + (optionally) Overview's `repo_path` was modified.

## Forbidden patterns
- **Never call OpenRouter directly.** The agent IS the LLM.
- **Never exceed 600 words in the note body.** Pre-execution context is light, not exhaustive.
- **Never invent files** in the "Key Files to Touch" list. They must come from the actual `find` output, the phase plan, or be flagged as "(create new)".
- **Never write generic advice.** "Write tests, handle errors, validate inputs" — these are bans. Anchor to the specific codebase.
- **Never write to the phase file itself.** The Research note is a sibling artefact.
