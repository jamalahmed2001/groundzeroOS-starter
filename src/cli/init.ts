// onyx init [project-name]
// Creates a project bundle in the vault.
// Interactive: prompts for project name and repo path if not supplied.
// Auto-scans repo to populate Repo Context (stack, key areas, architecture notes).

import { loadConfig } from '../config/load.js';
import { writeFile } from '../vault/writer.js';
import { readRawFile, readPhaseNode } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const PROFILES = ['engineering', 'content', 'research', 'operations', 'trading', 'experimenter'] as const;
type ProfileName = typeof PROFILES[number];

// Extract distinct section paths from a projects_glob pattern.
// Handles both single ('01 - Projects/**') and multi ('{02 - Fanvue/**,03 - Ventures/**}') forms.
function extractProjectsSections(glob: string): string[] {
  const multiMatch = glob.match(/^\{(.+)\}$/);
  if (multiMatch) {
    return multiMatch[1]!.split(',').map(p => p.replace(/\/\*\*.*$/, '').trim()).filter(Boolean);
  }
  return [glob.replace(/\/\*\*.*$/, '')];
}

// ---------------------------------------------------------------------------
// Repo scanner — figures out what the project is without being told
// ---------------------------------------------------------------------------
export interface RepoScan {
  stack: string;
  keyAreas: string;
  architectureNotes: string;
  constraints: string;
}

export function scanRepo(repoPath: string): RepoScan {
  const stack: string[] = [];
  const keyAreas: string[] = [];
  let architectureNotes = '_Fill in key decisions, patterns, and constraints._';
  let constraints = '- Commit after each task: `git commit -m "onyx: PHASE — TASK"`\n- Run tests after each task if a test suite exists\n- No breaking changes to public API without noting it here';

  // Detect stack from package.json
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const deps = { ...pkg['dependencies'] as object, ...pkg['devDependencies'] as object } as Record<string, string>;

      if (deps['next']) stack.push(`Next.js ${deps['next']?.replace(/[\^~]/, '') ?? ''}`);
      else if (deps['react']) stack.push(`React ${deps['react']?.replace(/[\^~]/, '') ?? ''}`);
      else if (deps['vue']) stack.push('Vue');
      else if (deps['svelte']) stack.push('Svelte');
      else if (deps['express']) stack.push('Express');
      else if (deps['fastify']) stack.push('Fastify');
      else if (deps['hono']) stack.push('Hono');
      else if (deps['@remix-run/node'] || deps['@remix-run/react']) stack.push('Remix');

      if (deps['typescript'] || deps['@types/node']) stack.push('TypeScript');
      if (deps['prisma'] || deps['@prisma/client']) stack.push('Prisma');
      if (deps['drizzle-orm']) stack.push('Drizzle ORM');
      if (deps['@supabase/supabase-js']) stack.push('Supabase');
      if (deps['mongoose']) stack.push('Mongoose');
      if (deps['vitest']) stack.push('Vitest');
      if (deps['jest']) stack.push('Jest');
      if (deps['playwright'] || deps['@playwright/test']) stack.push('Playwright');
      if (deps['tailwindcss']) stack.push('Tailwind CSS');
      if (deps['zod']) stack.push('Zod');
      if (deps['trpc'] || deps['@trpc/server']) stack.push('tRPC');
    } catch { /* ignore */ }
  }

  // Python
  if (fs.existsSync(path.join(repoPath, 'pyproject.toml'))) stack.push('Python');
  if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
    if (!stack.includes('Python')) stack.push('Python');
    const reqs = fs.readFileSync(path.join(repoPath, 'requirements.txt'), 'utf-8');
    if (reqs.includes('fastapi')) stack.push('FastAPI');
    if (reqs.includes('django')) stack.push('Django');
    if (reqs.includes('flask')) stack.push('Flask');
  }

  // Go
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) stack.push('Go');

  // Rust
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) stack.push('Rust');

  // Key areas — list top-level dirs that look like code
  const skipDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.turbo', 'coverage', '.nyc_output', '__pycache__', '.venv', 'venv']);
  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      const label = inferAreaLabel(repoPath, entry.name);
      keyAreas.push(`- \`${entry.name}/\` — ${label}`);
    }
  } catch { /* ignore */ }

  // Architecture from README
  const readmePath = ['README.md', 'readme.md', 'README.txt'].map(f => path.join(repoPath, f)).find(fs.existsSync);
  if (readmePath) {
    const readme = fs.readFileSync(readmePath, 'utf-8');
    // Strip markdown headers and grab first 600 chars of content
    const body = readme.replace(/^#{1,3}.+$/gm, '').replace(/```[\s\S]*?```/g, '').trim().slice(0, 600);
    if (body.length > 50) {
      architectureNotes = `_From README:_\n\n${body}${body.length === 600 ? '…' : ''}`;
    }
  }

  // Constraints from CLAUDE.md if exists
  const claudeMdPath = path.join(repoPath, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8');
    const constraintSection = claudeMd.match(/## (?:Constraints?|Rules?|Guidelines?)([\s\S]*?)(?=\n##|\s*$)/i)?.[1]?.trim();
    if (constraintSection) {
      constraints = constraintSection + '\n- Commit after each task: `git commit -m "onyx: PHASE — TASK"`';
    }
  }

  return {
    stack: stack.length > 0 ? stack.join(', ') : '_Not detected — fill in manually_',
    keyAreas: keyAreas.length > 0 ? keyAreas.join('\n') : '_Fill in key directories and their purpose_',
    architectureNotes,
    constraints,
  };
}

function inferAreaLabel(repoPath: string, dirName: string): string {
  const knownLabels: Record<string, string> = {
    src: 'source code',
    lib: 'shared libraries',
    app: 'application routes',
    pages: 'page routes',
    components: 'UI components',
    hooks: 'React hooks',
    utils: 'utility functions',
    helpers: 'helper functions',
    types: 'TypeScript types',
    models: 'data models',
    schemas: 'validation schemas',
    api: 'API routes',
    server: 'server code',
    client: 'client code',
    services: 'business logic services',
    controllers: 'request handlers',
    routes: 'route definitions',
    middleware: 'middleware',
    config: 'configuration',
    scripts: 'scripts',
    tests: 'tests',
    test: 'tests',
    __tests__: 'tests',
    spec: 'tests',
    docs: 'documentation',
    public: 'public assets',
    static: 'static assets',
    assets: 'assets',
    styles: 'stylesheets',
    css: 'stylesheets',
    migrations: 'database migrations',
    prisma: 'Prisma schema & migrations',
    db: 'database layer',
    infra: 'infrastructure / IaC',
    terraform: 'Terraform config',
    packages: 'monorepo packages',
    apps: 'monorepo apps',
  };
  const lower = dirName.toLowerCase();
  if (knownLabels[lower]) return knownLabels[lower];

  // Check for package.json or tsconfig inside to detect a package
  if (fs.existsSync(path.join(repoPath, dirName, 'package.json'))) return 'package';
  return 'directory';
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function runInit(projectNameArg?: string, profileArg?: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Load config (may fail if vault_root not set — we ask for it)
    let config;
    try {
      config = loadConfig();
    } catch {
      config = null;
    }

    console.log('\nonyx init — Create a new project bundle\n');

    // Project name
    let projectName = projectNameArg?.trim() ?? '';
    if (!projectName) {
      projectName = (await prompt(rl, '  Project name: ')).trim();
    } else {
      console.log(`  Project name: ${projectName}`);
    }
    if (!projectName) { console.error('Project name is required.'); process.exit(1); }

    // Profile picker
    let profileName: ProfileName = (profileArg?.trim() as ProfileName) || '' as ProfileName;
    if (!profileName || !PROFILES.includes(profileName)) {
      console.log('\n  Select a profile:');
      PROFILES.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
      const choice = (await prompt(rl, '  Profile [1 = engineering]: ')).trim();
      const idx = parseInt(choice, 10) - 1;
      profileName = (idx >= 0 && idx < PROFILES.length ? PROFILES[idx] : 'engineering') as ProfileName;
    }
    console.log(`  Profile: ${profileName}`);

    // Vault root
    let vaultRoot = config?.vaultRoot ?? '';
    if (!vaultRoot) {
      vaultRoot = (await prompt(rl, '  Vault root (absolute path to Obsidian vault): ')).trim();
      if (!vaultRoot) { console.error('Vault root is required.'); process.exit(1); }
    } else {
      console.log(`  Vault root: ${vaultRoot}`);
    }

    // Load profile from vault to get init_docs and required_fields
    const profileFilePath = path.join(vaultRoot, '08 - System', 'Profiles', `${profileName}.md`);
    let initDocs: string[] = [];
    if (fs.existsSync(profileFilePath)) {
      const profileNode = readPhaseNode(profileFilePath);
      const docs = profileNode.frontmatter['init_docs'];
      if (Array.isArray(docs)) initDocs = docs.map(String);
    }

    // Repo path — only required for engineering + trading + experimenter profiles
    const needsRepo = profileName === 'engineering' || profileName === 'trading' || profileName === 'experimenter';
    let repoPath = '';
    let scan = { stack: '', keyAreas: '', architectureNotes: '', constraints: '' };
    if (needsRepo) {
      const repoDefault = process.cwd();
      const repoAnswer = await prompt(rl, `  Repo path [${repoDefault}]: `);
      repoPath = repoAnswer.trim() || repoDefault;
      if (!fs.existsSync(repoPath)) {
        console.error(`Repo path not found: ${repoPath}`);
        process.exit(1);
      }
      console.log(`\n  Scanning repo...`);
      scan = scanRepo(repoPath);
      console.log(`  Stack detected: ${scan.stack}`);
    }

    // Projects folder — handle multi-glob correctly
    const projectsGlob = config?.projectsGlob ?? '01 - Projects/**';
    const sections = extractProjectsSections(projectsGlob);
    let projectsBase: string;
    if (sections.length === 1) {
      projectsBase = sections[0]!;
    } else {
      console.log('\n  Select vault section:');
      sections.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
      const choice = (await prompt(rl, '  Section [1]: ')).trim();
      const idx = parseInt(choice, 10) - 1;
      projectsBase = (idx >= 0 && idx < sections.length ? sections[idx] : sections[0])!;
    }
    const projectsRoot = path.join(vaultRoot, projectsBase);

    const bundleDir = path.join(projectsRoot, projectName);
    const phasesDir = path.join(bundleDir, 'Phases');
    const logsDir   = path.join(bundleDir, 'Logs');
    const today = new Date().toISOString().slice(0, 10);

    rl.close();

    // Create bundle directories
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    // Create Directives/ folder for profiles that use per-phase agent identity
    if (profileName === 'content' || profileName === 'research' || profileName === 'experimenter') {
      fs.mkdirSync(path.join(bundleDir, 'Directives'), { recursive: true });
    }

    // Overview — frontmatter varies by profile
    const overviewFrontmatter = [
      `project_id: "${projectName}"`,
      `project: "${projectName}"`,
      `profile: "${profileName}"`,
      `type: overview`,
      `status: planning`,
      repoPath ? `repo_path: "${repoPath}"` : null,
      repoPath && scan.stack ? `stack: "${scan.stack}"` : null,
      `tags:`,
      `  - onyx-project`,
      `created: ${today}`,
    ].filter(Boolean).join('\n');

    const overviewBody = needsRepo ? `
## Stack

${scan.stack}

## Key Areas

${scan.keyAreas}

## Architecture Notes

${scan.architectureNotes}

## Agent Constraints

${scan.constraints}
` : `
## Goal

_Describe the project goal here._

## Success Criteria

- [ ] _Define success here_
`;

    writeFile(path.join(bundleDir, `${projectName} - Overview.md`), `---
${overviewFrontmatter}
---
## 🔗 Navigation

- [[${projectName} - Kanban|Kanban]]
- [[${projectName} - Agent Log Hub|Agent Logs]]
- [[${projectName} - Decisions|Decisions]]

# ${projectName}
${overviewBody}`);

    // Decisions register — append-only architectural decision log
    writeFile(path.join(bundleDir, `${projectName} - Decisions.md`), `---
project: "${projectName}"
type: decisions
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]

# Decisions — ${projectName}

> Append-only. Never edit or delete rows. To reverse a decision, add a new row.

## Register

| ID | Phase | Scope | Decision | Choice | Rationale | Revisable |
|---|---|---|---|---|---|---|
| D001 | — | — | Initial register | — | Bundle created | No |
`);

    // Kanban — live view anchor (dashboard renders from vault data, this is the Obsidian anchor)
    writeFile(path.join(bundleDir, `${projectName} - Kanban.md`), `---
project: "${projectName}"
type: kanban
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]

# Kanban — ${projectName}

_Phase status is managed by \`onyx\` via frontmatter tags. Open the ONYX dashboard for a live view._
`);

    // Agent Log Hub — log aggregator
    writeFile(path.join(bundleDir, `${projectName} - Agent Log Hub.md`), `---
tags: [hub-logs]
project: "${projectName}"
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]

# ${projectName} — Agent Log Hub

> All execution logs for this project.

## Logs

- [[L1|L1 — Bootstrap]]
`);

    // Knowledge — starts empty, agent fills as phases complete
    writeFile(path.join(bundleDir, `${projectName} - Knowledge.md`), `---
project: "${projectName}"
type: knowledge
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Overview|Overview]]

# ${projectName} — Knowledge

> Append-only. Add learnings, gotchas, and decisions here as phases complete.

## Learnings

_Nothing yet — agent will populate this as phases run._
`);

    // Profile-specific context docs based on init_docs list from profile frontmatter
    const profileDocTemplates: Record<string, string> = {
      'Repo Context': `---
project: "${projectName}"
type: repo-context
created: ${today}
---
# Repo Context — ${projectName}

> Populated by the P1 bootstrap phase. Do not edit manually.

## Directory map
_Agent fills this in._

## Key entry points
_Agent fills this in._

## Test suite
_Agent fills this in._

## Known gotchas
_Agent fills this in._
`,
      'Source Context': `---
project: "${projectName}"
type: source-context
created: ${today}
---
# Source Context — ${projectName}

> Stable identity facts for this content pipeline. Populated at P1, updated as positioning evolves.

## Show identity
_What this is, in one sentence._

## Audience
_Who it's for, what they already know, what they need._

## Voice and tone
_How it sounds. What it avoids._

## Positioning
_What makes this different._

## Safety rules
_Non-negotiable constraints._
`,
      'Research Brief': `---
project: "${projectName}"
type: research-brief
created: ${today}
---
# Research Brief — ${projectName}

> Standing context for all research phases.

## Background
_Why is this question being asked?_

## What we already know
_Prior knowledge and assumptions._

## Hypotheses
_Working theories going in — agent should test, not assume._

## Key sources to examine
_Known starting points._

## Decision criteria
_What would a good answer look like?_
`,
      'Operations Context': `---
project: "${projectName}"
type: operations-context
created: ${today}
---
# Operations Context — ${projectName}

> System topology and baselines. Populated at P1.

## Systems map
_Each system: name, purpose, location, access._

## Healthy baseline
_What "all green" looks like._

## Known false positives
_Alerts that look bad but are normal._

## Access inventory
_What the agent can do autonomously; what requires human approval._
`,
      'Strategy Context': `---
project: "${projectName}"
type: strategy-context
created: ${today}
---
# Strategy Context — ${projectName}

> Plain-English strategy description. No code. Agent reasons from this document.

## The edge
_Why does this opportunity exist?_

## Execution logic
_Signal → size → entry → management → exit._

## When it works
_Market conditions with positive expectancy._

## When it fails
_Conditions that kill the edge._

## Open questions
_Hypotheses to test._
`,
      'Risk Model': `---
project: "${projectName}"
type: risk-model
created: ${today}
---
# Risk Model — ${projectName}

> Hard limits. Agent treats these as inviolable.

## Position limits
- Max position size: _TBD_
- Max concurrent positions: _TBD_

## Drawdown limits
- Max daily loss: _TBD_
- Max drawdown from peak: _TBD_

## Kill switch conditions
_What triggers a full halt._

## Recovery protocol
_Human review required before restart._
`,
      'Experiment Log': `---
project: "${projectName}"
type: experiment-log
created: ${today}
---
# Experiment Log — ${projectName}

> Append-only. Never edit past entries. Each trial is a permanent record.

## Index

| Trial | Phase | Hypothesis | Expected | Actual | Delta | Date |
|---|---|---|---|---|---|---|
| — | — | _No trials yet_ | — | — | — | — |

---

## Trials

_First trial will be written here by the experimenter-engineer directive._
`,
      'Cognition Store': `---
project: "${projectName}"
type: cognition-store
created: ${today}
---
# Cognition Store — ${projectName}

> LLM-maintained structured knowledge base. The experimenter-analyzer directive maintains this.
> Append-only per section. Retract with ~~strikethrough~~, not deletion.

## Index

- [What we know works](#what-we-know-works)
- [What we know doesn't work](#what-we-know-doesnt-work)
- [Open hypotheses](#open-hypotheses)
- [Heuristics](#heuristics)

---

## What we know works

_Populated by the experimenter-analyzer after each ANALYZE phase._

---

## What we know doesn't work

_Negative results are full results. Every failed trial goes here._

---

## Open hypotheses

_Ranked by expected value × uncertainty. The experimenter-researcher reads this first._

1. _Initial hypothesis from Overview: see project frontmatter._

---

## Heuristics

_Transferable rules of thumb. Promoted here when a pattern appears across 3+ trials._

_None yet — accumulates as trials run._
`,
    };

    const createdDocs: string[] = [];
    for (const docName of initDocs) {
      const template = profileDocTemplates[docName];
      if (template) {
        const fileName = `${projectName} - ${docName}.md`;
        writeFile(path.join(bundleDir, fileName), template);
        createdDocs.push(fileName);
      }
    }

    // Profile-appropriate P1 bootstrap phase
    const p1Tasks: Record<ProfileName, string> = {
      engineering: `- [ ] Verify repo structure, confirm stack, and ensure the project builds
- [ ] Configure development environment and tooling (linter, formatter, test runner)
- [ ] Write a smoke test to validate the setup end-to-end
- [ ] Populate Repo Context with directory map, key entry points, and known gotchas
- [ ] Append bootstrap summary to Knowledge.md`,
      content: `- [ ] Read the Overview and confirm voice_profile, pipeline_stage, and safety_rules are set
- [ ] Populate Source Context: show identity, audience, voice, and safety constraints
- [ ] Create a researcher directive at Directives/researcher.md
- [ ] Create a script-writer directive at Directives/script-writer.md
- [ ] Write stub P2 phase: first production cycle (research → script → distribution)
- [ ] Append bootstrap summary to Knowledge.md`,
      research: `- [ ] Read the Overview and confirm research_question, source_constraints, and output_format are set
- [ ] Populate Research Brief: background, prior knowledge, hypotheses, key sources
- [ ] Identify 3-5 primary starting sources that meet source_constraints
- [ ] Write stub P2 phase: map the landscape (initial source survey)
- [ ] Append bootstrap summary to Knowledge.md`,
      operations: `- [ ] Read the Overview and confirm monitored_systems and runbook_path are set
- [ ] Populate Operations Context: systems map, healthy baseline, access inventory
- [ ] Verify access to each monitored system
- [ ] Create a starter runbook for the most common operation
- [ ] Write stub P2 phase: first scheduled maintenance or monitoring task
- [ ] Append bootstrap summary to Knowledge.md`,
      trading: `- [ ] Verify exchange connectivity and API access
- [ ] Run the baseline backtest to confirm backtest_command works
- [ ] Populate Strategy Context: edge, execution logic, when it works/fails
- [ ] Populate Risk Model with position limits and kill switch conditions
- [ ] Confirm risk_limits from Overview are reflected in the Risk Model doc
- [ ] Write stub P2 phase: first strategy implementation task
- [ ] Append bootstrap summary to Knowledge.md`,
      experimenter: `- [ ] Confirm hypothesis, success_metric, and baseline_value are set in Overview
- [ ] Read Cognition Store and Experiment Log (both empty — establish baseline understanding)
- [ ] Run the baseline measurement to establish the actual baseline_value
- [ ] Write the baseline result to Trial T0 in Experiment Log
- [ ] Populate Open Hypotheses in Cognition Store with 3-5 candidate experiments ranked by expected value
- [ ] Write stub P2 phase: first LEARN cycle (map the hypothesis landscape)
- [ ] Append bootstrap summary to Knowledge.md`,
    };

    const p1Acceptance: Record<ProfileName, string> = {
      engineering: `- [ ] Repo builds without errors
- [ ] Test suite runs (may have failures — that's OK at this stage)
- [ ] Repo Context populated
- [ ] Knowledge.md has at least one entry`,
      content: `- [ ] Source Context populated
- [ ] researcher.md directive exists in Directives/
- [ ] script-writer.md directive exists in Directives/
- [ ] P2 phase file exists with state: backlog
- [ ] Knowledge.md has at least one entry`,
      research: `- [ ] Research Brief populated
- [ ] At least 3 qualifying starting sources identified
- [ ] P2 phase exists with state: backlog
- [ ] Knowledge.md has at least one entry`,
      operations: `- [ ] Operations Context populated
- [ ] Access confirmed for all monitored systems
- [ ] At least one runbook exists
- [ ] P2 phase exists with state: backlog
- [ ] Knowledge.md has at least one entry`,
      trading: `- [ ] Exchange connectivity confirmed
- [ ] Backtest command runs successfully
- [ ] Strategy Context and Risk Model populated
- [ ] P2 phase exists with state: backlog
- [ ] Knowledge.md has at least one entry`,
      experimenter: `- [ ] Baseline measurement run and recorded as Trial T0 in Experiment Log
- [ ] baseline_value in Overview reflects the actual measured baseline
- [ ] Cognition Store Open Hypotheses has at least 3 candidates
- [ ] P2 phase exists (LEARN cycle) with state: backlog
- [ ] Knowledge.md has at least one entry`,
    };

    writeFile(path.join(phasesDir, 'P1 - Bootstrap.md'), `---
project: "${projectName}"
project_id: "${projectName}"
phase_number: 1
phase_name: "Bootstrap"
milestone: "v0.1"
risk: "low"
state: backlog
depends_on: []
locked_by: ""
locked_at: ""
replan_count: 0
tags:
  - onyx-phase
  - phase-backlog
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Kanban|Kanban]]
- [[L1|L1 — Execution Log]]

# P1 — Bootstrap

## Summary

Establish the project foundation. Set up context documents, verify access to all required systems, and ensure the bundle is ready for execution.

## Acceptance Criteria

${p1Acceptance[profileName]}

## Tasks

- [ ] ${p1Tasks[profileName].split('\n- [ ] ').join('\n- [ ] ')}

## Agent Log

(none yet)
`);

    // Starter log
    writeFile(path.join(logsDir, 'L1 - Bootstrap.md'), `---
tags: [project-log]
project: "${projectName}"
phase_number: 1
phase_name: Bootstrap
created: ${today}
---
## 🔗 Navigation

- [[P1 - Bootstrap|P1 — Bootstrap]]
- [[${projectName} - Agent Log Hub|Agent Log Hub]]

# L1 — Bootstrap

## Log

- [${today}] **bundle_created** — Bundle initialised by \`onyx init\` (profile: ${profileName})
`);

    const extraDocsSummary = createdDocs.length > 0 ? `\n    ${createdDocs.join('\n    ')}` : '';

    const nextSteps: Record<ProfileName, string> = {
      engineering: `    1. Fill in Architecture Notes and Agent Constraints in Overview
    2. Review P1 — Bootstrap tasks and acceptance criteria
    3. Set P1 tag to phase-ready when ready to execute
    4. Run: onyx run --project "${projectName}"`,
      content: `    1. Fill in Goal and Success Criteria in Overview
    2. Set voice_profile and pipeline_stage in Overview frontmatter
    3. Review P1 — Bootstrap tasks (will populate Source Context + directives)
    4. Set P1 tag to phase-ready, then run: onyx run --project "${projectName}"`,
      research: `    1. Fill in the research_question, source_constraints, and output_format in Overview frontmatter
    2. Fill in background and hypotheses in the Research Brief
    3. Set P1 tag to phase-ready, then run: onyx run --project "${projectName}"`,
      operations: `    1. Fill in monitored_systems and runbook_path in Overview frontmatter
    2. Review P1 — Bootstrap tasks (will map systems and verify access)
    3. Set P1 tag to phase-ready, then run: onyx run --project "${projectName}"`,
      trading: `    1. Fill in exchange, strategy_type, risk_limits, and backtest_command in Overview frontmatter
    2. Review Strategy Context and Risk Model stubs — agents will populate at P1
    3. Set P1 tag to phase-ready, then run: onyx run --project "${projectName}"`,
      experimenter: `    1. Fill in hypothesis, success_metric, and baseline_value in Overview frontmatter
    2. P1 Bootstrap will measure your actual baseline and seed the Cognition Store
    3. Set P1 tag to phase-ready, then run: onyx run --project "${projectName}"
    4. Each 4-phase cycle: LEARN → DESIGN → EXPERIMENT → ANALYZE (repeating)`,
    };

    console.log(`
  Bundle created: ${bundleDir}

  Structure:
    ${projectName} - Overview.md    (profile: ${profileName}${repoPath ? `, repo: ${repoPath}` : ''})
    ${projectName} - Decisions.md   (architectural decision log)
    ${projectName} - Knowledge.md   (accumulates learnings across phases)
    ${projectName} - Kanban.md      (Obsidian anchor — live view in dashboard)
    ${projectName} - Agent Log Hub.md${extraDocsSummary}
    Phases/P1 - Bootstrap.md
    Logs/L1 - Bootstrap.md

  Next steps:
${nextSteps[profileName]}
`);

  } finally {
    rl.close();
  }
}
