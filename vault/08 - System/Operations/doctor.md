---
title: doctor
tags:
  - system
  - operation
  - onyx
type: operation-directive
replaces: src/cli/doctor.ts
lines_replaced: 271
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

# Operation: doctor

> Pre-flight checks. Validates everything needed before first run. **No config required to run** — that's the point. The directive walks every check, prints `✓ / ✗ / ⚠`, and on any hard fail exits 1.

## Preconditions
None — doctor runs against bare directories.

## Invocation context
- Operator: `onyx doctor` — typically the first command after clone.
- Re-run any time something feels wrong.

## Read order
1. `<cwd>/onyx.config.json` (may not exist).
2. `<cwd>/.env` (may not exist).
3. The vault directory at `vault_root` (may not exist).
4. Environment variables (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `ONYX_VAULT_ROOT`).
5. The vault's phase notes (only if vault exists and is readable).

## Procedure

Run each check below in order. For each, append a row `{label, pass: bool, warn?: bool, fix?: string}` to the report. Print all rows at the end. Exit 1 if any non-warn check failed.

### 1. Config file
- Pass if `onyx.config.json` exists at cwd.
- Fix: `cp onyx.config.json.example onyx.config.json`.

### 2. Config valid JSON
- Pass if it parses.
- Fix: check for syntax errors.

### 3. .env file
- Pass if `.env` exists at cwd.
- Fix: `cp .env.example .env  then fill in your keys`.
- (Non-fatal — env vars can come from shell.)

### 4. vault_root configured
- Resolve: `process.env.ONYX_VAULT_ROOT` ?? `config.vault_root` ?? `config.vaultRoot`.
- Pass if resolved value is non-empty.
- Fix: set in `.env` or `onyx.config.json`.

### 5. vault_root exists on disk
- Pass if the resolved path exists as a directory.
- Fix: `mkdir -p "<vault_root>"`.

### 5b. Vault write access
- Try writing `<vault_root>/.onyx-write-test`, then unlink.
- Pass on success.
- Fix: `ls -la "<vault_root>"` to inspect permissions.

### 6. OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) set
- Either env var present.
- Fix: `OPENROUTER_API_KEY=sk-or-...` in `.env`.

### 6b. OpenRouter key valid (live check)
- If `OPENROUTER_API_KEY` is set, fetch `https://openrouter.ai/api/v1/models` with `Authorization: Bearer <key>`, 5s timeout.
- 200 → ✓ valid.
- Non-200 → ✗ rejected (`<status>`); fix: re-issue at <https://openrouter.ai/keys>.
- Network timeout → ⚠ unknown (warn, non-fatal).

### 7. Agent binary on PATH
- Read `agent_driver` from config (default `claude-code`).
- `cursor`: check `which cursor`. Pass on hit. Fix: install Cursor.
- `claude-code`: check `which claude`. Pass on hit. Fix: `npm install -g @anthropic-ai/claude-code`.

### 7b. Agent authenticated
- Cursor: ⚠ session login used automatically — no programmatic check.
- Claude Code: Pass if `ANTHROPIC_API_KEY` set OR `~/.claude/` contains a `credentials*` / `auth*` / `*.json` file.
- Fix: `claude login` or set `ANTHROPIC_API_KEY` in `.env`.

### 8. Node ≥ 18
- Read `process.versions.node`. Pass if major ≥ 18.
- Fix: upgrade Node from <https://nodejs.org>.

### 9. Dependencies installed
- Pass if `<cwd>/node_modules/fast-glob/` exists.
- Fix: `npm install`.

### 10. Built (`dist/cli/onyx.js` exists)
- Pass if file present.
- Fix: `npm run build`.

### 11. Vault health (only if vault accessible)

11a. **Stuck active phases.** Glob phases tagged `phase-active`. For each, read `locked_at`. If absent OR older than 10 minutes, count as stuck. ⚠ if any.

11b. **Phases missing `project_id`.** Glob all phases; ⚠ if any have neither `project_id` nor `project` frontmatter.

11c. **Phase count.** Always ✓ — informational `<N> phase(s) found`.

### 12. Print + exit

Print `\nonyx doctor\n` header. For each check:
- `  ✓  <label>` (pass)
- `  ⚠  <label>` (warn)
- `  ✗  <label>` (fail) followed by `       Fix: <fix>` if provided.

If all hard checks pass, print:
```
  All checks passed. Ready to run:

    onyx init "My Project"
    onyx run
```

Else: `  Fix the issues above, then run: onyx doctor` and exit 1.

## Post-conditions
- Exit 0 if every non-warn check passed.
- Exit 1 if any hard check failed.
- No vault writes (the `.onyx-write-test` is created+unlinked atomically).

## Skills invoked
None.

## Tools invoked
- `which` (Bash) — agent binary detection.
- `curl` or fetch (network) — OpenRouter live key check.

## Native primitives relied on
- **Bash** — env var reads, file existence, `which`, network probe.
- **Read** — config file content.
- **Write/unlink** — only the temporary `.onyx-write-test`.

## Acceptance (self-check)
- Every check above ran and produced exactly one report row.
- No file in the vault other than the test write was modified.
- Exit code matches the all-pass / any-fail outcome.

## Shadow-mode comparison criteria
**RED:** different number of checks run, different pass/fail/warn classification on the same input, different exit code, missing fix instructions on a failed check.
**YELLOW:** wording of fix instructions varies.
**GREEN:** identical check set + verdicts.

Three GREEN runs across distinct setups (fresh clone / partial / fully-configured) → graduate, delete `src/cli/doctor.ts`.

## Forbidden patterns
- **Never write to the vault** beyond the single-file write test.
- **Never assume** keys are valid without the network check (5b).
- **Never block on the live OpenRouter check** beyond 5s — it's a sanity probe, not a blocker.
