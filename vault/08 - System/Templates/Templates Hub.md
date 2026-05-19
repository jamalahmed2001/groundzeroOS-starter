---
type: hub
up: "[[System Hub]]"
created: 2026-05-17T18:00:00Z
updated: 2026-05-17T18:00:00Z
---

## 🔗 Navigation
**UP:** [[System Hub]]

# Templates Hub

> The shapes `new` scaffolds from. Each template uses `<PLACEHOLDER>` tokens (e.g. `<PROJECT_ID>`, `<ISO>`, `<TITLE>`) the agent substitutes at scaffold time.

## Project anchors (one per project kind)

| Template | Use for | Required frontmatter |
|---|---|---|
| `Overview - engineering.md.tpl` | Software projects with a git repo | `repo_path`, `test_command`, `lint_command` |
| `Overview - content.md.tpl` | Podcasts, video shows, newsletters | `voice_profile`, `pipeline_stage` |
| `Overview - research.md.tpl` | Investigation, analysis, synthesis | `research_question`, `output_format` |
| `Overview - operations.md.tpl` | System ops, monitoring, runbooks | `monitored_systems`, `runbook_path` |
| `Overview - trading.md.tpl` | Algo trading, strategy work | `exchange`, `risk_limits`, `backtest_command` |
| `Overview - experimenter.md.tpl` | A/B tests, ML experiments, prompt eng | `hypothesis`, `success_metric`, `baseline_value` |

`new <project> --kind <kind>` picks one of these. Default kind is `engineering`. `new` also writes the standard children (Status / Knowledge / Decisions) and the bundle skeleton (`phases/`, `pipelines/`, `logs/`, `artifacts/`, `refs/`).

## Standard children (one per bundle)

| Template | What it is |
|---|---|
| `Status.md.tpl` | Derived view — rebuilt by `heal` from phase + pipeline frontmatter. Lists active phase, queue, pipelines, log tail. |
| `Knowledge.md.tpl` | Append-only learnings. One dated line per insight. Compact when growth exceeds the soft cap (~200 lines). |
| `Decisions.md.tpl` | Append-only ADRs. `### <iso> — <decision>` + Context / Decision / Consequences. Never delete; supersede. |

## Work units

| Template | What it is |
|---|---|
| `Phase.md.tpl` | One unit of system-changing work. `## Steps` checklist + `verify:` block + `## Progress` (the agent overwrites this after every action). |
| `Pipeline.md.tpl` | Repeatable work. Declared once; each invocation appends a row to `## Journal`. Stages: `shell:`, `skill:`, `agent:`, `human:`. |
| `Journal.md.tpl` | The append-only row format pipelines use. Most pipelines embed the journal inline; this template is for projects that want a stand-alone journal file. |

## Placeholder convention

All templates use `<UPPER_SNAKE>` for substitution tokens. The agent fills them at scaffold time based on `new`'s arguments:

| Token | Value source |
|---|---|
| `<PROJECT_ID>` | kebab-case slug from `new <project>` |
| `<PROJECT>` | display name (Title Case, derived from `<PROJECT_ID>`) |
| `<PROJECT_NAME>` | same as `<PROJECT>` (alias for human-readable name) |
| `<PARENT_HUB>` | parent domain hub the bundle hangs off (default `System Hub`) |
| `<REPO_ABS_PATH>` | absolute path to the code repo if `--repo` passed |
| `<ISO>` | current ISO 8601 timestamp |
| `<NN>` | zero-padded phase number (`01`, `02`, …) |
| `<TITLE>` | phase title from `new phase` or operator |
| `<TEST_COMMAND>` | engineering kind: defaults to `npm test`; operator may override |

If you add a template, follow this convention so `new` substitutes correctly.

<!-- AUTO_CHILDREN_START -->

## Children

- [[Decisions.md.tpl]]
- [[Journal.md.tpl]]
- [[Knowledge.md.tpl]]
- [[Overview - content.md.tpl]]
- [[Overview - engineering.md.tpl]]
- [[Overview - experimenter.md.tpl]]
- [[Overview - operations.md.tpl]]
- [[Overview - research.md.tpl]]
- [[Overview - trading.md.tpl]]
- [[Phase.md.tpl]]
- [[Pipeline.md.tpl]]
- [[Status.md.tpl]]

<!-- AUTO_CHILDREN_END -->
