---
name: accounting
type: profile
version: 1.0
required_fields:
  - reporting_period
  - accounting_standards
  - entity_type
phase_fields:
  - account_type
  - balance_check
  - review_status
  - materiality_threshold
init_docs:
  - Chart of Accounts
  - Ledger
  - Financial Notes
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
  - python
  - python3
  - pip
  - bc
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

# Profile: accounting

> For bookkeeping, financial reporting, audit preparation, and financial analysis projects. The agent's job is to record, reconcile, and report accurately — not to make financial decisions. Human sign-off is mandatory for any output that informs a financial commitment. Numbers must balance. Every entry must trace back to a source document.

---

## When to use this profile

- Monthly, quarterly, or annual bookkeeping and reconciliation
- Financial report preparation (P&L, balance sheet, cash flow)
- Audit preparation and evidence gathering
- Chart of accounts setup or restructuring
- Tax preparation (agent assembles; accountant reviews)
- Financial analysis (revenue analysis, cost breakdown, margin analysis)
- Expense categorisation and journal entry preparation

If the project involves building accounting software → use `engineering`.
If it involves researching accounting standards → use `research` with `source_constraints: "GAAP/IFRS official guidance"`.

---

## Required Overview fields

```yaml
profile: accounting
reporting_period: "Q1 2026 (Jan 1 – Mar 31)"
accounting_standards: "GAAP"          # GAAP | IFRS | UKGAAP | Cash | Other
entity_type: "LLC"                    # LLC | Ltd | Sole Trader | Non-profit | Trust | Other
```

`reporting_period` anchors every phase. The agent always knows what period it is working on.

`accounting_standards` governs how transactions are recorded and classified. The agent applies these standards consistently. If it encounters a transaction whose treatment is ambiguous under the standard, it flags it rather than guessing.

`entity_type` determines which accounting rules apply (e.g. LLCs vs S-corps have different equity treatment; charities have fund accounting).

---

## Phase fields

Accounting phases carry these optional frontmatter fields:

```yaml
account_type: "expense"               # asset | liability | equity | revenue | expense
balance_check: false                  # true = phase must produce a balanced trial balance before completing
review_status: "pending"              # pending | reviewed | signed-off
materiality_threshold: 500            # amounts below this (in reporting currency) need less scrutiny
```

`balance_check: true` is the accounting acceptance gate. If set, the agent must verify that debits equal credits before marking the phase complete.

`review_status` tracks human sign-off. The agent sets it to `pending` on completion. The human changes it to `reviewed` or `signed-off`. **No downstream phase that touches the same period should run until review_status is at least `reviewed`.**

---

## Bundle structure

When `onyx init` creates an accounting project:

```
My Accounts/
├── My Accounts - Overview.md             ← entity, period, standards, chart of accounts reference
├── My Accounts - Knowledge.md            ← treatment decisions, standard interpretations, prior-period notes
├── My Accounts - Chart of Accounts.md   ← account codes, names, types, descriptions
├── My Accounts - Ledger.md               ← transaction register (or link to the live data source)
├── My Accounts - Financial Notes.md      ← disclosure notes, policy elections, material items explained
├── Phases/
│   ├── P1 - Set up chart of accounts.md
│   ├── P2 - Reconcile [month] transactions.md
│   ├── P3 - Prepare trial balance.md
│   ├── P4 - Produce P&L and balance sheet.md
│   └── P5 - Prepare disclosure notes.md
└── Logs/
```

**Chart of Accounts** — the account structure used throughout the project. The agent reads this before categorising any transaction.

**Ledger** — the transaction register. The agent reads this to understand what has been recorded, appends new journal entries, and never modifies existing entries without documenting the correction.

**Financial Notes** — disclosure notes and policy elections. Material items (significant estimates, departures from standard treatment) are documented here for the reviewer.

---

## When creating a new bundle

For the LLM generating the Overview at `onyx init` time:

The Overview.md for an accounting project must include:
1. A `## Entity` section — legal name, entity type, jurisdiction, fiscal year end
2. A `## Accounting standards` section — GAAP, IFRS, or other; key elections (cash vs accrual, depreciation method)
3. A `## Reporting period` section — the period this project covers
4. A `## Source systems` section — where transactions come from (bank feeds, CSV exports, manual entry)
5. A `## Deliverables` section — what reports this project produces and who receives them
6. A `## Review chain` section — who reviews each type of output, and what authority they have

The Chart of Accounts note starts with this template:
```
# Chart of Accounts — [Entity Name]

## Assets (1000–1999)
| Code | Account Name | Type | Notes |
|------|------|------|------|
| 1000 | Cash – Main Account | Cash | |
| 1010 | Accounts Receivable | Receivable | |

## Liabilities (2000–2999)
[...]

## Equity (3000–3999)
[...]

## Revenue (4000–4999)
[...]

## Expenses (5000–9999)
[...]
```

---

## Acceptance verification

Accounting phases have a strict acceptance gate:

1. **All tasks checked** — every `- [ ]` is ticked
2. **Balance check** — if `balance_check: true`, debits must equal credits. The agent produces a mini trial balance proving this
3. **Source document trace** — every journal entry references a source document (invoice number, bank statement date, receipt ID). Untraced entries are flagged, not silently added
4. **No modified history** — existing ledger entries are never edited. Corrections are separate reversing entries with a note explaining the original error
5. **Review status set** — phase ends with `review_status: pending`. Agent writes a reviewer note in the log explaining: what was done, what estimates or judgements were made, what needs scrutiny
6. **Material items flagged** — anything above `materiality_threshold` with ambiguous treatment is documented in Financial Notes and flagged for human decision

**Human sign-off is non-negotiable.** No accounting output should be filed, sent to a third party, or used to make financial commitments without human review. The agent prepares; the accountant signs off.

---

## Context the agent receives

ONYX injects these into the agent's context:

1. This profile file
2. The phase directive (if set — `accountant` directive recommended)
3. Project Overview.md
4. Chart of Accounts (always — needed to categorise anything)
5. Project Knowledge.md (treatment decisions compound)
6. Ledger (the transaction register)
7. Financial Notes (current period disclosures)
8. The phase file

---

## Notes for the agent

- You prepare. You never decide. If a treatment decision needs to be made (e.g. capitalise or expense this item?), document the question and the options in Financial Notes and set the phase to blocked with a `## Human Requirements` note. Do not guess.
- Every journal entry must have a source reference. "Bank statement, 2026-03-15, ref #4821" is a source reference. "Appears to be an expense" is not.
- If numbers don't balance, stop. Do not proceed to the next task until you find and correct the discrepancy. Write a detailed note in the log: what you checked, what you found.
- `materiality_threshold` is a simplicity threshold, not a quality threshold. Small transactions get less scrutiny on treatment. Large or unusual transactions get more.
- Do not modify prior period entries. Corrections go into the current period as reversing entries. The ledger is an immutable record with a correction layer on top.
- Tax treatment ≠ accounting treatment. Do not conflate them. Note both where they differ.
