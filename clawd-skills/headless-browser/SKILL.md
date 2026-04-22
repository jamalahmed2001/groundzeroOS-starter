---
name: headless-browser
description: Launch and control a local headless Chrome instance for screenshots, PDFs, and debugging. Uses the system's /usr/bin/google-chrome in headless mode.
---

# Headless Browser Skill

This skill wraps a simple headless Chrome launcher on this machine using the script:

- `~/clawd/scripts/headless-browser.sh`

Chrome binary:
- `/usr/bin/google-chrome`

## Capabilities

### 1. Start persistent headless Chrome (remote debugging)

Use this when you want a long-lived headless browser for manual or external control.

**Command executed:**
```bash
cd ~/clawd && ./scripts/headless-browser.sh start
```

**Behavior:**
- Starts Chrome headless with:
  - `--headless=new`
  - `--remote-debugging-port=9222`
  - `--disable-gpu`
  - `--user-data-dir=/tmp/headless-chrome-profile`
  - `--no-first-run --no-default-browser-check`
- Prints the Chrome PID to stdout.

When the user asks to "launch headless Chrome" or "start a headless browser", run this command and report:
- That headless Chrome is running
- The remote debugging port: `9222`

### 2. One-shot screenshot of a URL

**Command executed:**
```bash
cd ~/clawd && ./scripts/headless-browser.sh screenshot <url> <out.png>
```

Defaults:
- If `<out.png>` is omitted, the script uses `screenshot.png` in the current directory.

Use this when the user says things like:
- "Take a screenshot of <url> with headless Chrome"
- "Capture the page at <url> as an image"

After running, confirm the output file path, e.g.:
- `Screenshot saved to ~/clawd/screenshot.png`

### 3. One-shot PDF export of a URL

**Command executed:**
```bash
cd ~/clawd && ./scripts/headless-browser.sh pdf <url> <out.pdf>
```

Defaults:
- If `<out.pdf>` is omitted, the script uses `page.pdf` in the current directory.

Use this when the user asks:
- "Save this page as a PDF via headless Chrome"
- "Print <url> to PDF"

After running, confirm the output file path.

## When to Use This Skill

Trigger this skill when the user says things like:
- "Launch a headless Chrome browser"
- "Start headless browser for debugging"
- "Use headless Chrome to screenshot this page"
- "Generate a PDF of this URL in headless mode"

## Safety & Limits

- This skill runs Chrome in **headless mode only**; no visible browser window.
- Remote debugging is exposed only on localhost port 9222; do not tunnel or expose it externally without explicit user instruction.
- Avoid running multiple `start` instances simultaneously; if necessary, ask the user before launching another Chrome PID.

## Interaction Pattern

1. Interpret the user's intent (start vs screenshot vs pdf).
2. Run the appropriate `headless-browser.sh` subcommand from `~/clawd`.
3. Report back succinctly with:
   - For `start`: confirmation + debug port
   - For `screenshot`/`pdf`: confirmation + output path
4. If Chrome is missing or fails to start, surface the error and suggest checking `/usr/bin/google-chrome` installation.
