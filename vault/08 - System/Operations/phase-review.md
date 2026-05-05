---
title: phase-review
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

# Operation: phase-review

> Run a quick code review on the diff a phase produced, write it to the phase log, and notify. Invoked by `execute-phase` immediately after a phase transitions to `completed` (only for engineering profiles where there's a `repo_path` and a git diff to look at).
>
> The TS version made an OpenRouter call. The directive version uses Claude itself (running this directive) to read the diff and write the review — no separate LLM client needed.

## Preconditions
- Phase has just transitioned `active → completed`.
- Phase frontmatter has `project` and `phase_name`.
- Phase profile is `engineering` (or has a resolvable `repo_path` Overview field).

## Invocation context
Called inline at the end of [[08 - System/Operations/execute-phase.md|execute-phase]] step 6 (Case A — completed), after consolidate runs but before the lock releases.

## Read order
1. Phase file frontmatter (`project`, `phase_name`).
2. Project Overview frontmatter (`repo_path`).
3. The repo's last commit diff: `git -C <repo_path> diff HEAD~1 --stat` plus the source-file portion.

## Procedure

### Step 1 — Resolve the diff
```bash
repo_path=<from Overview frontmatter, fall back to bundle dir>
git -C "$repo_path" diff HEAD~1 --stat                                              # summary
git -C "$repo_path" diff HEAD~1 -- '*.ts' '*.tsx' '*.js' '*.py' '*.go' '*.rs' '*.rb' \
                                   '*.java' '*.kt' '*.swift' '*.c' '*.cpp' '*.h' \
                                   | head -c 4000                                    # body, capped
```
If `HEAD~1` doesn't exist (single-commit repo), fall back to `git -C <repo_path> show --stat HEAD`. If there's no git history at all, set diff to `(no git diff available)` and proceed — the review will still run, just shorter.

### Step 2 — Write the review

Read the diff. Classify the change set in your head:
- Magnitude (files changed, lines added/removed)
- Subjective quality cues: clarity of names, single-purpose commits vs. mixed bag, untested critical paths, debug code left behind, secrets / credentials accidentally committed, large auto-generated files mixed in
- Test coverage cues: did test files get touched alongside source files?
- Idiom adherence: does the change use existing helpers in the codebase (visible from imports), or hand-roll new versions of things that already exist?

Then write the review in this **exact** format (kept tight — the whole thing under 800 chars):

```
🔍 <phase_name>
Project: <project>

Changed: <X files - brief description>

Quality:
<2-4 lines, each starting with ✅, ⚠️, or 🚫 — what's good, what to look at, what's broken>

Verdict: LGTM | REVIEW NEEDED | NEEDS WORK
```

No padding. Be direct. The verdict is one of three exact labels.

### Step 3 — Append the review to the phase's log file

Locate the log: `<bundle>/Logs/L<phase_number> - P<phase_number> - <phase_name>.md`.

Append a new entry under `## Entries`:

```markdown
### <ISO timestamp> — phase_completed
**Run:** <run_id>
**Detail:** PHASE REVIEW:
<full review text from Step 2>
```

### Step 4 — Notify

Call `openclaw` per Master Directive §15 with the first 300 chars of the review:

```
openclaw \
  --event phase_completed \
  --project "<project>" \
  --phase "<phase_name>" \
  --severity info \
  --message "[INFO] <project>/<phase>: <first 300 chars of review>"
```

Fire-and-forget — notification failure does not fail the review.

### Step 5 — Print

Print `[phase-review] <review>` to stdout for the operator's terminal.

## Post-conditions & transitions
- Log gains one entry capturing the review.
- One openclaw notification fired (if openclaw configured).
- No phase status change — the phase stayed `completed`.

## Error handling
- **RECOVERABLE:** git binary missing, repo path doesn't exist, no commit history → emit a one-line review like `🔍 <phase> | Verdict: LGTM | (no diff to review)` and proceed.
- **RECOVERABLE:** Bash command times out (10s) → write `(diff fetch timed out — skipping review body)` and emit a stub review with `Verdict: REVIEW NEEDED`.
- **NEVER BLOCKING.** Phase review is advisory; its failure must not stop a phase from completing.

## Skills invoked
None — this directive is the agent reading + writing.

## Tools invoked
- `git` (via Bash, profile-whitelisted in `engineering` profile).
- `openclaw` (via Bash) — for the notification.

## Native primitives relied on
- **Bash** — `git` calls.
- **Read** — phase file, Overview frontmatter, log file.
- **Edit** — append to log.

## Acceptance (self-check before exit)
- A new entry appears in the phase's log under `## Entries` with event `phase_completed` and the review body.
- (If openclaw configured) one notification was fired.
- No mutation to phase frontmatter or status.

## Forbidden patterns
- **Never** call OpenRouter directly. The agent IS the LLM when running this directive.
- **Never** exceed the 800-char body cap. Verdict + 2-4 quality lines is the whole review.
- **Never** invent files in the diff that aren't there. Read the actual `git diff` output.
- **Never** block the phase. This is advisory.
