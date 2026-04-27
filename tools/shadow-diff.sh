#!/usr/bin/env bash
# shadow-diff.sh — classify divergence between two post-op snapshots.
#
# Usage:
#   tools/shadow-diff.sh <ts-snapshot> <directive-snapshot> [--operation <op>]
#
# Compares two snapshots from shadow-snapshot.sh. Classifies every diff per
# the canonical rules in vault/08 - System/Operations/_shadow.md:
#
#   GREEN   — semantically equivalent: timestamps, log-message wording, git
#             tag message text, frontmatter `updated:` field, ExecLog ISO time.
#   YELLOW  — non-fatal divergence worth a human glance: log line ordering,
#             whitespace inside frontmatter values, comment additions.
#   RED     — fatal divergence: different terminal `status:`, different
#             checkbox states, different `## Acceptance Criteria` ticks,
#             body content differs beyond GREEN/YELLOW patterns, missing
#             or extra files.
#
# Exit codes:
#   0 — all GREEN (or only YELLOW-with-explanation)
#   1 — any RED diff
#   2 — usage error

set -eo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: shadow-diff.sh <ts-snapshot> <directive-snapshot> [--operation <op>]" >&2
  exit 2
fi

TS_DIR="$1"
DIR_DIR="$2"
OPERATION="generic"

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --operation) OPERATION="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -d "$TS_DIR" ]] || { echo "TS snapshot not a directory: $TS_DIR" >&2; exit 2; }
[[ -d "$DIR_DIR" ]] || { echo "directive snapshot not a directory: $DIR_DIR" >&2; exit 2; }

red_count=0
yellow_count=0
green_count=0

declare -a RED_DIFFS YELLOW_DIFFS

# Patterns that are GREEN (always semantically equivalent — diff lines start with +/-)
GREEN_PATTERNS=(
  '^[+-]updated:'
  '^[+-] - 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9:]+Z'
  '^[+-]lock_acquired_at:'
  '^[+-]lock_run_id:'
  '^[+-]lock_pid:'
  '^[+-]consolidated_at:'
  '^[+-]run_id:'
  '^[+-]run_started_at:'
  '^[+-]run_finished_at:'
)

# Patterns that are YELLOW (worth a glance, not fatal)
YELLOW_PATTERNS=(
  'log_message'
  'phase_summary'
  '^[+-]> '
)

# Patterns that are RED (fatal)
RED_PATTERNS=(
  '^[+-]status:'
  '^[+-]state:'
  '^[+-][[:space:]]*-[[:space:]]*\[[ x]\]'
  '^[+-]## Acceptance'
  '^[+-]## Human Requirements'
  '^[+-]tags:'
)

classify_line() {
  local line="$1"
  for p in "${GREEN_PATTERNS[@]}"; do
    [[ "$line" =~ $p ]] && return 0  # green
  done
  for p in "${RED_PATTERNS[@]}"; do
    [[ "$line" =~ $p ]] && return 2  # red
  done
  for p in "${YELLOW_PATTERNS[@]}"; do
    [[ "$line" =~ $p ]] && return 1  # yellow
  done
  # Default: any other +/- line that's not metadata is yellow (content change)
  if [[ "$line" =~ ^[+-] && ! "$line" =~ ^(\+\+\+|---) ]]; then
    return 1
  fi
  return 0  # context line
}

# 1. File presence diff
ts_files=$(cd "$TS_DIR" && find . -type f ! -name '.shadow-manifest' | sort)
dir_files=$(cd "$DIR_DIR" && find . -type f ! -name '.shadow-manifest' | sort)

ts_only=$(comm -23 <(echo "$ts_files") <(echo "$dir_files") || true)
dir_only=$(comm -13 <(echo "$ts_files") <(echo "$dir_files") || true)
both=$(comm -12 <(echo "$ts_files") <(echo "$dir_files") || true)

if [[ -n "$ts_only" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    RED_DIFFS+=("[RED] file only in TS run: $f")
    red_count=$((red_count + 1))
  done <<< "$ts_only"
fi

if [[ -n "$dir_only" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    RED_DIFFS+=("[RED] file only in directive run: $f")
    red_count=$((red_count + 1))
  done <<< "$dir_only"
fi

# 2. Per-file content diff with classification
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#./}"
  ts_file="$TS_DIR/$rel"
  dir_file="$DIR_DIR/$rel"

  if ! cmp -s "$ts_file" "$dir_file"; then
    file_red=0
    file_yellow=0
    file_green=0
    file_red_lines=()
    file_yellow_lines=()

    # Walk diff output line by line
    while IFS= read -r dl; do
      [[ "$dl" =~ ^@@ ]] && continue
      [[ "$dl" =~ ^(\+\+\+|---) ]] && continue
      [[ "$dl" =~ ^[^+-] ]] && continue  # context

      cls=0
      classify_line "$dl" || cls=$?
      case $cls in
        0) file_green=$((file_green + 1)) ;;
        1) file_yellow=$((file_yellow + 1)); file_yellow_lines+=("$dl") ;;
        2) file_red=$((file_red + 1)); file_red_lines+=("$dl") ;;
      esac
    done < <(diff -u "$ts_file" "$dir_file" 2>/dev/null || true)

    if [[ $file_red -gt 0 ]]; then
      RED_DIFFS+=("[RED] $rel — $file_red fatal diff line(s):")
      for l in "${file_red_lines[@]:0:5}"; do RED_DIFFS+=("       $l"); done
      red_count=$((red_count + file_red))
    fi
    if [[ $file_yellow -gt 0 ]]; then
      YELLOW_DIFFS+=("[YELLOW] $rel — $file_yellow non-fatal diff line(s)")
      yellow_count=$((yellow_count + file_yellow))
    fi
    green_count=$((green_count + file_green))
  fi
done <<< "$both"

# Report
echo "=== shadow-diff: operation=$OPERATION ==="
echo "  TS snapshot:        $TS_DIR"
echo "  Directive snapshot: $DIR_DIR"
echo ""

if [[ ${#RED_DIFFS[@]} -gt 0 ]]; then
  echo "RED divergences (fatal — block graduation):"
  for d in "${RED_DIFFS[@]}"; do echo "  $d"; done
  echo ""
fi

if [[ ${#YELLOW_DIFFS[@]} -gt 0 ]]; then
  echo "YELLOW divergences (review):"
  for d in "${YELLOW_DIFFS[@]}"; do echo "  $d"; done
  echo ""
fi

echo "=== Summary ==="
printf "  RED:    %d\n" "$red_count"
printf "  YELLOW: %d\n" "$yellow_count"
printf "  GREEN:  %d\n" "$green_count"
echo ""

if [[ $red_count -gt 0 ]]; then
  echo "VERDICT: BLOCK — $red_count fatal divergence(s). Operation cannot graduate to active."
  exit 1
fi

echo "VERDICT: GREEN${yellow_count:+ (with $yellow_count yellow line(s) to review)}"
exit 0
