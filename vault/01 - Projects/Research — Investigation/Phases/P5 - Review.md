---
project: Research — Investigation
phase_number: 5
phase_name: Review
status: backlog
profile: research
directive: qc-reviewer
blocked_by: [4]
tags:
  - project-phase
  - phase-backlog
created: 2026-04-27T00:00:00Z
up: Research — Investigation - Phases Hub
---
## 🔗 Navigation

**UP:** [[Research — Investigation - Phases Hub|Phases Hub]]

# P5 — Review

## Overview

Independent review. The author doesn't sign off on their own work. A reviewer — another agent (using the `qc-reviewer` directive), a colleague, or the operator wearing a different hat — checks the deliverable against the acceptance bar.

## Tasks

- [ ] Hand the deliverable to a reviewer. Reviewer reads:
  - The deliverable
  - P3's synthesis (to check the deliverable matches the evidence map)
  - The `Sources/` notes (to spot-check citations resolve)
- [ ] Reviewer applies the [[08 - System/Agent Directives/qc-reviewer.md|qc-reviewer]] checklist for research output:
  - Every cited source resolves and matches what's claimed.
  - Year-stamps only on actually-fetched publications.
  - `source_constraints` honoured.
  - Gaps named honestly.
  - No load-bearing claim without a citation.
- [ ] Reviewer either approves or surfaces concrete blockers (specific location, specific fix-or-clarify ask).
- [ ] If blocked: author addresses each blocker; re-review; re-loop until approved.
- [ ] On approval: deliverable marked final; consolidate runs; project complete (or ready for a publishing phase if the deliverable will be distributed externally).

## Acceptance Criteria

- [ ] Review record committed (`Phases/P5 - Review - Record.md` or sibling `Reviews/` file).
- [ ] All raised blockers addressed and confirmed by the reviewer.
- [ ] Final deliverable tagged `final` in frontmatter.

## Human Requirements

<!-- None — phase completed successfully -->
