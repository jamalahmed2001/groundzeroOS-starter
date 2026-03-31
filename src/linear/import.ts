import type { ControllerConfig } from '../config/load.js';
import type { VaultBundle } from '../vault/reader.js';
import { readBundle } from '../vault/reader.js';
import { getProject, getProjectIssues, type LinearIssue } from './client.js';
import { notify } from '../notify/notify.js';
import { writeFile } from '../vault/writer.js';
import { findExistingPhaseByLinearId, mergeLinearIntoPhase } from './merge.js';
import matter from 'gray-matter';
import path from 'path';
import fs from 'fs';

function buildTasksFromIssue(issue: LinearIssue): string {
  if (!issue.children || issue.children.length === 0) {
    return `- [ ] ${issue.title}\n`;
  }
  return issue.children.map(child => `- [ ] ${child.title}\n`).join('');
}

function phaseNoteContent(
  projectName: string,
  phaseNumber: number,
  phaseName: string,
  linearId: string,
  description: string,
  tasks: string
): string {
  const logName = `L${phaseNumber} - P${phaseNumber} - ${phaseName}`;
  const desc = description.trim() || '_No description provided._';
  return `---
project_id: "${projectName}"
project: "${projectName}"
phase_number: ${phaseNumber}
phase_name: "${phaseName}"
linear_issue_id: "${linearId}"
linear_identifier: "${linearId}"
status: backlog
locked_by: ""
locked_at: ""
tags:
  - gz-phase
  - phase-backlog
created: ${new Date().toISOString().slice(0, 10)}
---
## 🔗 Navigation

**PROJECT:** [[${projectName} - Overview|${projectName}]]
**KNOWLEDGE:** [[${projectName} - Knowledge|Knowledge]]
**KANBAN:** [[${projectName} - Kanban|Kanban]]

# P${phaseNumber} — ${phaseName}

## Overview

<!-- GZOS_MANAGED_START:linear-overview -->
${desc}
<!-- GZOS_MANAGED_END:linear-overview -->

## Human Requirements

- (none)

## Tasks

${tasks}
## Acceptance Criteria

- [ ] Define acceptance criteria for this phase

## Blockers

(none)

## Log

- [[${logName}|L${phaseNumber} — Execution Log]]
`;
}

// L1: import a Linear project into a vault bundle.
// Creates PROJECT - Overview/Knowledge/Kanban, Phases/ (one per issue), Logs/.
// Maps issues -> task stubs in ## Tasks sections.
// Writes linear_identifier to phase note frontmatter.
// Appends linear_import_done entry to L0 - Import Log.md
// Notifies: linear_import_done
// Vault stays authoritative after import; Linear is the seed, not the source.
export async function importLinearProject(
  linearProjectId: string,
  config: ControllerConfig
): Promise<VaultBundle> {
  if (!config.linear) {
    throw new Error('importLinearProject: linear config is required');
  }

  const { apiKey } = config.linear;
  const project = await getProject(apiKey, linearProjectId);
  const issues = await getProjectIssues(apiKey, linearProjectId);

  const projectsBase = config.projectsGlob.replace('/**', '').replace('/**/*', '');
  const bundleDir = path.join(config.vaultRoot, projectsBase, project.name);
  const phasesDir = path.join(bundleDir, 'Phases');
  const logsDir = path.join(bundleDir, 'Logs');

  const phaseSummaryLinks = issues
    .map((issue, i) => `- [[P${i + 1} - ${issue.title}|P${i + 1} — ${issue.title}]] — \`phase-backlog\``)
    .join('\n');

  // Overview
  writeFile(path.join(bundleDir, `${project.name} - Overview.md`), `---
project_id: "${project.name}"
project: "${project.name}"
linear_project_id: "${linearProjectId}"
type: overview
status: planning
tags:
  - gz-project
---
## 🔗 Navigation

**KNOWLEDGE:** [[${project.name} - Knowledge|Knowledge]]
**KANBAN:** [[${project.name} - Kanban|Kanban]]
**PHASES:**
${phaseSummaryLinks}

# ${project.name}

## Description

${project.description ?? '_No description provided._'}

## Source

Imported from Linear project: \`${linearProjectId}\`
`);

  // Knowledge
  const phaseKnowledgeLinks = issues
    .map((issue, i) => `- [[P${i + 1} - ${issue.title}|P${i + 1} — ${issue.title}]]`)
    .join('\n');

  writeFile(path.join(bundleDir, `${project.name} - Knowledge.md`), `---
project: "${project.name}"
type: knowledge
---
## 🔗 Navigation

**UP:** [[${project.name} - Overview|Overview]]
**KANBAN:** [[${project.name} - Kanban|Kanban]]

# Knowledge — ${project.name}

## Learnings

_Learnings will be added here automatically after each phase completes._

## Phases

${phaseKnowledgeLinks}

## Decisions

_No decisions recorded._
`);

  // Kanban
  writeFile(path.join(bundleDir, `${project.name} - Kanban.md`), `---
project: "${project.name}"
type: kanban
---
## 🔗 Navigation

**UP:** [[${project.name} - Overview|Overview]]
**KNOWLEDGE:** [[${project.name} - Knowledge|Knowledge]]

# Kanban — ${project.name}

## Backlog

${issues.map((issue, i) => `- [[P${i + 1} - ${issue.title}|P${i + 1} — ${issue.title}]]`).join('\n')}

## Ready

_(phases move here when tagged phase-ready)_

## Active

_(executor sets phase-active when running)_

## Blocked

_(empty)_

## Completed

_(empty)_
`);

  // Phase notes + log notes
  const createdPhases: string[] = [];
  let phaseNumber = 1;

  for (const issue of issues) {
    const phaseName = issue.title;

    // Idempotent: if a phase with this linear_issue_id/linear_identifier already exists, merge and continue
    const existingPath = findExistingPhaseByLinearId(phasesDir, issue.identifier);
    if (existingPath) {
      mergeLinearIntoPhase(existingPath, issue.title, issue.description ?? '', issue.identifier);
      console.log(`  [updated] ${issue.title}`);
      phaseNumber++;
      continue;
    }

    const tasks = buildTasksFromIssue(issue);
    const content = phaseNoteContent(project.name, phaseNumber, phaseName, issue.identifier, issue.description ?? '', tasks);
    const phaseFile = `P${phaseNumber} - ${phaseName}.md`;
    writeFile(path.join(phasesDir, phaseFile), content);

    // Empty log note pre-created so graph links resolve immediately
    writeFile(path.join(logsDir, `L${phaseNumber} - P${phaseNumber} - ${phaseName}.md`), `---
tags: [project-log]
project: "${project.name}"
phase_number: ${phaseNumber}
phase_name: "${phaseName}"
created: ${new Date().toISOString().slice(0, 10)}
---
## 🔗 Navigation

**PHASE:** [[P${phaseNumber} - ${phaseName}|P${phaseNumber} — ${phaseName}]]
**PROJECT:** [[${project.name} - Overview|${project.name}]]

# L${phaseNumber} — P${phaseNumber} — ${phaseName}

## Entries

### ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — IMPORT
**Event:** linear_import_done
**Detail:** Phase created from Linear issue \`${issue.identifier}\`
`);

    createdPhases.push(phaseFile);
    phaseNumber++;
  }

  // Import log
  writeFile(path.join(logsDir, 'L0 - Import Log.md'), `---
type: log
project: "${project.name}"
---
## 🔗 Navigation

**PROJECT:** [[${project.name} - Overview|${project.name}]]

# Import Log — ${project.name}

## Log

### ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — IMPORT
**Event:** linear_import_done
**Detail:** Imported ${createdPhases.length} phases from Linear project \`${linearProjectId}\`
`);

  await notify({
    event: 'linear_import_done',
    projectId: project.name,
    detail: `${createdPhases.length} phases imported from Linear`,
  }, config);

  return readBundle(bundleDir, project.name);
}
