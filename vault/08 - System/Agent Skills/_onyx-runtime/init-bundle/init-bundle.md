# M1 — Init Bundle

## Purpose
Create a new project bundle with the correct folder structure.

## When to invoke
```bash
npm run onyx:init -- "Project Name"
```

## What it creates
```
01 - Projects/Project Name/
├── Project Name - Overview.md     (human anchor — fill in your goal)
├── Project Name - Knowledge.md    (empty — consolidator appends here)
├── Project Name - Kanban.md       (empty — shows WIP)
├── Phases/                         (phases go here — planner or human creates)
└── Logs/                           (log notes go here — executor creates)
```

## Rules
- Never overwrite existing content
- Create missing files/folders only
- Uses Phase Note Template and Log Note Template from `08 - System/Agent Directives/Templates/`

## Next step after init
Open `Project Name - Overview.md` and write your goal, scope, and why.
Then run `npm run onyx:run` — the controller will detect no phases exist and invoke P1 Phase Planner.
