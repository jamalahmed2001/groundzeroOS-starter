---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: whatsapp-patch
source_skill_path: ~/clawd/skills/whatsapp-patch/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# whatsapp-patch

> Diagnose and patch OpenClaw WhatsApp "No active Web listener" bugs by inspecting the installed gateway dist/, locating active listener registries, and applying a globalThis singleton fix. Supports dry-run and rollback.

# WhatsApp Patch Skill (Active Listener Singleton)

## Purpose

This skill automates the diagnosis and patching of the WhatsApp **"No active WhatsApp Web listener (account: default)"** bug caused by **duplicated active listener maps across dist bundles** in some OpenClaw gateway builds.

It is designed for your current setup:

- Global npm/pnpm install at: `<home>/.npm-global/lib/node_modules/openclaw`
- Gateway dist at: `<home>/.npm-global/lib/node_modules/openclaw/dist`

It:
- Backs up `dist/` (timestamped) before any change
- Locates the true listener map implementations in `dist/*` (not just `active-listener-*.js`)
- Optionally patches them to use a **globalThis singleton** so all chunks share one listener Map
- Verifies the patch landed
- Leaves restart/relogin + testing to the user

## When to Use

Use this skill when:

- `openclaw message send` fails with:
  - `No active WhatsApp Web listener (account: default)`
- `openclaw channels status --channel whatsapp --account default --probe` still reports `linked / running / connected`
- You’re running a Linux global install similar to:
  - `<home>/.npm-global/lib/node_modules/openclaw`

## Safety

- Always backs up `dist/` to `dist.bak.YYYYMMDD-HHMMSS` before patching.
- Can be run in **diagnose-only** mode to just report targets and show what would be changed.
- Patch is version-specific: it should be re-applied after any OpenClaw upgrade that overwrites `dist/`.

---

## Implementation Notes (Current Operator Setup)

### Install root

- CLI: `<home>/.npm-global/bin/openclaw`
- Package root: `<home>/.npm-global/lib/node_modules/openclaw`
- Dist: `<home>/.npm-global/lib/node_modules/openclaw/dist`

### Target bundles for listener singleton

On the current build, the active listener registry is inlined into these bundles:

- `dist/model-selection-46xMp11W.js`
- `dist/model-selection-CU2b7bN6.js`
- `dist/discord-CcCLMjHw.js`
- `dist/reply-Bm8VrLQh.js`
- `dist/auth-profiles-DDVivXkv.js`
- `dist/auth-profiles-DRjqKE3G.js`
- `dist/plugin-sdk/thread-bindings-SYAnWHuW.js`

Each contains:

```js
//#region src/web/active-listener.ts
const listeners = /* @__PURE__ */ new Map();
function resolveWebAccountId(accountId) { ... }
function requireActiveWebLis...
```

The bug arises because multiple chunks each get their own `listeners = new Map()`, and `setActiveWebListener` / `getActiveWebListener` can read/write different Maps across reconnect paths.

### Patch Strategy

Replace the local `listeners` Map in those bundles with a global singleton:

```js
const listeners = globalThis.__activeWebListeners || (globalThis.__activeWebListeners = new Map());
```

This ensures all chunks read/write the *same* Map via `globalThis.__activeWebListeners`, matching the workaround described in GitHub issues #34741/#47433.

---

## CLI Workflow

> **Note:** These commands assume the current global install path. If OpenClaw is installed elsewhere or in Docker, paths must be adapted.

### 1. Backup dist

```bash
cd <home>/.npm-global/lib/node_modules/openclaw
cp -a dist dist.bak.$(date +%Y%m%d-%H%M%S)
```

### 2. Diagnose (confirm targets)

```bash
cd <home>/.npm-global/lib/node_modules/openclaw

# Where the error & helpers live
grep -RIl "No active WhatsApp Web listener" dist
grep -RIl "setActiveWebListener" dist
grep -RIl "getActiveWebListener" dist
```

Expected key files (current build):

- `dist/model-selection-46xMp11W.js`
- `dist/model-selection-CU2b7bN6.js`
- `dist/discord-CcCLMjHw.js`
- `dist/reply-Bm8VrLQh.js`
- `dist/auth-profiles-DDVivXkv.js`
- `dist/auth-profiles-DRjqKE3G.js`
- `dist/plugin-sdk/thread-bindings-SYAnWHuW.js`

### 3. Patch listener maps to use globalThis singleton

```bash
cd <home>/.npm-global/lib/node_modules/openclaw

python3 <<'PY'
from pathlib import Path
import re
import sys

targets = [
 Path("dist/model-selection-46xMp11W.js"),
 Path("dist/model-selection-CU2b7bN6.js"),
 Path("dist/discord-CcCLMjHw.js"),
 Path("dist/reply-Bm8VrLQh.js"),
 Path("dist/auth-profiles-DDVivXkv.js"),
 Path("dist/auth-profiles-DRjqKE3G.js"),
 Path("dist/plugin-sdk/thread-bindings-SYAnWHuW.js"),
]

patterns = [
 r"const listeners = (?:/\*\s*@__PURE__\s*\*/\s*)?new Map\(\);",
 r"let listeners = (?:/\*\s*@__PURE__\s*\*/\s*)?new Map\(\);",
 r"var listeners = (?:/\*\s*@__PURE__\s*\*/\s*)?new Map\(\);",
]

replacement = "const listeners = globalThis.__activeWebListeners || (globalThis.__activeWebListeners = new Map());"

patched = []
failed = []

for p in targets:
 s = p.read_text()
 replaced = False

 for pat in patterns:
  s2, n = re.subn(pat, replacement, s, count=1)
  if n == 1:
   s = s2
   replaced = True
   break

 if not replaced:
  failed.append((str(p), "listeners map pattern not found"))
  continue

 if "getActiveWebListener" not in s and "setActiveWebListener" not in s:
  failed.append((str(p), "sanity check failed: active listener helpers missing"))
  continue

 p.write_text(s)
 patched.append(str(p))

print("PATCHED:")
for x in patched:
 print(" -", x)

print("\nFAILED:")
for x, reason in failed:
 print(f" - {x}: {reason}")

if failed:
 sys.exit(1)
PY
```

### 4. Verify patch landed

```bash
cd <home>/.npm-global/lib/node_modules/openclaw

grep -RIn "__activeWebListeners" \
  dist/model-selection-46xMp11W.js \
  dist/model-selection-CU2b7bN6.js \
  dist/discord-CcCLMjHw.js \
  dist/reply-Bm8VrLQh.js \
  dist/auth-profiles-DDVivXkv.js \
  dist/auth-profiles-DRjqKE3G.js \
  dist/plugin-sdk/thread-bindings-SYAnWHuW.js
```

You should see a `const listeners = globalThis.__activeWebListeners || ...` line in each file.

### 5. Restart gateway & test

```bash
openclaw gateway stop
openclaw gateway start

# If needed, re-link local WhatsApp bridge
openclaw channels login --channel whatsapp --account default

# Verify status
openclaw channels status --channel whatsapp --account default --probe

# Test send
openclaw message send --target +447743183601 --message "WhatsApp test after listener singleton patch"
```

Also verify after a health-monitor / reconnect cycle:

- Wait ~20–30 minutes (or whatever your health-monitor interval is).
- Send another CLI WhatsApp message and confirm it succeeds (no `No active WhatsApp Web listener` error).

---

## Rollback

If anything breaks after patching:

```bash
cd <home>/.npm-global/lib/node_modules/openclaw
rm -rf dist
mv "$(ls -dt dist.bak.* | head -n1)" dist
openclaw gateway stop
openclaw gateway start
```

---

## Usage Summary

- **Diagnose only:**
  - Run the `grep` commands to confirm your build exhibits the duplicated listener registry pattern.
- **Apply patch:**
  - Backup `dist/`, run the Python replacement script, verify `__activeWebListeners` appears in all target files, restart gateway, and test sends.
- **After OpenClaw upgrades:**
  - Re-run this skill to inspect and, if necessary, re-apply the singleton patch, as upgrades will overwrite `dist/`.
