---
type: skills-index
tags: [system, skills]
created: 2026-03-30
---
## 🔗 Navigation

- [[AGENTS|Agent Rules]]

# Skills Index

All agent skills available in this ONYX installation. Each skill is a composable capability invoked by the controller or manually via its SKILL.md.

---

## Controller Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| onyx-controller | `onyx run` | Main orchestration loop: heal → graph → discover → route → act |
| drift-scan | `onyx heal` | Detect vault drift (stale locks, tag mismatches) without touching notes |
| safe-repair | `onyx heal` | Apply deterministic fixes to detected drift |
| init-bundle | `onyx init` | Create a new project bundle with full hub structure |

## Planning Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| phase-planner | auto (P1) | Break project overview into numbered phases |
| atomiser | auto (P2) | Break a phase into 6–12 atomic executable tasks |
| consolidator | auto (P3) | Extract learnings after phase completion → Knowledge.md |
| daily-planner | `onyx daily-plan` | Generate today's time-blocked daily plan |

## Execution Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| phase-executor | auto | Lock phase → run agent per task → release |
| claude-code-spawn | auto | Spawn Claude Code CLI as the agent driver |
| cursor-spawn | (config) | Spawn Cursor Composer as the agent driver |

## Integration Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| linear-import | `onyx import <id>` | Import Linear project → vault bundle |
| linear-uplink | auto (post-atomise) | Sync vault phases back to Linear |
| notify-phase | auto | Emit notifications on every controller action |

---

## Agent Driver Selection

Set in `onyx.config.json`:
```json
{ "agent_driver": "claude-code" }
```
Switch to `"cursor"` to use Cursor Composer instead. The executor calls `runAgent()` — same interface regardless of driver.

## Memory System

The vault IS the memory:
- **Repo Context** — per-project stack, key areas, constraints (read by executor before every agent spawn)
- **Knowledge.md** — per-project learnings (written by consolidator after each phase)
- **Cross-Project Knowledge** — universal patterns across all projects (`vault/08 - System/Cross-Project Knowledge.md`)
- **Daily plans** — time-blocked daily work log (`vault/00 - Dashboard/Daily/`)
