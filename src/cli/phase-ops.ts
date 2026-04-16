// phase-ops.ts — atomic phase management commands
//
// onyx ready <project> [phase]     — set phase to ready (no YAML editing)
// onyx block <project> [phase] <reason> — block with reason
// onyx new phase <project> <name>  — create a new phase file
// onyx check <project>             — validate vault state before running

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { stateFromFrontmatter, countTasks } from '../shared/vault-parse.js';
import { setPhaseTag } from '../vault/writer.js';
import { readPhaseNode } from '../vault/reader.js';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// onyx ready <project> [phase]
// ---------------------------------------------------------------------------

export async function runReady(projectArg: string, phaseNum?: number): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  const projectPhases = matchProject(allPhases, projectArg);
  if (!projectPhases) return;

  const { id: projectId, phases } = projectPhases;

  let target;

  if (phaseNum !== undefined) {
    target = phases.find(p => Number(p.frontmatter['phase_number']) === phaseNum);
    if (!target) {
      console.error(`[onyx] P${phaseNum} not found in "${projectId}"`);
      process.exit(1);
    }
  } else {
    // Auto-pick: next backlog phase whose depends_on are all completed
    const completedNums = new Set(
      phases
        .filter(p => stateFromFrontmatter(p.frontmatter) === 'completed')
        .map(p => Number(p.frontmatter['phase_number']))
    );
    target = phases
      .filter(p => {
        if (stateFromFrontmatter(p.frontmatter) !== 'backlog') return false;
        const deps = p.frontmatter['depends_on'];
        const depsArr: number[] = Array.isArray(deps) ? (deps as unknown[]).map(Number) : [];
        return depsArr.every(d => completedNums.has(d));
      })
      .sort((a, b) => Number(a.frontmatter['phase_number'] ?? 999) - Number(b.frontmatter['phase_number'] ?? 999))[0];

    if (!target) {
      console.error(`[onyx] No activatable backlog phase found in "${projectId}"`);
      console.log('  All phases may have unmet dependencies. Run: onyx status');
      process.exit(1);
    }
  }

  const num = target.frontmatter['phase_number'];
  const name = String(target.frontmatter['phase_name'] ?? '');
  const prev = stateFromFrontmatter(target.frontmatter);

  if (prev === 'ready') {
    console.log(`[onyx] ${projectId} P${num} — ${name} is already ready.`);
    console.log(`  → Run: onyx next`);
    return;
  }
  if (prev === 'active') {
    console.log(`[onyx] ${projectId} P${num} — ${name} is currently active (agent running).`);
    return;
  }

  setPhaseTag(target.path, 'phase-ready');
  console.log(`[onyx] ${projectId}  P${num} — ${name}:  ${prev} → ready`);
  console.log(`  → Run it: onyx next`);
}

// ---------------------------------------------------------------------------
// onyx block <project> [phase] <reason>
// ---------------------------------------------------------------------------

export async function runBlockPhase(projectArg: string, phaseNum: number | undefined, reason: string): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  const projectPhases = matchProject(allPhases, projectArg);
  if (!projectPhases) return;

  const { id: projectId, phases } = projectPhases;

  let target;
  if (phaseNum !== undefined) {
    target = phases.find(p => Number(p.frontmatter['phase_number']) === phaseNum);
  } else {
    // Default: active or most-recently-ready phase
    target = phases.find(p => stateFromFrontmatter(p.frontmatter) === 'active')
          ?? phases.find(p => stateFromFrontmatter(p.frontmatter) === 'ready');
  }

  if (!target) {
    console.error(`[onyx] No active/ready phase found in "${projectId}"`);
    process.exit(1);
  }

  const num = target.frontmatter['phase_number'];
  const name = String(target.frontmatter['phase_name'] ?? '');

  // Write ## Human Requirements section
  let content = fs.readFileSync(target.path, 'utf-8');
  const hrBlock = `## Human Requirements\n\n${reason}\n`;
  if (content.includes('## Human Requirements')) {
    content = content.replace(/## Human Requirements[\s\S]*?(?=\n## |\s*$)/, hrBlock);
  } else {
    // Insert before Agent Log if it exists, else append
    if (content.includes('## Agent Log')) {
      content = content.replace('## Agent Log', `${hrBlock}\n## Agent Log`);
    } else {
      content = content.trimEnd() + `\n\n${hrBlock}`;
    }
  }
  fs.writeFileSync(target.path, content, 'utf-8');

  setPhaseTag(target.path, 'phase-blocked');
  console.log(`[onyx] ${projectId}  P${num} — ${name}:  → blocked`);
  console.log(`  Reason: ${reason}`);
  console.log(`  → Fix it, then: onyx reset "${projectId}"`);
}

// ---------------------------------------------------------------------------
// onyx new phase <project> <name> [opts]
// ---------------------------------------------------------------------------

export async function runNewPhase(
  projectArg: string,
  phaseName: string,
  opts: { priority?: number; risk?: string; directive?: string } = {}
): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  const projectPhases = matchProject(allPhases, projectArg);
  if (!projectPhases) return;

  const { id: projectId, phases } = projectPhases;
  const bundleDir = path.dirname(path.dirname(phases[0]!.path));
  const phasesDir  = path.join(bundleDir, 'Phases');

  const maxPhaseNum = Math.max(0, ...phases.map(p => Number(p.frontmatter['phase_number'] ?? 0)));
  const newNum      = maxPhaseNum + 1;
  const dependsOn   = maxPhaseNum > 0 ? [maxPhaseNum] : [];

  const safeName = phaseName.replace(/[^a-zA-Z0-9 \-]/g, '').slice(0, 60).trim();
  const fileName = `P${newNum} - ${safeName}.md`;
  const filePath = path.join(phasesDir, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`[onyx] File already exists: ${filePath}`);
    process.exit(1);
  }

  const directiveLine = opts.directive ? `directive: ${opts.directive}` : '';
  const content = [
    `---`,
    `project_id: "${projectId}"`,
    `phase_number: ${newNum}`,
    `phase_name: "${phaseName}"`,
    `state: backlog`,
    `status: backlog`,
    `risk: ${opts.risk ?? 'medium'}`,
    `priority: ${opts.priority ?? 5}`,
    ...(directiveLine ? [directiveLine] : []),
    `depends_on: ${JSON.stringify(dependsOn)}`,
    `locked_by: ""`,
    `locked_at: ""`,
    `tags:`,
    `  - onyx-phase`,
    `  - phase-backlog`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    `---`,
    ``,
    `## Summary`,
    ``,
    phaseName,
    ``,
    `## Acceptance Criteria`,
    ``,
    `- [ ] _(define acceptance criteria)_`,
    ``,
    `## Tasks`,
    ``,
    `- [ ] _(generate tasks: onyx atomise "${projectId}" ${newNum})_`,
    ``,
    `## Agent Log`,
    ``,
    `_(none yet)_`,
  ].join('\n');

  if (!fs.existsSync(phasesDir)) fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');

  console.log(`[onyx] Created P${newNum} — ${phaseName}`);
  if (dependsOn.length > 0) console.log(`  Depends on: P${dependsOn.join(', P')}`);
  console.log(`  → Generate tasks: onyx atomise "${projectId}" ${newNum}`);
  console.log(`  → Skip tasks, activate: onyx ready "${projectId}" ${newNum}`);
}

// ---------------------------------------------------------------------------
// onyx check <project>
// ---------------------------------------------------------------------------

export async function runCheck(projectArg: string): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  const projectPhases = matchProject(allPhases, projectArg);
  if (!projectPhases) return;

  const { id: projectId, phases } = projectPhases;
  const bundleDir = path.dirname(path.dirname(phases[0]!.path));

  console.log(`\n─── ${projectId} — check ───\n`);
  let issues = 0;

  // 1. Overview + required fields
  const overviewPath = path.join(bundleDir, `${projectId} - Overview.md`);
  if (!fs.existsSync(overviewPath)) {
    console.log(`✗ Overview.md not found at ${overviewPath}`);
    issues++;
  } else {
    const ov = readPhaseNode(overviewPath);
    const profile = String(ov.frontmatter['profile'] ?? 'engineering');
    console.log(`✓ Overview  (profile: ${profile})`);

    const profilePath = path.join(config.vaultRoot, '08 - System', 'Profiles', `${profile}.md`);
    if (fs.existsSync(profilePath)) {
      const profileNode = readPhaseNode(profilePath);
      const rf = profileNode.frontmatter['required_fields'];
      if (Array.isArray(rf)) {
        for (const field of rf.map(String)) {
          const val = String(ov.frontmatter[field] ?? '').trim();
          if (!val) {
            console.log(`  ✗ Missing required field: ${field}`);
            issues++;
          } else {
            const display = val.length > 50 ? val.slice(0, 47) + '...' : val;
            console.log(`  ✓ ${field}: ${display}`);
          }
        }
      }
    } else {
      console.log(`  ⚠ Profile file not found: ${profilePath}`);
    }
  }

  // 2. Knowledge.md
  const knowledgePath = path.join(bundleDir, `${projectId} - Knowledge.md`);
  if (fs.existsSync(knowledgePath)) {
    const kStats = fs.statSync(knowledgePath);
    const kAge = Math.floor((Date.now() - kStats.mtimeMs) / 86_400_000);
    console.log(`✓ Knowledge.md  (updated ${kAge === 0 ? 'today' : `${kAge}d ago`})`);
  } else {
    console.log(`⚠ Knowledge.md missing — learnings won't compound`);
  }

  // 3. Phases
  const sorted = phases.sort((a, b) =>
    Number(a.frontmatter['phase_number'] ?? 0) - Number(b.frontmatter['phase_number'] ?? 0)
  );
  const completedNums = new Set(
    sorted.filter(p => stateFromFrontmatter(p.frontmatter) === 'completed')
          .map(p => Number(p.frontmatter['phase_number']))
  );

  console.log(`\nPhases (${phases.length}):`);
  for (const phase of sorted) {
    const num   = Number(phase.frontmatter['phase_number'] ?? 0);
    const name  = String(phase.frontmatter['phase_name'] ?? '');
    const state = stateFromFrontmatter(phase.frontmatter);
    const deps  = phase.frontmatter['depends_on'];
    const depsArr: number[] = Array.isArray(deps) ? (deps as unknown[]).map(Number) : [];
    const directive = String(phase.frontmatter['directive'] ?? '');
    const cycleType = String(phase.frontmatter['cycle_type'] ?? '');
    const { total } = countTasks(phase.content);

    const icon = state === 'completed' ? '✓' : state === 'active' ? '▶' : state === 'blocked' ? '✗' : state === 'ready' ? '→' : '○';

    // Directive resolution
    let dirNote = '';
    if (directive) {
      const localPath  = path.join(bundleDir, 'Directives', `${directive}.md`);
      const systemPath = path.join(config.vaultRoot, '08 - System', 'Agent Directives', `${directive}.md`);
      if (fs.existsSync(localPath))   dirNote = `  directive: ✓ ${directive}`;
      else if (fs.existsSync(systemPath)) dirNote = `  directive: ✓ ${directive} (system)`;
      else { dirNote = `  directive: ✗ "${directive}" NOT FOUND`; issues++; }
    } else if (cycleType) {
      dirNote = `  cycle: ${cycleType} (auto-wired)`;
    }

    // Unmet deps
    const unmet = depsArr.filter(d => !completedNums.has(d));

    console.log(`  ${icon} P${num} — ${name}  [${state}]${dirNote}`);
    if (unmet.length > 0) {
      console.log(`    ⚠ waiting on: P${unmet.join(', P')}`);
    }
    if (state !== 'completed' && state !== 'active' && total === 0) {
      console.log(`    ⚠ no tasks — onyx atomise "${projectId}" ${num}`);
    }
    if (state === 'blocked') {
      const reason = extractBlockedReason(phase.content);
      if (reason) console.log(`    ↳ ${reason}`);
    }
  }

  console.log('');
  if (issues > 0) {
    console.log(`${issues} issue(s) found. Fix before running.`);
  } else {
    console.log(`All checks passed. → onyx next "${projectId}"`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function matchProject(
  allPhases: ReturnType<typeof discoverAllPhases>,
  projectArg: string
): { id: string; phases: ReturnType<typeof discoverAllPhases> } | null {
  const matched = allPhases.filter(p => {
    const pid = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
    return pid.toLowerCase().includes(projectArg.toLowerCase());
  });

  if (matched.length === 0) {
    console.error(`[onyx] No project matching "${projectArg}"`);
    console.log('  Available: onyx status');
    return null;
  }

  // Use the most specific project_id match
  const pid = String(matched[0]!.frontmatter['project_id'] ?? matched[0]!.frontmatter['project'] ?? projectArg);
  return { id: pid, phases: matched };
}

function extractBlockedReason(content: string): string {
  const m = content.match(/## Human Requirements([\s\S]*?)(?=\n## |\s*$)/);
  if (!m) return '';
  const t = m[1]!.trim();
  if (!t || t === '(none)' || t === 'None.') return '';
  return t.replace(/^-\s*/, '').split('\n')[0]!.slice(0, 100);
}
