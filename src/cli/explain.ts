// onyx explain [project]
// Reads vault state for a project and prints plain English:
// what it is, what's happening now, what the agent knows, what's next.
// No LLM — pure vault read + format.

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { readPhaseNode } from '../vault/reader.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';
import path from 'path';
import fs from 'fs';

export async function runExplain(projectArg?: string): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  if (allPhases.length === 0) {
    console.log('No ONYX phase notes found. Run: onyx init "My Project"');
    return;
  }

  // Group phases by project
  const byProject = new Map<string, typeof allPhases>();
  for (const phase of allPhases) {
    const pid = String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? '');
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid)!.push(phase);
  }

  // Filter to requested project if given
  let projects = [...byProject.keys()];
  if (projectArg) {
    const needle = projectArg.toLowerCase();
    projects = projects.filter(p => p.toLowerCase().includes(needle));
    if (projects.length === 0) {
      console.log(`No project matching "${projectArg}". Available: ${[...byProject.keys()].join(', ')}`);
      return;
    }
  }

  for (const projectId of projects) {
    const phases = byProject.get(projectId)!;
    explainProject(projectId, phases, config.vaultRoot);
    if (projects.length > 1) console.log('');
  }
}

function explainProject(projectId: string, phases: ReturnType<typeof discoverAllPhases>, vaultRoot: string): void {
  const bundleDir = path.dirname(path.dirname(phases[0]!.path));

  // Read Overview
  const overviewPath = path.join(bundleDir, `${projectId} - Overview.md`);
  const overview = fs.existsSync(overviewPath) ? readPhaseNode(overviewPath) : null;
  const profile  = String(overview?.frontmatter['profile'] ?? 'engineering');
  const repoPath = String(overview?.frontmatter['repo_path'] ?? '');

  // Phase counts by state
  const stateCounts: Record<string, number> = {};
  for (const p of phases) {
    const s = stateFromFrontmatter(p.frontmatter);
    stateCounts[s] = (stateCounts[s] ?? 0) + 1;
  }
  const stateStr = ['active', 'ready', 'planning', 'backlog', 'blocked', 'completed']
    .filter(s => stateCounts[s])
    .map(s => `${stateCounts[s]} ${s}`)
    .join(', ');

  // Active / ready phases
  const activePhases  = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'active');
  const readyPhases   = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'ready');
  const blockedPhases = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'blocked');

  console.log(`\n━━━ ${projectId}`);
  console.log(`  Profile:  ${profile}${repoPath ? `  (repo: ${repoPath})` : ''}`);
  console.log(`  Phases:   ${stateStr || 'none'}`);

  // Experimenter summary
  if (profile === 'experimenter' && overview) {
    const hyp    = String(overview.frontmatter['hypothesis']     ?? '—');
    const metric = String(overview.frontmatter['success_metric'] ?? '—');
    const base   = overview.frontmatter['baseline_value'] !== undefined
      ? String(overview.frontmatter['baseline_value']) : '—';
    console.log(`  Hypothesis: ${hyp}`);
    console.log(`  Metric:     ${metric}  (baseline: ${base})`);
  }

  // Active phase detail
  if (activePhases.length > 0) {
    console.log('');
    for (const p of activePhases) {
      const num   = p.frontmatter['phase_number'] ?? '?';
      const name  = String(p.frontmatter['phase_name'] ?? path.basename(p.path, '.md'));
      const cycle = p.frontmatter['cycle_type'] ? ` [${p.frontmatter['cycle_type']}]` : '';
      const dir   = resolveDirectiveLabel(p, bundleDir, vaultRoot);
      const lockedAt = String(p.frontmatter['locked_at'] ?? '');
      const since    = lockedAt ? `  (since ${lockedAt.slice(0, 10)})` : '';
      console.log(`  ▶ ACTIVE  P${num} — ${name}${cycle}${since}`);
      if (dir) console.log(`    Directive: ${dir}`);
      // Acceptance criteria
      const acceptance = extractSection(p.content, 'Acceptance Criteria');
      if (acceptance) {
        const lines = acceptance.split('\n').filter(l => l.trim().startsWith('-')).slice(0, 4);
        if (lines.length > 0) {
          console.log('    Acceptance:');
          for (const l of lines) console.log(`      ${l.trim()}`);
        }
      }
    }
  } else {
    console.log('  ▶ No phase currently active.');
  }

  // Ready / queued
  if (readyPhases.length > 0) {
    console.log('');
    console.log('  Queued (phase-ready, will run next):');
    for (const p of readyPhases.slice(0, 3)) {
      const num   = p.frontmatter['phase_number'] ?? '?';
      const name  = String(p.frontmatter['phase_name'] ?? '');
      const prio  = p.frontmatter['priority'] !== undefined ? `  priority:${p.frontmatter['priority']}` : '';
      const cycle = p.frontmatter['cycle_type'] ? ` [${p.frontmatter['cycle_type']}]` : '';
      const dir   = resolveDirectiveLabel(p, bundleDir, vaultRoot);
      const dirStr = dir ? `  → ${dir}` : '';
      console.log(`    P${num} — ${name}${cycle}${prio}${dirStr}`);
    }
    if (readyPhases.length > 3) console.log(`    … and ${readyPhases.length - 3} more`);
  }

  // Blocked
  if (blockedPhases.length > 0) {
    console.log('');
    console.log('  ⚠ Blocked:');
    for (const p of blockedPhases) {
      const num  = p.frontmatter['phase_number'] ?? '?';
      const name = String(p.frontmatter['phase_name'] ?? '');
      console.log(`    P${num} — ${name}  (run: onyx reset --project "${projectId}")`);
    }
  }

  // Knowledge summary
  const knowledgePath = path.join(bundleDir, `${projectId} - Knowledge.md`);
  if (fs.existsSync(knowledgePath)) {
    const raw   = fs.readFileSync(knowledgePath, 'utf-8');
    const entries = (raw.match(/^##\s+/gm) ?? []).length - 1; // sections minus Index
    const mtime = fs.statSync(knowledgePath).mtime.toISOString().slice(0, 10);
    if (entries > 0) console.log(`\n  Knowledge: ${entries} topic(s), last updated ${mtime}`);
  }

  // Cognition Store (experimenter)
  if (profile === 'experimenter') {
    const cognitionPath = path.join(bundleDir, `${projectId} - Cognition Store.md`);
    const expLogPath    = path.join(bundleDir, `${projectId} - Experiment Log.md`);
    if (fs.existsSync(expLogPath)) {
      const expRaw   = fs.readFileSync(expLogPath, 'utf-8');
      const trials   = (expRaw.match(/^## Trial T\d+/gm) ?? []).length;
      console.log(`  Experiment Log: ${trials} trial(s)`);
    }
    if (fs.existsSync(cognitionPath)) {
      const cogRaw  = fs.readFileSync(cognitionPath, 'utf-8');
      const hyps    = (cogRaw.match(/^\d+\./gm) ?? []).length;
      if (hyps > 0) console.log(`  Open hypotheses in Cognition Store: ${hyps}`);
    }
  }

  // Run hint
  console.log('');
  const hasWork = activePhases.length > 0 || readyPhases.length > 0;
  if (hasWork) {
    console.log(`  Run: onyx run --project "${projectId}"`);
  } else if (stateCounts['backlog']) {
    console.log(`  All ready phases done. Set a backlog phase to phase-ready, then: onyx run --project "${projectId}"`);
  } else {
    console.log(`  Project complete.`);
  }
}

// Resolve the human-readable directive name for a phase (no path, just the name)
function resolveDirectiveLabel(phase: ReturnType<typeof discoverAllPhases>[number], bundleDir: string, vaultRoot: string): string {
  const explicit = String(phase.frontmatter['directive'] ?? '').trim();
  if (explicit) return explicit;

  const profile   = String(phase.frontmatter['profile'] ?? '').trim();
  const cycleType = String(phase.frontmatter['cycle_type'] ?? '').trim();

  // Experimenter auto-wiring
  if (cycleType) {
    const cycleMap: Record<string, string> = {
      learn: 'experimenter-researcher', design: 'experimenter-researcher',
      experiment: 'experimenter-engineer', analyze: 'experimenter-analyzer',
    };
    if (cycleMap[cycleType]) return `${cycleMap[cycleType]} (auto)`;
  }

  // Check if bundle has a Directives/ folder with any .md files
  const dirsPath = path.join(bundleDir, 'Directives');
  if (fs.existsSync(dirsPath)) {
    const files = fs.readdirSync(dirsPath).filter(f => f.endsWith('.md'));
    if (files.length === 1) return `${path.basename(files[0]!, '.md')} (bundle)`;
    if (files.length > 1)  return `${files.length} directives in bundle`;
  }

  return '';
}

// Extract a named section from phase content
function extractSection(content: string, heading: string): string {
  const m = content.match(new RegExp(`## (?:✅\\s+)?${heading}([\\s\\S]*?)(?=\\n##|$)`));
  return m?.[1]?.trim() ?? '';
}
