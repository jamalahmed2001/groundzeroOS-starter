#!/usr/bin/env bash
# shadow-run.sh — orchestrate one shadow-mode comparison for an operation.
#
# Usage:
#   tools/shadow-run.sh <operation> <phase-path>
#
# Operations: atomise | execute | replan | decompose | heal | route | surface-blocker | consolidate
#
# What it does:
#   1. Snapshot pre-state to /tmp/shadow/<run-id>/pre/
#   2. Run TS path against the phase. Snapshot result to /tmp/shadow/<run-id>/ts-end/
#   3. Restore pre-state.
#   4. Print the directive prompt for the operator to run via Claude (or any agent).
#      Wait for ENTER. Operator runs the directive in a fresh agent context, then comes back.
#   5. Snapshot result to /tmp/shadow/<run-id>/directive-end/
#   6. Run shadow-diff. Append result to vault Shadow Logs.
#
# Why not auto-run the directive? Directive execution lives inside an LLM. The harness is
# protocol + plumbing; the LLM call is operator-driven (so the operator picks Claude/Cursor/etc.
# and so the harness stays runtime-agnostic).
#
# Exit codes:
#   0 — GREEN verdict (operation may add this run to its graduation evidence)
#   1 — RED verdict (block — fix the directive before re-running)
#   2 — usage error or aborted

set -euo pipefail

if [[ $# -ne 2 ]]; then
  cat >&2 <<USAGE
usage: shadow-run.sh <operation> <phase-path>

operations:
  atomise | execute | replan | decompose | heal | route | surface-blocker | consolidate

example:
  tools/shadow-run.sh atomise "vault/01 - Projects/Demo/Phases/P1 - Setup.md"
USAGE
  exit 2
fi

OPERATION="$1"
PHASE_PATH="$2"

if [[ ! -f "$PHASE_PATH" ]]; then
  echo "error: phase file not found: $PHASE_PATH" >&2
  exit 2
fi

case "$OPERATION" in
  atomise|execute|replan|decompose|heal|route|surface-blocker|consolidate) ;;
  *) echo "error: unknown operation: $OPERATION" >&2; exit 2 ;;
esac

# Resolve repo + tools paths from this script's location
TOOLS_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(dirname "$TOOLS_DIR")

# Find vault root
PHASE_DIR=$(dirname "$PHASE_PATH")
VAULT_ROOT="$PHASE_DIR"
while [[ "$VAULT_ROOT" != "/" ]]; do
  if [[ -d "$VAULT_ROOT/08 - System" ]]; then break; fi
  VAULT_ROOT=$(dirname "$VAULT_ROOT")
done
if [[ "$VAULT_ROOT" == "/" ]]; then
  echo "error: could not find vault root from $PHASE_PATH" >&2
  exit 2
fi

# Find bundle root
if [[ "$(basename "$PHASE_DIR")" == "Phases" ]]; then
  BUNDLE_ROOT=$(dirname "$PHASE_DIR")
else
  BUNDLE_ROOT="$PHASE_DIR"
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%S)-$OPERATION-$$"
WORKDIR="/tmp/shadow/$RUN_ID"
mkdir -p "$WORKDIR"

echo "=== shadow-run ==="
echo "  operation:  $OPERATION"
echo "  phase:      $PHASE_PATH"
echo "  vault:      $VAULT_ROOT"
echo "  bundle:     $BUNDLE_ROOT"
echo "  workdir:    $WORKDIR"
echo "  run_id:     $RUN_ID"
echo ""

# Step 1 — pre-state snapshot
echo "[1/6] Snapshotting pre-state..."
"$TOOLS_DIR/shadow-snapshot.sh" "$PHASE_PATH" "$WORKDIR/pre" >/dev/null

# Step 2 — TS path
echo "[2/6] Running TS path: $OPERATION..."
ts_cmd=""
case "$OPERATION" in
  atomise)
    project=$(grep -m1 '^project_id:' "$PHASE_PATH" | sed 's/project_id: *//; s/[\"'"'"']//g' || true)
    phase_num=$(basename "$PHASE_PATH" | grep -oE '^P[0-9]+' | sed 's/P//' || true)
    if [[ -n "$project" && -n "$phase_num" ]]; then
      ts_cmd="onyx atomise \"$project\" $phase_num"
    fi ;;
  execute)
    ts_cmd="onyx run --once" ;;
  replan)
    project=$(grep -m1 '^project_id:' "$PHASE_PATH" | sed 's/project_id: *//; s/[\"'"'"']//g' || true)
    [[ -n "$project" ]] && ts_cmd="onyx replan \"$project\"" ;;
  consolidate)
    project=$(grep -m1 '^project_id:' "$PHASE_PATH" | sed 's/project_id: *//; s/[\"'"'"']//g' || true)
    [[ -n "$project" ]] && ts_cmd="onyx consolidate \"$project\"" ;;
  heal)
    ts_cmd="onyx heal" ;;
  decompose)
    ts_cmd="(operator: run \`onyx plan \"<project>\"\` manually for the project containing this phase)" ;;
  route|surface-blocker)
    ts_cmd="(no direct CLI — exercised via \`onyx run\`)" ;;
esac

if [[ -z "$ts_cmd" || "$ts_cmd" == \(* ]]; then
  echo "  (No automatable TS command for $OPERATION on this phase. Skipping TS run.)"
  echo "  Operator: $ts_cmd"
  read -r -p "  Press ENTER once you've run the TS path manually (or Ctrl-C to abort)..."
else
  echo "  command: $ts_cmd"
  read -r -p "  Press ENTER to execute, or 'm' to run manually then ENTER: " choice
  if [[ "$choice" != "m" ]]; then
    (cd "$REPO_ROOT" && eval "$ts_cmd") || echo "  (TS run exited non-zero — recording state anyway)"
  fi
fi

# Step 2.5 — TS-end snapshot
echo "[3/6] Snapshotting TS-end state..."
"$TOOLS_DIR/shadow-snapshot.sh" "$PHASE_PATH" "$WORKDIR/ts-end" >/dev/null

# Step 3 — restore pre-state
echo "[4/6] Restoring pre-state for directive run..."
restore_files=$(cd "$WORKDIR/pre" && find . -type f ! -name '.shadow-manifest')
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#./}"
  cp "$WORKDIR/pre/$rel" "$VAULT_ROOT/$rel"
done <<< "$restore_files"
echo "  restored $(echo "$restore_files" | wc -l) file(s)"

# Step 4 — directive prompt
echo ""
echo "[5/6] DIRECTIVE RUN — operator action required"
echo ""
cat <<EOF
Open the operation directive at:
  $VAULT_ROOT/08 - System/Operations/$OPERATION.md

Then run a fresh agent (Claude / Cursor / etc.) with this prompt:

---
You are running the $OPERATION operation per the directive at
\`08 - System/Operations/$OPERATION.md\`.

Target phase: \`$PHASE_PATH\`

Read the directive end to end. Follow its Procedure section exactly.
Do not call into any TS tooling — only the agent-native primitives the
directive lists. When you finish, do NOT report — just complete the
work in the vault.
---

When the directive run is complete, return here.
EOF
echo ""
read -r -p "Press ENTER once the directive run has finished (or 'a' to abort)..." done_choice
if [[ "$done_choice" == "a" ]]; then
  echo "Aborted. Pre-state was restored before the directive run; no further restore needed."
  exit 2
fi

# Step 5 — directive-end snapshot
echo "[6/6] Snapshotting directive-end state and diffing..."
"$TOOLS_DIR/shadow-snapshot.sh" "$PHASE_PATH" "$WORKDIR/directive-end" >/dev/null

# Step 6 — diff + log
DIFF_OUT="$WORKDIR/diff.txt"
verdict=0
"$TOOLS_DIR/shadow-diff.sh" "$WORKDIR/ts-end" "$WORKDIR/directive-end" --operation "$OPERATION" \
  > "$DIFF_OUT" 2>&1 || verdict=$?

cat "$DIFF_OUT"

# Append to vault Shadow Logs
SHADOW_LOG_DIR="$VAULT_ROOT/08 - System/Shadow Logs"
mkdir -p "$SHADOW_LOG_DIR"
LOG_FILE="$SHADOW_LOG_DIR/$OPERATION.md"
if [[ ! -f "$LOG_FILE" ]]; then
  cat > "$LOG_FILE" <<HEADER
---
title: Shadow Log — $OPERATION
type: shadow-log
operation: $OPERATION
tags: [shadow-log, system, onyx]
up: Shadow Logs Hub
---

## 🔗 Navigation

**UP:** [[08 - System/Shadow Logs/Shadow Logs Hub.md|Shadow Logs Hub]]

# Shadow Log — $OPERATION

> Each row records one shadow comparison between the TS path and the directive path. After 7 consecutive GREEN runs across distinct phases, the operation may graduate to \`status: active\` and its TS source can be deleted.

| Date | Run ID | Phase | Verdict | Notes |
|---|---|---|---|---|
HEADER
fi

# Restore TS-end state (so the operator's vault is in the post-op state, not pre)
echo ""
echo "Restoring TS-end state to vault (so vault is in canonical post-op shape)..."
restore_files=$(cd "$WORKDIR/ts-end" && find . -type f ! -name '.shadow-manifest')
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#./}"
  cp "$WORKDIR/ts-end/$rel" "$VAULT_ROOT/$rel"
done <<< "$restore_files"

# Append log row
verdict_str="GREEN"
[[ $verdict -ne 0 ]] && verdict_str="RED"

ts_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
phase_rel=${PHASE_PATH#$VAULT_ROOT/}
echo "| $ts_iso | $RUN_ID | \`$phase_rel\` | **$verdict_str** | [diff]($WORKDIR/diff.txt) |" >> "$LOG_FILE"

echo ""
echo "Shadow log: $LOG_FILE"
echo "Workdir:    $WORKDIR"
exit $verdict
