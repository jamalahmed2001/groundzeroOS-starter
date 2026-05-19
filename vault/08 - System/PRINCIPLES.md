---
type: principles
graph_domain: system
up: "[[System Hub]]"
created: 2026-05-17
updated: 2026-05-17
---

## 🔗 Navigation
**UP:** [[System Hub]]

# ONYX — Principles

> Cross-project wisdom. Read on demand when reasoning about architecture, agent behaviour, or unexpected results. Not a procedure — for procedures see `ONYX v2 Runtime.md`. Compacts per §13 when this file exceeds 250 lines.

---

## Architecture

- **Vault is the only source of truth.** No `state.json`, no Redis, no scratch process state. Status, journals, positions — all derivable from frontmatter or skill outputs.
- **Fractal tree, not spider-web.** One `up:` per file; relationships in frontmatter (`depends_on:`, `based_on:`, `supersedes:`); no body wikilinks across branches. Graph view should look like a branching star.
- **Minimal code, max utility.** Six vault-tracked primitives (Project, Phase, Pipeline, Journal, Knowledge, Log) plus Skills as named external deps. No new category invented without evidence from ≥2 projects.
- **Pluggable backends from day one.** Every multi-provider integration (LLM, DNS, publishing, music gen) ships with a `pickProvider()` dispatch and at least one stub beyond the default.
- **Phase ≠ Pipeline.** Phase changes the system once and reaches `done`. Pipeline defines repeatable work and never reaches `done` — only `active | paused | retired`.
- **Phases orchestrate; skills execute; roles constrain.** Mixing collapses debugging into archaeology.
- **Claude is the runtime; skills are the I/O.** Pure "read vault → decide → write vault" loops are agent-native. Only skills that make real API calls, run ffmpeg, drive browsers, or do heavy compute need code.

---

## Skills & browser automation

- **No paid third-party gateways when the user's own session exists.** Drive their web UI under their session — free, legitimate, licence-clear.
- **CDP attach beats Playwright persistent profiles** for Clerk-protected services. Re-sign-in via `launchPersistentContext` invalidates prior sessions.
- **Always `browser.close()` in `finally` for CDP-attach mode.** The WebSocket pins the Node event loop. Close only disconnects from a CDP-attached Chrome — doesn't kill the user's browser.
- **Sniff real endpoints before building DOM-driven recipes.** Ten minutes capturing the UI's API calls saves hours of selector maintenance. Graduation path: DOM → network capture → direct HTTP.
- **Prefer `page.evaluate(fetch(...))` over `ctx.context.request`** for Clerk-authed calls — runs in-origin with the SDK's auto-injected Bearer header.
- **Browser automation is fragile.** Use official APIs where available. Don't scale to high volume — it invites account termination. Expect to re-sniff endpoints every few months.
- **Never auto-submit paid actions.** Leave wizards at the review step. A DistroKid release, a Spotify publish, a live trade promotion — always pause for a human.

---

## Skill authoring

- **Skills are project-agnostic.** A skill with `if (project === 'X')` branches is a directive in the wrong place. Parameterise instead.
- **Pass 1 ships. Pass 2 optimises.** DOM-driven recipes are fine to start; direct-HTTP is the graduation target, not the prerequisite.
- **Document interface, not implementation.** Vault-facing Skill Overview = verbs + flags + output shape. Implementation lives in `~/clawd/skills/<name>/SKILL.md`.

---

## Phases, pipelines, roles, HITL

- **HITL gates are first-class.** Any action that costs money, makes public posts, or touches user-visible workspace state pauses the phase or pipeline with `## Human Requirements` or a Promotion Queue row.
- **Paper→Live promotion is HITL-enforced, not by convention.** The Live Trade pipeline's input filter rejects rows whose `approved_by:` is an agent identity. Safety is in the filter, not the prose.
- **Project-bundle directives never wikilink to general directives.** Encode in frontmatter (`role:`, `based_on:`). Body wikilinks across branches create the spider-web.
- **When superseding, preserve the original body.** Append a new dated entry that cites the one it replaces; never rewrite.

---

## Agent behaviour & honesty

- **Declare the plan before the code.** Write the vault contract (phase, pipeline, or Skill Overview) first; implement backwards from it.
- **Name what you can't solve.** Specific failure + decision point. "Should be fine" is not a verification.
- **Verify before declaring done.** After a move, list the destination. After a merge, grep for stragglers. After a compaction, check counts.
- **Memory is for what surprised you.** Save the workaround, the unexpected cost, the thing future-you will forget.
- **Be tolerant of typos, firm on ambiguous intent.** One clarifying question beats one wrong rewrite.
- **Degrade explicitly, never silently invent.** A missing file is a known unknown; pretending it said something is a corrupting unknown.

---

## Gotchas (chronological, append-only — preserved verbatim across versions)

- `onyx consolidate` returned zero actions on bundle-prefixed phase files. Root cause: glob `P*.md` didn't match `<Project> - P<N> - <desc>.md`. Fix: glob `*.md` + frontmatter/basename filter.
- `onyx consolidate --apply` rejected as unknown option. Fix: `.allowUnknownOption(true)`.
- Consolidation is two-pass: first `--apply` creates Archive + tags originals `phase-archived`; second `--apply` trashes tagged originals.
- Suno studio API host is `studio-api-prod.suno.com` (hyphen), not `studio-api.prod.suno.com` (dot). Many endpoints 404 with the wrong host.
- Suno `/api/feed/v2` is 0-indexed; `/api/project/<id>` is 1-indexed. Wrong starting page silently dupes and skips content.
- Suno persona/workspace names aren't in the global feed — separate endpoints (`/api/persona/get-personas/`, `/api/project/me`).
- Clerk sessions are fingerprint-bound. Use CDP attach to user's daily Chrome, not Playwright persistent contexts.
- Virgin Media blocks inbound port 25 on residential. Self-hosted mail needs ISP support or a smart-host relay.
- Cloudflare requires scoped API tokens, not Global API Key. Generate with `Zone:Read` + `DNS:Edit`.
- macOS AppleDouble files (`._*.md`) sneak in after iCloud sync. Delete on sight.
- Playwright's `chromium-headless-shell` has a different fingerprint than full Chromium. For session-fingerprint binding, point `executablePath` at `/opt/google/chrome/chrome`.
- Node's `parseArgs` treats negative numbers as unknown flags. Use `--flag=-18` form.
- EPIPE on subprocess stdout when the parent reads piecewise: backpressure-safe reads (chunks-to-buffer), swallow EPIPE on the writer side.
- Orphan scanner read truncation: read full files; use `content.find('\n---', 3)` (newline-anchored), not `content.find('---', 3)`.
- Loudnorm + AAC: use **single-pass dynamic loudnorm TP=-2** for AAC outputs. Two-pass linear + alimiter fails -1 dBTP after AAC encode.
- Suno lyrics constraint (Mani Plus): every bar must rhyme (AABB/ABAB); no free verse; full Punjabi-Arabic-Psytrance genre profile per Voice & Style Guide.

---

## Honest limitations

- Persona / workspace name resolution on Suno requires separate endpoint calls.
- Track → workspace membership isn't exposed in Suno's global feed. Walk each workspace to tag.
- Spotify for Creators UI redesigns will break the upload recipe. When it does, re-sniff selectors.
- Remotion video rendering still lives in project repos — compositions are JSX per project, can't generalise easily.
- Gmail / reverse DNS for self-hosted mail may still mark outbound as spammy without matching PTR. Mitigate with smart-host relay.

---

## Bundle conventions (decided 2026-05-17 during v2 wire-up)

- **`project:` field is kebab-case, filename is human-readable.** The frontmatter ID is the stable handle (e.g. `kraken-bot`, `answermepro`); the directory and Overview filename use the display name (`Kraken Bot`, `AnswerMePro`). Renaming a project means renaming files; the `project:` id stays.
- **Status enum is `active | done | blocked | paused`.** v1 values were normalized: `production→active`, `archived/completed→done`, `backlog/planning→paused`. Don't reintroduce alternate vocabularies.
- **`priority:` is numeric 1–5** (1 = highest). v1 had `high|medium|low` — mapped to `1|3|5`. Default is `3` when unspecified.
- **`kind-X` tag drives template choice.** `kind-engineering` (code repos), `kind-content` (audio/podcast/video pipelines — they produce content even though they're code-backed), `kind-operations` (infra projects), plus `kind-research|trading|experimenter` from the templates. No `kind-pipeline` — top-level "Pipelines" domain bundles are content factories that happen to use the pipeline primitive internally.
- **Compound projects (one project, multiple sub-bundles).** Pandora is the precedent: `Pandora/` has its own Overview/Status/Knowledge AND contains sub-bundles (FAC AI Chatbot, Moderating Underage Roleplay, etc.) that each have their own Overview. Sub-bundle `up:` points at the parent project Overview, not at the domain hub. Use only when sub-work streams are large enough to warrant independent phases + logs; otherwise model them as phases of the parent.
- **Suno Albums sub-bundles (individual albums) are content instances, not projects.** They live under `Suno Albums/Albums/<Name>/` with their own Overview but use lifecycle states (`generating | mastered | submitted-to-distrokid | concept-on-hold | …`) — the project status enum doesn't apply. Treat them as `episodes/` semantically; the directory layout is the only difference.
- **`repo` is a symlink, `repo_path:` is the truth.** Frontmatter records the canonical absolute path; the symlink is convenience for `cd <bundle>/repo` workflows. Recreate the symlink any time `repo_path:` changes (a mental-`heal` step).

---

## When in doubt

1. Search the vault for the thing — does it already exist?
2. Read this file and the relevant template — is there a simpler primitive?
3. Write the vault contract (phase, pipeline, or Skill Overview) FIRST, then implement.
4. Don't silently fail. `blocked` with a clear `## Human Requirements` > `done` that quietly skipped a step.
5. Ask the operator before destructive or expensive actions.

*New lessons append (via `consolidate` diff-proposal + human approval). Obsolete lines are marked superseded, not deleted.*
