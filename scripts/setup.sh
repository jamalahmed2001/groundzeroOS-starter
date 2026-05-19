#!/usr/bin/env bash
# setup.sh — first-run installer for a fresh ONYX clone.
#
# Idempotent: safe to re-run. Builds every clawd-skill that has a package.json
# + build script, installs the pre-commit hook, and prepares .env from the
# template if you haven't already.
#
# Usage:
#   scripts/setup.sh                # full install
#   scripts/setup.sh --skip-build   # install deps only, skip TypeScript builds
#   scripts/setup.sh --hooks-only   # just install the pre-commit hook
#
# Requires: node ≥ 18, npm. (Some skills work with pnpm too; npm is the lowest
# common denominator.)

set -eo pipefail

ONYX_HOME="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ONYX_HOME"

SKIP_BUILD=0
HOOKS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --hooks-only) HOOKS_ONLY=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0 ;;
  esac
done

log() { printf '[setup] %s\n' "$*"; }

# ── 1. pre-commit hook ────────────────────────────────────────────────────────
log "wiring pre-commit hook (blocks committed secrets)…"
git config core.hooksPath hooks
chmod +x hooks/pre-commit 2>/dev/null || true

if [[ "$HOOKS_ONLY" == "1" ]]; then
  log "hooks-only mode: done."
  exit 0
fi

# ── 2. .env from template ─────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  log ".env created from .env.example — edit it to add your keys before running anything that hits an API"
else
  log ".env already exists — leaving as-is"
fi

# ── 3. top-level deps ─────────────────────────────────────────────────────────
log "installing top-level dependencies…"
npm install --no-audit --no-fund --silent

# ── 4. skills ──────────────────────────────────────────────────────────
log "installing + building skills…"
FAILED=()
for skill_dir in skills/*/; do
  name=$(basename "$skill_dir")
  if [[ ! -f "$skill_dir/package.json" ]]; then
    continue
  fi

  printf '  → %-32s ' "$name"
  pushd "$skill_dir" >/dev/null

  if npm install --no-audit --no-fund --silent >/dev/null 2>&1; then
    if [[ "$SKIP_BUILD" == "0" ]] && grep -q '"build"' package.json; then
      if npm run build --silent >/dev/null 2>&1; then
        echo "ok"
      else
        echo "BUILD FAILED"
        FAILED+=("$name (build)")
      fi
    else
      echo "ok (install only)"
    fi
  else
    echo "INSTALL FAILED"
    FAILED+=("$name (install)")
  fi

  popd >/dev/null
done

# ── 5. bin/onyx executable ────────────────────────────────────────────────────
chmod +x bin/onyx
chmod +x tools/*.sh 2>/dev/null || true

# ── 6. report ─────────────────────────────────────────────────────────────────
echo
if [[ ${#FAILED[@]} -eq 0 ]]; then
  log "✓ all skills installed and built"
else
  log "✗ ${#FAILED[@]} skill(s) failed:"
  for f in "${FAILED[@]}"; do
    echo "    - $f"
  done
  log "  (re-run after fixing, or use --skip-build to defer TS builds)"
fi

cat <<EOF

Next steps:
  1. Edit .env — fill in any keys you actually need (OPENROUTER_API_KEY, LINEAR_API_KEY, etc.)
  2. Point onyx.config.json at your vault (or use the bundled ./vault/)
  3. cd vault && claude          # opens the bundled v2 starter
  4. Tell Claude: execute example-app

See INSTALL.md for the full walkthrough and GETTING_STARTED.md for first-project flow.
EOF
