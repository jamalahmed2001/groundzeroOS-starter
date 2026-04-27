#!/usr/bin/env bash
# shadow-snapshot.sh — capture a phase + its bundle's mutable state for shadow-mode comparison.
#
# Usage:
#   tools/shadow-snapshot.sh <phase-path> <out-dir>
#
# Captures:
#   - the phase file itself
#   - the bundle's Phases/, Logs/, _backups/, _checkpoints/ directories (if present)
#   - the bundle's Knowledge.md and Overview.md (mutable across operations)
#   - the vault's ExecLog.md (system-wide log)
#
# Skips: media outputs (output/, *.mp4, *.png, *.mp3) — too large and not what we're comparing.
#
# Exit:
#   0 on success
#   1 on usage error or missing phase

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: shadow-snapshot.sh <phase-path> <out-dir>" >&2
  exit 1
fi

PHASE_PATH="$1"
OUT_DIR="$2"

if [[ ! -f "$PHASE_PATH" ]]; then
  echo "error: phase file not found: $PHASE_PATH" >&2
  exit 1
fi

# Find the bundle root (phase is usually <bundle>/Phases/PNN.md OR <bundle>/PNN.md)
PHASE_DIR=$(dirname "$PHASE_PATH")
if [[ "$(basename "$PHASE_DIR")" == "Phases" ]]; then
  BUNDLE_ROOT=$(dirname "$PHASE_DIR")
else
  BUNDLE_ROOT="$PHASE_DIR"
fi

# Find vault root (walk up looking for "08 - System")
VAULT_ROOT="$BUNDLE_ROOT"
while [[ "$VAULT_ROOT" != "/" ]]; do
  if [[ -d "$VAULT_ROOT/08 - System" ]]; then break; fi
  VAULT_ROOT=$(dirname "$VAULT_ROOT")
done
if [[ "$VAULT_ROOT" == "/" ]]; then
  echo "error: could not find vault root (no '08 - System' ancestor)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# 1. The phase file
phase_rel=${PHASE_PATH#$VAULT_ROOT/}
mkdir -p "$OUT_DIR/$(dirname "$phase_rel")"
cp "$PHASE_PATH" "$OUT_DIR/$phase_rel"

# 2. Bundle mutable state — markdown only, skip media + output/
bundle_rel=${BUNDLE_ROOT#$VAULT_ROOT/}
for sub in Phases Logs _backups _checkpoints; do
  if [[ -d "$BUNDLE_ROOT/$sub" ]]; then
    mkdir -p "$OUT_DIR/$bundle_rel/$sub"
    find "$BUNDLE_ROOT/$sub" -maxdepth 3 -type f -name "*.md" -print0 \
      | while IFS= read -r -d '' f; do
          rel=${f#$BUNDLE_ROOT/}
          mkdir -p "$OUT_DIR/$bundle_rel/$(dirname "$rel")"
          cp "$f" "$OUT_DIR/$bundle_rel/$rel"
        done
  fi
done

# 3. Bundle root markdown (Overview, Knowledge, hub doc)
for f in "$BUNDLE_ROOT"/*.md; do
  [[ -f "$f" ]] || continue
  cp "$f" "$OUT_DIR/$bundle_rel/"
done

# 4. Vault-wide ExecLog
EXEC_LOG="$VAULT_ROOT/00 - Dashboard/ExecLog.md"
if [[ -f "$EXEC_LOG" ]]; then
  mkdir -p "$OUT_DIR/00 - Dashboard"
  cp "$EXEC_LOG" "$OUT_DIR/00 - Dashboard/ExecLog.md"
fi

# 5. Manifest — for diff-time identification
{
  echo "# shadow-snapshot manifest"
  echo "snapshot_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "phase: $phase_rel"
  echo "bundle: $bundle_rel"
  echo "vault: $VAULT_ROOT"
  echo ""
  echo "# files"
  (cd "$OUT_DIR" && find . -type f | sort)
} > "$OUT_DIR/.shadow-manifest"

echo "snapshot: $OUT_DIR" >&2
echo "phase: $phase_rel" >&2
echo "files: $(find "$OUT_DIR" -type f | wc -l)" >&2
