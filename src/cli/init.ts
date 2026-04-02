// gzos init [project-name]
// Creates a project bundle in the vault.
// Interactive: prompts for project name and repo path if not supplied.
// Auto-scans repo to populate Repo Context (stack, key areas, architecture notes).

import { loadConfig } from '../config/load.js';
import { writeFile } from '../vault/writer.js';
import { readRawFile } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

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
  let constraints = '- Commit after each task: `git commit -m "gzos: PHASE — TASK"`\n- Run tests after each task if a test suite exists\n- No breaking changes to public API without noting it here';

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
      constraints = constraintSection + '\n- Commit after each task: `git commit -m "gzos: PHASE — TASK"`';
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
export async function runInit(projectNameArg?: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Load config (may fail if vault_root not set — we ask for it)
    let config;
    try {
      config = loadConfig();
    } catch {
      config = null;
    }

    console.log('\ngzos init — Create a new project bundle\n');

    // Project name
    let projectName = projectNameArg?.trim() ?? '';
    if (!projectName) {
      projectName = (await prompt(rl, '  Project name: ')).trim();
    } else {
      console.log(`  Project name: ${projectName}`);
    }
    if (!projectName) { console.error('Project name is required.'); process.exit(1); }

    // Repo path
    const repoDefault = process.cwd();
    const repoAnswer = await prompt(rl, `  Repo path [${repoDefault}]: `);
    const repoPath = repoAnswer.trim() || repoDefault;
    if (!fs.existsSync(repoPath)) {
      console.error(`Repo path not found: ${repoPath}`);
      process.exit(1);
    }

    // Vault root
    let vaultRoot = config?.vaultRoot ?? '';
    if (!vaultRoot) {
      vaultRoot = (await prompt(rl, '  Vault root (absolute path to Obsidian vault): ')).trim();
      if (!vaultRoot) { console.error('Vault root is required.'); process.exit(1); }
    } else {
      console.log(`  Vault root: ${vaultRoot}`);
    }

    // Projects folder
    const projectsGlob = config?.projectsGlob ?? '01 - Projects/**';
    const projectsBase = projectsGlob.replace(/\/\*\*.*$/, '');
    const projectsRoot = path.join(vaultRoot, projectsBase);

    const bundleDir = path.join(projectsRoot, projectName);
    const phasesDir = path.join(bundleDir, 'Phases');
    const logsDir   = path.join(bundleDir, 'Logs');
    const today = new Date().toISOString().slice(0, 10);

    console.log(`\n  Scanning repo...`);
    const scan = scanRepo(repoPath);
    console.log(`  Stack detected: ${scan.stack}`);

    rl.close();

    // Overview — main node + repo info (stack, key areas, constraints all live here now)
    writeFile(path.join(bundleDir, `${projectName} - Overview.md`), `---
project: "${projectName}"
type: overview
status: planning
repo_path: "${repoPath}"
stack: "${scan.stack}"
tags:
  - gz-project
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Kanban|Kanban]]
- [[${projectName} - Agent Log Hub|Agent Logs]]
- [[${projectName} - Decisions|Decisions]]

# ${projectName}

## Goal

_Describe the project goal here._

## Success Criteria

- [ ] _Define success here_

## Stack

${scan.stack}

## Key Areas

${scan.keyAreas}

## Architecture Notes

${scan.architectureNotes}

## Agent Constraints

${scan.constraints}
`);

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

_Phase status is managed by \`gzos\` via frontmatter tags. Open the GZOS dashboard for a live view._
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

- [[L1|L1 — Project Setup]]
`);

    // Starter phase
    writeFile(path.join(phasesDir, 'P1 - Project Setup.md'), `---
project: "${projectName}"
project_id: "${projectName}"
phase_number: 1
phase_name: "Project Setup"
milestone: ""
phase_type: "slice"
risk: "medium"
status: backlog
depends_on: []
locked_by: ""
locked_at: ""
replan_count: 0
tags:
  - gz-phase
  - phase-backlog
created: ${today}
---
## 🔗 Navigation

- [[${projectName} - Kanban|Kanban]]
- [[L1|L1 — Execution Log]]

# P1 — Project Setup

## 📋 Summary

Initial setup, scaffolding, and environment configuration.

## 🧠 Context Pack (do not skip)

_Fill in: why this phase exists, what the agent must know, any constraints specific to this phase._

## ✅ Acceptance Criteria

- [ ] Repo is accessible and builds without errors
- [ ] Development tooling is configured and runs

## 📂 Tasks

<!-- AGENT_WRITABLE_START:phase-plan -->
- [ ] Verify repo structure, confirm stack, and ensure the project builds
- [ ] Configure development environment and tooling (linter, formatter, test runner)
- [ ] Write a smoke test to validate the setup end-to-end
<!-- AGENT_WRITABLE_END:phase-plan -->

## Agent Log

(none yet)
`);

    // Starter log
    writeFile(path.join(logsDir, 'L1 - Project Setup.md'), `---
tags: [project-log]
project: "${projectName}"
phase_number: 1
phase_name: Project Setup
created: ${today}
---
## 🔗 Navigation

- [[P1 - Project Setup|P1 — Project Setup]]
- [[${projectName} - Agent Log Hub|Agent Log Hub]]

# L1 — Project Setup

## Log

- [${today}] **bundle_created** — Bundle initialised by \`gzos init\`
`);

    console.log(`
  Bundle created: ${bundleDir}

  Structure:
    ${projectName} - Overview.md    (repo_path, stack, key areas, constraints)
    ${projectName} - Decisions.md   (architectural decision log)
    ${projectName} - Kanban.md      (Obsidian anchor — live view in dashboard)
    ${projectName} - Agent Log Hub.md
    Phases/P1 - Project Setup.md
    Logs/L1 - Project Setup.md

  Next steps:
    1. Fill in Goal and Success Criteria in Overview
    2. Fill in Context Pack in P1 — describe what the agent needs to know
    3. Set P1 tag to phase-ready when ready to execute
    4. Run: gzos run --project "${projectName}"
`);

  } finally {
    rl.close();
  }
}
