#!/usr/bin/env bash
# heal-scan.sh — fast diagnostics for two heal-* skills:
#   1. heal-fractal-links Rule 1 (orphans — files missing `up:`)
#   2. heal-cross-link (system ↔ bundle and bundle ↔ bundle wikilinks)
#
# Mechanical scanner — no auto-fixes. The heal operation directives
# read this output and decide what to apply. Pure diagnostics.
#
# Usage:
#   tools/heal-scan.sh <vault-path> [--orphans-only|--cross-links-only]
#
# Exit codes:
#   0 — clean (no orphans, no cross-links)
#   1 — issues found
#   2 — usage error

set -eo pipefail

VAULT="${1:-}"
MODE="${2:-all}"

if [[ -z "$VAULT" || ! -d "$VAULT" ]]; then
  echo "usage: heal-scan.sh <vault-path> [--orphans-only|--cross-links-only]" >&2
  exit 2
fi

case "$MODE" in
  all|--orphans-only|--cross-links-only) ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac

# Zones: paths under these prefixes count as "system"
SYSTEM_PREFIX="08 - System/"

# Bundle domains — anything under these is bundle territory
BUNDLE_DOMAINS=(
  "01 - Projects/"
  "02 - Fanvue/"
  "03 - Ventures/"
  "10 - OpenClaw/"
)

# Exclusions
EXCLUDE_DIRS=(
  -path "*/_archive/*"
  -path "*/.trash/*"
  -path "*/_drafts/*"
  -path "*/node_modules/*"
  -path "*/.obsidian/*"
  -path "*/.onyx-backups/*"
  -path "*/.onyx-locks/*"
  -path "*/.onyx-checkpoints/*"
  -path "*/.git/*"
)

# Build find-exclude expression: -not \( -path A -o -path B \)
build_excludes() {
  printf -- "-not \\( "
  local first=1
  for e in "${EXCLUDE_DIRS[@]}"; do
    [[ $first -eq 1 ]] && first=0 || printf -- "-o "
    printf -- "%s " "$e"
  done
  printf -- "\\)"
}

orphan_count=0
declare -a ORPHANS
declare -a CROSSLINKS

# === Pass 1: orphans (Rule 1) ===
if [[ "$MODE" == "all" || "$MODE" == "--orphans-only" ]]; then
  while IFS= read -r -d '' f; do
    base=$(basename "$f")
    [[ "$base" =~ ^\._ ]] && continue
    # Skip files that are themselves top-level domain hubs
    rel="${f#$VAULT/}"
    depth=$(echo "$rel" | tr -cd '/' | wc -c)
    if [[ $depth -le 1 ]]; then
      continue
    fi
    # Files in 00 - Dashboard/ root may legitimately have no `up:`
    if [[ "$rel" =~ ^00\ -\ Dashboard/[^/]+\.md$ ]]; then
      continue
    fi
    if ! grep -q "^up:" "$f" 2>/dev/null; then
      ORPHANS+=("$rel")
      orphan_count=$((orphan_count+1))
    fi
  done < <(find "$VAULT" -type f -name "*.md" \
              -not -path "*/_archive/*" \
              -not -path "*/.trash/*" \
              -not -path "*/_drafts/*" \
              -not -path "*/node_modules/*" \
              -not -path "*/.obsidian/*" \
              -not -path "*/.onyx-backups/*" \
              -not -path "*/.onyx-locks/*" \
              -not -path "*/.onyx-checkpoints/*" \
              -not -path "*/.git/*" \
              -print0 2>/dev/null)
fi

# === Pass 2: cross-link wikilinks ===
crosslink_count=0
if [[ "$MODE" == "all" || "$MODE" == "--cross-links-only" ]]; then
  # Heuristic: a wikilink in a bundle file pointing at one of the well-known
  # system directives, or vice versa. Conservative — only flags links to known
  # system-level directive names + cross-domain references.
  KNOWN_SYSTEM_TARGETS=(
    "content-marketer"
    "scene-composer"
    "story-editor"
    "creative-director"
    "launch-ops"
    "engagement-manager"
    "audio-producer"
    "qc-reviewer"
    "legal-researcher"
    "legal-drafter"
    "metadata-curator"
    "research-brief-writer"
    "script-writer"
    "Master Directive"
    "Fractal Linking Convention"
    "Tag Convention"
  )

  pattern="\\[\\["
  pattern+="$(printf '%s\n' "${KNOWN_SYSTEM_TARGETS[@]}" | tr '\n' '|' | sed 's/|$//' | sed 's/|/\\|/g')"
  pattern+="\\b"

  for domain in "${BUNDLE_DOMAINS[@]}"; do
    [[ -d "$VAULT/$domain" ]] || continue
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      file=$(echo "$line" | cut -d: -f1)
      lnum=$(echo "$line" | cut -d: -f2)
      content=$(echo "$line" | cut -d: -f3-)
      rel="${file#$VAULT/}"
      # Skip archives/trash explicitly (grep -r doesn't honour our excludes)
      [[ "$rel" =~ /_archive/ || "$rel" =~ /\.trash/ ]] && continue
      CROSSLINKS+=("$rel:$lnum: $content")
      crosslink_count=$((crosslink_count+1))
    done < <(grep -rnE "$pattern" "$VAULT/$domain" 2>/dev/null || true)
  done
fi

# === Report ===
echo "=== heal-scan: $VAULT ==="
echo

if [[ "$MODE" == "all" || "$MODE" == "--orphans-only" ]]; then
  echo "[Rule 1] Orphans (files missing \`up:\`): $orphan_count"
  if [[ $orphan_count -gt 0 ]]; then
    for o in "${ORPHANS[@]:0:30}"; do echo "  $o"; done
    if [[ ${#ORPHANS[@]} -gt 30 ]]; then
      echo "  ... and $((orphan_count - 30)) more"
    fi
  fi
  echo
fi

if [[ "$MODE" == "all" || "$MODE" == "--cross-links-only" ]]; then
  echo "[Rule cross-link] Bundle wikilinks to system globals: $crosslink_count"
  if [[ $crosslink_count -gt 0 ]]; then
    for c in "${CROSSLINKS[@]:0:30}"; do echo "  $c"; done
    if [[ ${#CROSSLINKS[@]} -gt 30 ]]; then
      echo "  ... and $((crosslink_count - 30)) more"
    fi
  fi
  echo
fi

echo "=== Summary ==="
printf "  Orphans:     %d\n" "$orphan_count"
printf "  Cross-links: %d\n" "$crosslink_count"
echo

total=$((orphan_count + crosslink_count))
if [[ $total -gt 0 ]]; then
  echo "Run heal (Steps 7 + 8 in 08 - System/Operations/heal.md) to apply fixes."
  exit 1
fi

echo "Clean."
exit 0
