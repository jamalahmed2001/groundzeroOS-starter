#!/usr/bin/env bash
# sanitise-vault.sh — flag and optionally strip personal/project identifiers from a path tree
# before it gets committed to a public-facing repo.
#
# Usage:
#   tools/sanitise-vault.sh scan <path>        # report only, exit non-zero on hits
#   tools/sanitise-vault.sh fix  <path>        # apply mechanical replacements + report flagged-only items
#
# Two passes:
#   1. MECHANICAL — exact-string replacements with safe generic substitutes (auto-applied in `fix`)
#   2. FLAGGED    — patterns that need human judgement (always reported, never auto-applied)
#
# The tool intentionally does NOT detect tonal leaks (first-person voice traits, autobiographical
# fragments, distinctive cadence). Those need an LLM-pass review before each content lift.
#
# Exit codes:
#   0 — clean (or fix mode applied successfully)
#   1 — scan mode: at least one hit
#   2 — usage error

set -eo pipefail

MODE="${1:-}"
TARGET="${2:-}"

if [[ -z "$MODE" || -z "$TARGET" ]]; then
  cat <<'USAGE' >&2
Usage: sanitise-vault.sh <scan|fix> <path>

Scans a directory for personal/project identifiers that shouldn't ship to a public repo.

Modes:
  scan   Report hits, exit 1 if any found. No file changes.
  fix    Apply mechanical replacements; report flagged items for human review.

Examples:
  sanitise-vault.sh scan vault/
  sanitise-vault.sh fix  "vault/08 - System/"
USAGE
  exit 2
fi

if [[ ! -e "$TARGET" ]]; then
  echo "error: target not found: $TARGET" >&2
  exit 2
fi

if [[ "$MODE" != "scan" && "$MODE" != "fix" ]]; then
  echo "error: mode must be 'scan' or 'fix'" >&2
  exit 2
fi

# Mechanical pass: exact replacements, safe to auto-apply.
# Format: <pattern>\t<replacement>
# Customise for your own deployment — leave the file empty for a no-op mechanical pass.
read -r -d '' MECHANICAL <<'EOF' || true
EOF

# Flagged pass: patterns that need human judgement, never auto-applied.
# Format: <regex>\t<reason>
# The defaults below catch common secret patterns and operator-memory phrasing.
# Add your own personal identifiers, project codenames, and avatar names locally —
# they should not be checked into a public repository.
read -r -d '' FLAGGED <<'EOF' || true
\b[a-f0-9]{32}\b	possible 32-char hex ID (workspace/voice/account)
sk_[a-zA-Z0-9]{40,}	possible API key
sk-[a-zA-Z0-9]{40,}	possible API key
ghp_[A-Za-z0-9]{36}	GitHub personal access token
xox[baprs]-[A-Za-z0-9-]{10,}	Slack token
AKIA[0-9A-Z]{16}	AWS access key id
§[0-9]{2,}\b	§-numbered cross-ref — verify it points at a real spec, not operator memory
\boperator (said|asked|flagged|wants)\b	operator-memory phrasing — rewrite as general principle
\buser (said|asked|flagged|wants)\b	operator-memory phrasing — rewrite as general principle
EOF

GREP_EXCLUDES=(
  --exclude-dir=.git
  --exclude-dir=node_modules
  --exclude-dir=dist
  --exclude-dir=.next
  --exclude-dir=.cache
  --exclude-dir=.trash
  --exclude-dir=.obsidian
  --exclude-dir=.claude
  --exclude-dir=.onyx-locks
  --exclude-dir=.onyx-checkpoints
  --exclude-dir=.onyx-backups
  --exclude=sanitise-vault.sh
  --exclude=.env
  --exclude=.env.local
  --exclude=.env.*.local
  --exclude=*.lock
  --exclude=package-lock.json
  --exclude=pnpm-lock.yaml
  --binary-files=without-match
)

mech_total=0
flag_total=0

echo "=== Sanitise: $MODE on $TARGET ==="
echo

# Pass 1 — mechanical
echo "[Pass 1] Mechanical replacements"
while IFS=$'\t' read -r pattern replacement; do
  [[ -z "$pattern" ]] && continue
  files=$(grep -rIl "${GREP_EXCLUDES[@]}" -F "$pattern" "$TARGET" 2>/dev/null || true)
  if [[ -n "$files" ]]; then
    count=$(echo "$files" | wc -l)
    printf "  [MECH] %-30s -> %-30s in %d file(s)\n" "$pattern" "$replacement" "$count"
    mech_total=$((mech_total + count))
    if [[ "$MODE" == "fix" ]]; then
      while IFS= read -r f; do
        # Escape `|` (used as sed delim) and `&` in replacement
        esc_pat=$(printf '%s' "$pattern" | sed 's/[][\\.*^$/|]/\\&/g')
        esc_rep=$(printf '%s' "$replacement" | sed 's/[\\&|]/\\&/g')
        sed -i "s|$esc_pat|$esc_rep|g" "$f"
      done <<< "$files"
    fi
  fi
done <<< "$MECHANICAL"
echo

# Pass 2 — flagged
echo "[Pass 2] Flagged patterns (report only, never auto-applied)"
while IFS=$'\t' read -r regex reason; do
  [[ -z "$regex" ]] && continue
  hits=$(grep -rInIE "${GREP_EXCLUDES[@]}" "$regex" "$TARGET" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    count=$(echo "$hits" | wc -l)
    printf "  [FLAG] %-46s (%d hits) — %s\n" "$regex" "$count" "$reason"
    echo "$hits" | head -5 | sed 's/^/         /'
    if [[ "$count" -gt 5 ]]; then
      printf "         ... and %d more\n" "$((count - 5))"
    fi
    flag_total=$((flag_total + count))
  fi
done <<< "$FLAGGED"
echo

echo "=== Summary ==="
printf "  Mechanical hits: %d\n" "$mech_total"
printf "  Flagged hits:    %d\n" "$flag_total"

if [[ "$MODE" == "scan" && ( "$mech_total" -gt 0 || "$flag_total" -gt 0 ) ]]; then
  echo
  echo "Re-run with 'fix' to auto-apply mechanical replacements;"
  echo "handle flagged hits by hand. Tonal leaks (first-person voice,"
  echo "autobiographical fragments, distinctive cadence) are NOT detected"
  echo "and need a human read-through before any content lift."
  exit 1
fi

exit 0
