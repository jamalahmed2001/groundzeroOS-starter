#!/usr/bin/env bash
# Sets up MediaPipe hand-tracking assets for the ONYX dashboard.
# Run once after `npm install` / `pnpm install`:
#   bash scripts/setup-hand-tracking.sh
set -e

WASM_SRC="node_modules/@mediapipe/tasks-vision/wasm"
WASM_DST="public/mediapipe/wasm"
MODEL_DST="public/mediapipe/hand_landmarker.task"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

# ── 1. WASM files (copied from node_modules — no network needed) ────────────
if [ ! -d "$WASM_SRC" ]; then
  echo "ERROR: $WASM_SRC not found. Run 'npm install' first." >&2
  exit 1
fi

echo "Copying WASM files from $WASM_SRC …"
mkdir -p "$WASM_DST"
cp "$WASM_SRC"/*.js  "$WASM_DST"/
cp "$WASM_SRC"/*.wasm "$WASM_DST"/
echo "  ✓ $(ls "$WASM_DST" | wc -l | tr -d ' ') files → $WASM_DST"

# ── 2. Hand landmark model (~7.5 MB, downloaded once from Google Storage) ───
if [ -f "$MODEL_DST" ]; then
  echo "  ✓ Model already present at $MODEL_DST — skipping download."
else
  echo "Downloading hand landmarker model (~7.5 MB) …"
  mkdir -p "$(dirname "$MODEL_DST")"
  if command -v curl &>/dev/null; then
    curl -fL --progress-bar -o "$MODEL_DST" "$MODEL_URL"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress -O "$MODEL_DST" "$MODEL_URL"
  else
    echo "ERROR: curl or wget required to download the model." >&2
    exit 1
  fi
  echo "  ✓ Model saved to $MODEL_DST"
fi

# ── 3. HTTPS certificates for hand-tracking (requires secure context) ───────
CERT_DIR="certificates"
if [ -f "$CERT_DIR/dev-cert.pem" ]; then
  echo "  ✓ Certificates already present in $CERT_DIR — skipping."
else
  echo "Generating self-signed HTTPS certificate …"
  mkdir -p "$CERT_DIR"
  # Detect local IP for SAN (best-effort; falls back to localhost-only)
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}') || LOCAL_IP=""
  SAN="DNS:localhost,IP:127.0.0.1"
  [ -n "$LOCAL_IP" ] && SAN="$SAN,IP:$LOCAL_IP"
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "$CERT_DIR/dev-key.pem" \
    -out    "$CERT_DIR/dev-cert.pem" \
    -subj   "/CN=localhost" \
    -addext "subjectAltName=$SAN" \
    2>/dev/null
  echo "  ✓ Certificate → $CERT_DIR/dev-cert.pem"
  echo "  ✓ Key         → $CERT_DIR/dev-key.pem"
  [ -n "$LOCAL_IP" ] && echo "  ✓ SAN includes $LOCAL_IP (access from LAN devices)"
  echo ""
  echo "  NOTE: Your browser will show a security warning for this"
  echo "  self-signed cert. Click 'Advanced → Proceed' to accept it."
fi

echo ""
echo "Hand-tracking setup complete. Run 'pnpm dev' (or 'npm run dev') to start."
