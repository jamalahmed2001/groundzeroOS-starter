---
tags: [hub-subdomain, status-active]
graph_domain: system
status: active
---
## 🔗 Navigation

**UP:** [[08 - System/System Hub.md|System Hub]]
**HOW PROFILES WORK:** [[08 - System/ONYX - Reference.md|ONYX Reference]]

# Profiles Hub

> Profiles are the **mechanical contract** between a project and ONYX. They define what a bundle looks like, what frontmatter it requires, and what "done" means for each domain. One profile per project, set in Overview.md frontmatter. The FSM states are universal — profiles define the domain rules around transitions.

**Profile ≠ Directive.**
- Profile = contract with ONYX (how to handle this project type mechanically)
- Directive = contract with the agent (who to be for this phase)

---

## Available Profiles

Nine profiles. Each one is a genuinely distinct mechanical contract — different required fields, different bundle structure, different acceptance gate.

| Profile | Use for | Key required fields | Acceptance gate |
|---|---|---|---|
| [[08 - System/Profiles/general.md\|general]] | Catch-all — unsure which profile, mixed domains, lightweight tasks | none | all tasks checked + output documented |
| [[08 - System/Profiles/engineering.md\|engineering]] | Software projects with a git repo | `repo_path`, `test_command` | test command exits 0 |
| [[08 - System/Profiles/content.md\|content]] | Podcast, video, newsletter, social pipelines | `voice_profile`, `pipeline_stage` | safety filter + voice check |
| [[08 - System/Profiles/research.md\|research]] | Investigation, analysis, synthesis | `research_question`, `source_constraints`, `output_format` | source count + confidence level |
| [[08 - System/Profiles/operations.md\|operations]] | System ops, monitoring, incident response, e-commerce, events | `monitored_systems`, `runbook_path` | runbook_followed + outcome documented |
| [[08 - System/Profiles/trading.md\|trading]] | Algorithmic trading, strategy dev, exchange integration | `exchange`, `strategy_type`, `risk_limits`, `backtest_command` | backtest passes + risk model compliance |
| [[08 - System/Profiles/experimenter.md\|experimenter]] | Systematic experimentation — prompt engineering, agent config, ML, A/B testing | `hypothesis`, `success_metric`, `baseline_value` | result recorded + Cognition Store updated |
| [[08 - System/Profiles/accounting.md\|accounting]] | Bookkeeping, financial reporting, audit preparation, financial analysis | `reporting_period`, `accounting_standards`, `entity_type` | balance check + human sign-off mandatory |
| [[08 - System/Profiles/legal.md\|legal]] | Legal research, contract drafting, compliance, litigation support | `jurisdiction`, `matter_type` | citations verified + human professional review required |

---

## When to use each profile

**Start here if unsure:** `general` — no required fields, flexible acceptance. You can migrate to a more specific profile once the project type is clear.

A profile is a mechanical contract with ONYX — different required fields, a different bundle structure, a different acceptance gate. Most project types don't need a new profile; they need a better Overview and the right directives.

- **Podcast, YouTube, newsletter, social media** → use `content`. The profile's mechanics are identical across all content pipelines.
- **Analytics** → use `research`. Set `output_format: "weekly dashboard + monthly report"`.
- **Marketing campaigns** → use `content`. Phases that do audience research use `research`.
- **E-commerce operations, event management, creator management** → use `operations`.
- **Building any of the above as software** → use `engineering`.
- **Bookkeeping, financial reporting, audit** → use `accounting`.
- **Legal research, contract drafting, compliance** → use `legal`.

---

## How to wire a profile

One field in the project Overview.md frontmatter:

```yaml
---
project_id: "MyProject"
profile: engineering
repo_path: /home/jamal/clawd/myproject
test_command: pnpm test
---
```

ONYX reads `profile:`, resolves `08 - System/Profiles/engineering.md`, and:
1. Validates `required_fields` are present in the Overview
2. Injects the profile file into the agent's context before the Overview
3. Applies the acceptance verification rules when checking if a phase is complete

---

## How to create a new profile

Copy any existing profile file. The frontmatter defines the mechanical contract. The markdown body is what the agent reads. ONYX resolves by filename — `profile: engineering` resolves to `engineering.md` in this folder.

**Resolution order:** `My Project/Profiles/<name>.md` → `08 - System/Profiles/<name>.md`

Project-specific profiles live alongside the bundle. System-level profiles (shared, reusable) live here.

---

## What profiles do NOT control

- The FSM states (backlog / planning / ready / active / completed / blocked) — universal, inviolable
- The phase file structure (Summary / Tasks / Acceptance Criteria / Log) — universal
- The Knowledge note convention — universal
- Agent identity for a given phase — that's a directive

---

## Related

- [[08 - System/Agent Directives/Agent Directives Hub.md|Directives Hub]] — agent identity per phase
- [[08 - System/ONYX - Reference.md|ONYX Reference]] — full guide: pipelines, commands, internals, laws
