---
name: legal
type: profile
version: 1.0
required_fields:
  - jurisdiction
  - matter_type
phase_fields:
  - legal_domain
  - risk_level
  - client_review_required
  - privilege_protected
init_docs:
  - Matter Context
  - Research Notes
  - Drafts
tags: [onyx-profile]
up: Profiles Hub
allowed_shell:
  - ls
  - test
  - grep
  - cat
  - mkdir
  - find
  - which
  - head
  - tail
  - wc
  - echo
  - jq
  - timeout
denied_shell:
  - rm
  - mv
  - cp
  - dd
  - mkfs
  - chmod
  - chown
  - sudo
  - curl
  - wget
  - git
---

## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: legal

> For legal research, document drafting, matter analysis, and compliance work. The agent researches, synthesises, and drafts — it does not give legal advice. Every output is a working document for a qualified legal professional to review, not a final legal product. Citations are mandatory. Jurisdiction governs everything.

---

## When to use this profile

- Legal research (case law, statute, regulation, secondary sources)
- Contract drafting and review (agent produces draft; lawyer reviews)
- Compliance analysis (what does this regulation require of us?)
- Matter intake and organisation (facts, timeline, parties, key documents)
- Policy drafting (employment, privacy, vendor agreements)
- Template library creation (standard contract clauses, terms of service, NDA frameworks)
- Pre-litigation fact organisation (chronology, evidence list, witness summary)

If the project involves building legal software → use `engineering`.
If it involves systematic investigation of a legal question → use `research` + `legal-researcher` directive.
For ongoing compliance monitoring → use `operations` with a compliance runbook.

---

## Required Overview fields

```yaml
profile: legal
jurisdiction: "England and Wales"     # jurisdiction(s) this matter operates in
matter_type: "contract-review"        # legal-research | contract-review | compliance | policy | litigation-support | other
```

`jurisdiction` is required and governs everything. Law is jurisdiction-specific. An agent researching English law must not apply US case law as precedent. If multiple jurisdictions apply (cross-border deal), list all and note the governing law clause.

`matter_type` sets the agent's operational mode:
- `legal-research` → cite sources, synthesise, note gaps; use `legal-researcher` directive
- `contract-review` → identify issues, flag risks, suggest alternatives; use `legal-drafter` directive
- `compliance` → map obligations, assess gaps, recommend controls; use `compliance-officer` directive
- `policy` → draft internal policy or procedure; use `legal-drafter` directive
- `litigation-support` → organise facts, chronology, documents; read-only, no legal opinions

---

## Phase fields

Legal phases carry these optional frontmatter fields:

```yaml
legal_domain: "employment"           # employment | IP | corporate | commercial | property | regulatory | other
risk_level: "medium"                 # low | medium | high | critical — governs how much scrutiny before proceeding
client_review_required: true         # true | false — phases that produce advice-adjacent content
privilege_protected: false           # true if this content may attract legal professional privilege
```

`risk_level: high` or `critical` triggers mandatory blocking before any deliverable is finalised — no phase completes without explicit human sign-off.

`privilege_protected: true` — the agent notes in the log that this content may be privileged and should be handled accordingly (not shared outside the matter team).

---

## Bundle structure

When `onyx init` creates a legal project:

```
My Matter/
├── My Matter - Overview.md               ← jurisdiction, matter type, parties, key dates, governing law
├── My Matter - Knowledge.md              ← legal findings compound here; statute refs, case refs, key principles
├── My Matter - Matter Context.md         ← background facts, parties, timeline, key documents index
├── My Matter - Research Notes.md         ← raw research output (cases found, statutes read, secondary sources)
├── My Matter - Drafts/                   ← working drafts; version numbered
│   └── [Document Name] - v1.md
├── Phases/
│   ├── P1 - Map the legal landscape.md   ← identify applicable law, jurisdiction rules, key sources
│   ├── P2 - Research [specific issue].md
│   ├── P3 - Draft [document].md
│   └── P4 - Review + annotate.md
└── Logs/
```

**Matter Context** — the facts of the matter. Who are the parties? What happened? What are the key dates? What documents exist? The agent reads this before any legal work. It does not contain legal analysis — only facts.

**Research Notes** — the running research log. Organised by issue. Includes cases found, their holdings, relevance to this matter. Distinct from Knowledge.md because these are raw findings, not synthesised conclusions.

**Drafts** — version-controlled working documents. Agent creates `v1`, never overwrites. Human feedback goes into `v2` as a new file. Drafts are always clearly marked as draft documents.

---

## When creating a new bundle

For the LLM generating the Overview at `onyx init` time:

The Overview.md for a legal project must include:
1. A `## Matter summary` section — what this matter is about, in plain terms (not legalese)
2. A `## Parties` section — each party, their role, their legal entity
3. A `## Jurisdiction + governing law` section — which law governs; if multiple, which takes precedence
4. A `## Key dates` section — limitation periods, filing deadlines, contractual dates, relevant event timeline
5. A `## Key documents` section — list of documents central to the matter (contracts, correspondence, evidence)
6. A `## Scope` section — precisely what the agent is and is not being asked to do
7. A `## Disclaimer` section (required): "This project produces working documents for professional legal review. No output constitutes legal advice."

The Matter Context note starts with this template:
```
# Matter Context — [Matter Name]

## Parties
| Party | Role | Entity type | Jurisdiction |
|-------|------|-------------|-------------|
| | | | |

## Background facts
[Chronological narrative of relevant events]

## Timeline
| Date | Event | Source |
|------|-------|--------|

## Key documents
| Document | Date | Parties | Relevance |
|----------|------|---------|-----------|

## Open questions of fact
[Things that are unknown or disputed]
```

---

## Acceptance verification

Legal phases have a strict quality gate:

1. **All tasks checked** — every `- [ ]` is ticked
2. **Citations provided** — every legal proposition references a primary source (case name + citation, statute + section, regulation + article). Secondary sources are supplementary only
3. **Jurisdiction checked** — every cited authority is from the correct jurisdiction, or a cross-jurisdiction note explains why it is persuasive
4. **No legal advice given** — the agent makes no definitive legal conclusions ("you must do X", "you are liable"). It states what the law says, identifies risks, and presents options. Conclusions are for the lawyer
5. **`risk_level: high` or `critical`** — phase ends with `client_review_required: true` and a blocking note listing exactly what the human needs to review before work continues
6. **Draft documents marked** — all draft documents include a header: "DRAFT — for professional review only. Not a final legal document."
7. **Gaps documented** — if research couldn't find a clear answer (genuinely ambiguous law, jurisdiction gap), this is explicitly stated and not papered over

**Human professional review is non-negotiable.** No legal output produced by this system should be relied upon as legal advice, filed with a court, sent to a counterparty, or used to make decisions without review by a qualified legal professional.

---

## Context the agent receives

ONYX injects these into the agent's context:

1. This profile file
2. The phase directive (if set — `legal-researcher` or `legal-drafter` recommended)
3. Project Overview.md
4. Matter Context (facts — always read before legal analysis)
5. Project Knowledge.md (synthesised legal findings)
6. Research Notes (raw research findings, if the phase builds on prior research)
7. The phase file

---

## Notes for the agent

- Jurisdiction governs everything. Before citing any case or statute, verify it is from the correct jurisdiction or explain why it is persuasive authority from another jurisdiction.
- You research and draft. You do not advise. If a client asks "should I sign this?" — the answer is: "Here are the risks and options. A qualified solicitor should advise you." Write that, then stop.
- Legal research is not Google searching. Primary sources (cases, statutes, regulations) take precedence. Secondary sources (legal commentary, practitioner guides) are useful context but not authority.
- When law is unclear, say so explicitly. "This area is unsettled" or "courts in this jurisdiction have not directly addressed this point" are valid research outputs. Making up a clear answer where none exists is a serious failure mode.
- Draft documents must clearly state what they are: a working draft for professional review. Never remove this marking.
- `privilege_protected: true` — treat the entire phase log and output as potentially privileged. Note this in the log. Do not include privileged content in summaries that might be shared more widely.
