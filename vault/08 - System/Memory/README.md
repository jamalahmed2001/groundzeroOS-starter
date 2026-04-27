---
tags: [system, memory, onyx]
type: guide
up: System Hub
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]

# Memory — How ONYX Persists What Matters

> ONYX has three places to remember things across sessions: **Memory**, **Cross-Project Knowledge**, and **Principles**. They look superficially similar (all are markdown that the agent re-reads in future sessions) but they live on different timescales and play different roles. This guide pins the differences so you don't put the wrong thing in the wrong place.

---

## The decision tree

When the agent learns something it might want later, the question is *where* to write it:

```
Will this matter past the current task?
│
├── No  → it goes in a Plan or a Task. Discarded when the task ends.
│
└── Yes → Will this be true on a fresh project tomorrow,
          on the same machine, for me?
          │
          ├── No  → just this session: Plan or Task is still right.
          │
          └── Yes → Is this true for any user running the framework,
                    or just for me on my projects?
                    │
                    ├── Just me (or just this codebase / vault)
                    │   │
                    │   ├── Is it specific to one project?
                    │   │   │
                    │   │   ├── Yes → project Knowledge.md
                    │   │   │
                    │   │   └── No → Cross-Project Knowledge.md
                    │   │           (operator-specific accreted wisdom)
                    │   │
                    │   └── Or is it about ME (preferences,
                    │       collaboration style, recurring requests)?
                    │       └── Memory (per-machine, per-agent)
                    │
                    └── Anyone running the framework
                        │
                        └── Principles (framework-canonical, ships with ONYX,
                            graduated via PR)
```

## The four stores

### 1. Plans and Tasks (in-session state)

- **Lifetime:** the current task. Discarded when complete.
- **What goes there:** what files I've read, what I tried, what's next, what I'm waiting on.
- **Where it lives:** the agent's plan / task list inside the current session.
- **Use when:** you'd be embarrassed if a future you saw this. (Half-finished thoughts, midstream debugging notes, current-step reasoning.)

### 2. Memory (per-agent, per-machine)

- **Lifetime:** persists across sessions until removed.
- **What goes there:** facts about the *user* (preferences, role, project context, collaboration style), behaviours the user has corrected or confirmed, references to where information lives in external systems.
- **Where it lives:** the agent's memory store (e.g. `~/.claude/projects/<project>/memory/`).
- **Use when:** the next session, with a fresh context window, would behave better if it knew this. *"This user prefers terse responses." "This codebase uses snake_case." "Don't open a PR without asking — they review locally first."*

### 3. Cross-Project Knowledge (per-vault, per-operator)

- **Lifetime:** persists for as long as the vault exists; lifted from project Knowledge.md by `consolidate`.
- **What goes there:** patterns that have proven themselves across more than one of *your* projects but are still specific to your work or your taste.
- **Where it lives:** [[08 - System/Cross-Project Knowledge.md|Cross-Project Knowledge.md]] in this vault.
- **Use when:** you've now made the same call twice across different projects and want future-you to make it without re-thinking. *"For server-side migrations on this stack, always run a backfill before the schema change." "For my podcast pipeline, never auto-publish to RSS without manual approval."*

### 4. Principles (framework-canonical)

- **Lifetime:** ships with ONYX; the same set for every user.
- **What goes there:** rules that hold for any user running the framework — distilled from broad multi-operator experience, accepted via PR.
- **Where it lives:** [[08 - System/Principles/Principles Hub.md|Principles Hub]].
- **Use when:** never directly. You don't write principles in the course of work — you propose them via PR after a Cross-Project Knowledge entry has proven itself broadly.

## How entries graduate

```
Plan/Task  ──>  (discarded)

Plan/Task  ──>  Memory                  (when it should change future behaviour)

Project Knowledge  ──>  Cross-Project Knowledge   (consolidate proposes; you accept)

Cross-Project Knowledge  ──>  Principles          (PR; framework maintainer accepts)
```

The graduation chain has two checkpoints, not one. Most things stay in project Knowledge. A few cross over to Cross-Project Knowledge. A very few rise to Principles.

## When in doubt

If you're not sure whether something belongs in Memory or Cross-Project Knowledge:

- **Is it about the user?** (Their role, preferences, collaboration style.) → Memory.
- **Is it about the work?** (A pattern, a stack convention, a domain rule.) → Project Knowledge or Cross-Project Knowledge, depending on scope.

If you're not sure whether something belongs in Cross-Project Knowledge or Principles:

- **Would another operator running ONYX nod and say "yes, that's how I do it too"?** → Principles candidate (propose via PR).
- **Would another operator say "that's specific to your stack / your domain / your taste"?** → Cross-Project Knowledge.

## What NOT to put in any of these stores

- **Code patterns and architecture.** The code is the source of truth.
- **Git history and recent changes.** `git log` / `git blame` are authoritative.
- **Debugging fix recipes.** The fix is in the code; the commit message has the context.
- **Anything documented in CLAUDE.md or README.md.** Don't duplicate.
- **Ephemeral task state.** That's what plans and tasks are for.

These exclusions hold even if you're tempted to "save it just in case."

---

## See also

- [[08 - System/Memory/MEMORY-template.md|Memory Index Template]] — shape for the per-machine memory index
- [[08 - System/Memory/_examples/user_role.md|Memory Entry Examples]] — three example feedback entries showing the canonical format
- [[08 - System/Cross-Project Knowledge.md|Cross-Project Knowledge]] — the operator-specific store
- [[08 - System/Principles/Principles Hub.md|Principles Hub]] — the framework-canonical store
