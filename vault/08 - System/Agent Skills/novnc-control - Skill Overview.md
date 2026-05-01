---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: novnc-control
source_skill_path: ~/clawd/skills/novnc-control/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# novnc-control

> Start, stop, or restart the noVNC + x11vnc desktop server on this machine. Use when the user asks to open the remote desktop, start/stop/restart VNC/noVNC, or debug why the web VNC UI is not reachable.

# noVNC Control Skill

This skill manages the local noVNC + x11vnc setup using the existing helper scripts in the workspace root.

## Scripts

The machine already has these scripts in `<home>/clawd`:

- `start-novnc.sh` – starts x11vnc on port 5900 and noVNC/websockify on port 8081
- `stop-novnc.sh` – stops the running x11vnc and noVNC processes
- `setup-novnc.sh` – initial setup; only needed when installing/updating the stack

Do **not** move or rename these scripts; other docs may reference them.

## When to Use This Skill

Trigger this skill when the user says things like:
- "Start noVNC" / "open the remote desktop" / "start VNC"
- "Stop noVNC" / "shut down the VNC server"
- "Restart noVNC" / "VNC isn't loading" / "I can't reach the VNC page"

## Operational Rules

1. **Start server**
   - Run from workspace root:
     - `cd <home>/clawd && ./start-novnc.sh`
   - After starting, parse the script output and report back:
     - Web URL (e.g. `http://<LAN-IP>:8081/vnc.html`)
     - VNC password
     - Native VNC URL (e.g. `vnc://<LAN-IP>:5900`)

2. **Stop server**
   - Run:
     - `cd <home>/clawd && ./stop-novnc.sh`
   - If the script reports missing PID files or no running server, explain that noVNC/x11vnc were already stopped.

3. **Restart server**
   - Sequentially:
     1. `cd <home>/clawd && ./stop-novnc.sh`
     2. `cd <home>/clawd && ./start-novnc.sh`
   - Then report the new connection details as in step 1.

4. **Diagnostics if start fails**
   If `start-novnc.sh` exits with an error:
   - Capture and summarize stderr/stdout.
   - Check for common problems:
     - Port already in use (5900 or 8081)
     - Missing x11vnc/noVNC binaries
     - DISPLAY not available
   - Suggest concrete fixes based on the error message (e.g., killing stale processes, installing packages, or re-running `setup-novnc.sh`).

5. **Never expose logs/paths verbosely**
   - It is fine to mention high-level log locations (e.g. `/tmp/novnc/x11vnc.log`) but avoid dumping large log contents unless the user explicitly asks.

## Interaction Pattern

- Be concise: confirm actions and provide just the details needed to connect.
- Default to **start** when the user says "open" or "turn on" noVNC.
- Ask a quick clarification if the user’s intent is ambiguous between start vs stop.
