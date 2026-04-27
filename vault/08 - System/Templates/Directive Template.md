<!--
TEMPLATE: Directive

Copy to: 08 - System/Agent Directives/<directive-name>.md  (universal role)
   OR    01 - Projects/<Project Name>/Directives/<directive-name>.md  (project-specific role)

Universal directives are shared across projects. Project-specific directives
encode the unique conventions of one project (a particular voice, a brand
sigil, a domain-specific QC rule). Don't put project specifics in a universal
directive — split it.

One directive per ROLE, not per phase. If two phases use the same persona,
they share one directive file.
-->
---
name: <directive-name>
type: directive
profile: <which profile this directive belongs to — e.g. content, engineering>
status: <draft | active | deprecated>
version: 1
tags:
  - directive
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
up: <Agent Directives Hub | <Project> - Directives Hub>
---
## 🔗 Navigation

**UP:** [[<the parent hub>]]

# Directive: <Directive Title>

## Role

You are the **<role title>**. <One sentence: what you turn into what.>

<One paragraph: the persona — voice, taste, default register, what this role cares about.>

---

## Read first (in order)

1. <input file 1 — e.g. the upstream phase output>
2. <input file 2 — e.g. the project's Knowledge.md>
3. <input file 3 — e.g. the relevant Principles>

---

## Voice & safety constraints

Non-negotiable:

- <constraint — e.g. "never prescribe medication" / "never ship without tests">
- <constraint>
- <constraint>

If any of these are violated by what you're about to produce, stop and surface a blocker rather than ship.

---

## What you produce

<Specify exactly. File path, format, sections, frontmatter shape. The agent should be able to write the artefact directly from this spec without inventing structure.>

---

## Forbidden patterns

- <pattern that's been tried before and failed — encode the lesson here>
- <pattern>

---

## Length / format target

- <if applicable: word count, segment count, time target>

---

## Phase completion

**`## Human Requirements` rule — non-negotiable:**

- **Clean run:** Write ONLY `<!-- None — phase completed successfully -->` in the `## Human Requirements` section.
- **Blocked run:** Brief description of the blocking condition.

Any text outside an HTML comment in `## Human Requirements` triggers a human-review block.
