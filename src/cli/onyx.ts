#!/usr/bin/env node
// onyx — ONYX CLI (commander-based)
//
// Consistent arg pattern: onyx <verb> [project] [--flags]
// Global flags: --json (machine-readable output), --verbose/-v

import { runInit } from './init.js';
import { runExplain } from './explain.js';
import { runDoctor } from './doctor.js';
import { runPlan } from './plan.js';
import { runCapture } from './capture.js';
import { runResearch } from './research.js';
import { runConsolidate } from './consolidate.js';
import { runMonthlyConsolidate } from './monthly-consolidate.js';
import { runReset } from './reset.js';
import { runDecompose, runAtomiseCommand, runPlanProject } from './plan-project.js';
import { runLogs } from './logs.js';
import { runRefreshContext } from './refresh-context.js';
import { runLinearUplink } from './linear-uplink.js';
import { loadConfig } from '../config/load.js';
import { runLoop } from '../controller/loop.js';
import { runAllHeals } from '../healer/index.js';
import { maintainVaultGraph } from '../vault/graphMaintainer.js';
import { consolidateVaultNodes } from '../vault/nodeConsolidator.js';
import { discoverAllPhases } from '../vault/discover.js';
import { importLinearProject } from '../linear/import.js';
import { setVerbose } from '../utils/log.js';
import { countTasks, stateFromFrontmatter } from '../shared/vault-parse.js';
import { setPhaseTag } from '../vault/writer.js';
import { readPhaseNode } from '../vault/reader.js';
import { normalizeTag, toTag } from '../fsm/states.js';
import { Command } from 'commander';
import path from 'path';

// Format task progress from shared countTasks
function taskProgress(content: string): string {
  const { done, total } = countTasks(content);
  if (total === 0) return '';
  return ` (${done}/${total} tasks)`;
}

// Extract a brief blocked reason from a phase note's ## Human Requirements or ## Blockers section.
function extractBlockedReason(content: string): string {
  const hrMatch = content.match(/## Human Requirements([\s\S]*?)(?=\n##|\s*$)/);
  if (hrMatch) {
    const hr = hrMatch[1]!.trim();
    if (hr && hr !== '(none)' && hr !== 'None.' && hr !== '- (none)') {
      return hr.split('\n')[0]!.trim().slice(0, 80);
    }
  }
  const blMatch = content.match(/## Blockers([\s\S]*?)(?=\n##|\s*$)/);
  if (blMatch) {
    const bl = blMatch[1]!.trim();
    if (bl && bl !== '(none)') return bl.split('\n')[0]!.trim().slice(0, 80);
  }
  return '';
}

// Render a single phase line for human-readable status output.
function renderPhaseLine(phase: ReturnType<typeof discoverAllPhases>[number], indent: string): void {
  const state = stateFromFrontmatter(phase.frontmatter);
  const name = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
  const num = phase.frontmatter['phase_number'] ? `P${phase.frontmatter['phase_number']} — ` : '';
  const lock = phase.frontmatter['locked_by'] ? ` [locked: ${phase.frontmatter['locked_by']}]` : '';
  const risk = phase.frontmatter['risk'] ? ` [${phase.frontmatter['risk']}]` : '';
  const icon = state === 'completed' ? '✓' : state === 'active' ? '▶' : state === 'blocked' ? '✗' : '○';
  const progress = (state === 'active' || state === 'ready') ? taskProgress(phase.content) : '';
  console.log(`${indent}${icon}  [${state}] ${num}${name}${progress}${risk}${lock}`);
  if (state === 'blocked') {
    const reason = extractBlockedReason(phase.content);
    if (reason) console.log(`${indent}       ↳ ${reason}`);
  }
}

const program = new Command();
program
  .name('onyx')
  .description('ONYX — vault-native AI agent orchestration')
  .version('0.1.0')
  .option('-v, --verbose', 'debug logging')
  .option('--json', 'machine-readable output');

program.hook('preAction', () => {
  const opts = program.opts<{ verbose?: boolean; json?: boolean }>();
  if (opts.verbose) setVerbose(true);
});

// Helper to get global json flag inside actions
function isJson(): boolean {
  return !!program.opts<{ json?: boolean }>().json;
}

// ── init ──────────────────────────────────────────────────────────────────
program
  .command('init [name]')
  .description('Create a new project bundle')
  .option('--profile <name>', 'project profile: engineering | content | research | operations | trading | experimenter')
  .action(async (name, opts) => { await runInit(name, (opts as { profile?: string }).profile); });

// ── explain ───────────────────────────────────────────────────────────────
program
  .command('explain [project]')
  .description('Plain English: what is this project doing, who is the agent, what comes next')
  .action(async (project) => { await runExplain(project); });

// ── dashboard ─────────────────────────────────────────────────────────────
program
  .command('dashboard [port]')
  .description('Launch web dashboard (default port 7070)')
  .action(async (port) => {
    const { execSync: execDash } = await import('child_process');
    const dashDir = new URL('../../dashboard', import.meta.url).pathname;
    const dashPort = port ?? '7070';
    console.log(`[onyx] Dashboard → http://localhost:${dashPort}`);
    try { execDash(`npm run dev -- --port ${dashPort}`, { cwd: dashDir, stdio: 'inherit' }); } catch { /* killed */ }
  });

// ── doctor ────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Pre-flight checks')
  .action(async () => { await runDoctor(); });

// ── run ───────────────────────────────────────────────────────────────────
program
  .command('run [project]')
  .description('Execute ready phases')
  .option('--project <name>', 'filter by project')
  .option('--phase <n>', 'execute a specific phase number', (v) => parseInt(v, 10))
  .option('--dry-run', 'preview without running agents')
  .option('--once', 'single iteration then exit')
  .action(async (positionalProject, opts) => {
    const config = loadConfig();
    const dryRun = !!opts.dryRun;
    let once = !!opts.once;
    const projectFilter = opts.project ?? positionalProject ?? undefined;
    const phaseFilter: number | undefined = opts.phase;
    if (phaseFilter !== undefined) once = true;
    if (!isJson()) {
      if (dryRun) console.log('[onyx] Dry run — showing what would execute without running agents');
      if (once) console.log('[onyx] --once mode: will stop after first actionable phase');
      console.log('[onyx] Starting controller loop...');
    }
    const results = await runLoop(config, { projectFilter, phaseFilter, dryRun, once });
    const acted = results.reduce((n, r) => n + r.phasesActedOn.length, 0);
    if (isJson()) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`[onyx] Done. ${results.length} iteration(s), ${acted} phases acted on.`);
    }
  });

// ── heal ──────────────────────────────────────────────────────────────────
program
  .command('heal')
  .description('Fix stale locks, vault drift, graph links')
  .action(async () => {
    const config = loadConfig();
    if (!isJson()) console.log('[onyx] Running healer...');
    const healResult = runAllHeals(config);
    const graphResult = await maintainVaultGraph(config);
    const consolidateResult = await consolidateVaultNodes(config);
    if (isJson()) {
      console.log(JSON.stringify({
        locksCleared: healResult.actions.filter(a => a.type === 'stale_lock_cleared' && a.applied).length,
        driftFixed: healResult.applied, driftDetected: healResult.detected,
        graphRepairs: graphResult.repairs.length,
        wrongLinksRemoved: graphResult.wrongLinksRemoved,
        hubsSplit: graphResult.hubsSplit,
        phasesArchived: consolidateResult.phasesArchived,
        docsMerged: consolidateResult.docsMerged,
      }, null, 2));
    } else {
      console.log(`  Healer: ${healResult.applied} applied, ${healResult.detected} detected`);
      for (const a of healResult.actions) console.log(`    [${a.applied ? '✓' : '!'}] ${a.type}: ${a.description}`);
      console.log(`  Graph: ${graphResult.repairs.length} link repairs, ${graphResult.wrongLinksRemoved} wrong links removed, ${graphResult.hubsSplit} hubs split`);
      if (consolidateResult.actions.length > 0) {
        console.log(`  Consolidate: ${consolidateResult.phasesArchived} phases archived, ${consolidateResult.docsMerged} docs merged`);
      }
      console.log('[onyx] Vault is healthy.');
    }
  });

// ── status ────────────────────────────────────────────────────────────────
program
  .command('status [project]')
  .description('Show all projects and their phase states')
  .action(async (projectFilter) => {
    const config = loadConfig();
    const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
    const phases = projectFilter
      ? allPhases.filter(p => {
          const proj = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
          return proj.toLowerCase().includes(projectFilter.toLowerCase());
        })
      : allPhases;

    if (isJson()) {
      // Machine-readable snapshot
      const byProject = new Map<string, typeof phases>();
      for (const phase of phases) {
        const proj = String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path))));
        if (!byProject.has(proj)) byProject.set(proj, []);
        byProject.get(proj)!.push(phase);
      }

      const snapshot = {
        timestamp: new Date().toISOString(),
        projects: Array.from(byProject.entries()).map(([projectId, projectPhases]) => {
          const completedCount = projectPhases.filter(p => stateFromFrontmatter(p.frontmatter) === 'completed').length;
          const bundleDir = projectPhases[0] ? path.dirname(path.dirname(projectPhases[0].path)) : '';
          return {
            projectId,
            bundleDir,
            phases: projectPhases.map(p => {
              const { done, total } = countTasks(p.content);
              const phaseState = stateFromFrontmatter(p.frontmatter);
              const deps = p.frontmatter['depends_on'];
              const depsArr: number[] = Array.isArray(deps) ? (deps as unknown[]).map(Number) : [];
              return {
                path: p.path,
                phaseNumber: Number(p.frontmatter['phase_number'] ?? 0),
                phaseName: String(p.frontmatter['phase_name'] ?? ''),
                milestone: String(p.frontmatter['milestone'] ?? ''),
                phaseType: String(p.frontmatter['phase_type'] ?? 'slice'),
                risk: String(p.frontmatter['risk'] ?? 'medium'),
                status: `phase-${phaseState}`,
                tasksTotal: total,
                tasksDone: done,
                dependsOn: depsArr,
                blockedReason: phaseState === 'blocked' ? extractBlockedReason(p.content) : '',
                lockedBy: String(p.frontmatter['locked_by'] ?? ''),
                lockedAt: String(p.frontmatter['locked_at'] ?? ''),
              };
            }),
            phasesComplete: completedCount,
            phasesTotal: projectPhases.length,
          };
        }),
      };
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (phases.length === 0) {
      console.log('No project phases found. Run: onyx init "My Project"');
    } else {
      // Human-readable output with milestone grouping
      const byProject = new Map<string, typeof phases>();
      for (const phase of phases) {
        const proj = String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path))));
        if (!byProject.has(proj)) byProject.set(proj, []);
        byProject.get(proj)!.push(phase);
      }
      for (const [project, projectPhases] of byProject) {
        const totalPhases = projectPhases.length;
        const completedPhases = projectPhases.filter(p => stateFromFrontmatter(p.frontmatter) === 'completed').length;
        console.log(`\n${project}`);

        // Separate phases with and without milestones
        const milestoneGroups = new Map<string, typeof phases>();
        const ungrouped: typeof phases = [];
        for (const phase of projectPhases) {
          const ms = String(phase.frontmatter['milestone'] ?? '').trim();
          if (ms) {
            if (!milestoneGroups.has(ms)) milestoneGroups.set(ms, []);
            milestoneGroups.get(ms)!.push(phase);
          } else {
            ungrouped.push(phase);
          }
        }

        // Render milestone groups first
        for (const [ms, msPhases] of milestoneGroups) {
          console.log(`  [${ms}]`);
          for (const phase of msPhases) {
            renderPhaseLine(phase, '    ');
          }
        }

        // Then ungrouped phases
        for (const phase of ungrouped) {
          renderPhaseLine(phase, '  ');
        }

        console.log(`  — ${completedPhases}/${totalPhases} phases complete`);
      }
      console.log('');
    }
  });

// ── daily-plan ────────────────────────────────────────────────────────────
program
  .command('daily-plan [date]')
  .description('Write a time-blocked daily plan')
  .action(async (date) => {
    const config = loadConfig();
    await runPlan(config, date);
  });

// ── decompose ────────────────────────────────────────────────────────────
program
  .command('decompose <project>')
  .description('Overview → phase stubs (backlog)')
  .option('--extend', 'add new phases from updated Overview')
  .option('--force', 'delete existing phases and re-decompose from scratch')
  .action(async (project, opts) => {
    await runDecompose(project, { extend: !!opts.extend, force: !!opts.force });
  });

// ── atomise ──────────────────────────────────────────────────────────────
program
  .command('atomise <project> [n]')
  .description('Backlog phases → concrete tasks → ready')
  .action(async (project, n) => {
    await runAtomiseCommand(project, n);
  });

// ── plan (convenience: decompose + atomise) ──────────────────────────────
program
  .command('plan <project> [n]')
  .description('Shortcut: decompose then atomise (both steps)')
  .option('--extend', 'add new phases from updated Overview')
  .action(async (project, n, opts) => {
    await runPlanProject(project, n, { extend: !!opts.extend });
  });

// ── capture ───────────────────────────────────────────────────────────────
program
  .command('capture [text...]')
  .description('Quick capture to Obsidian Inbox')
  .action(async (textParts) => { await runCapture(textParts.join(' ')); });

// ── research ──────────────────────────────────────────────────────────────
program
  .command('research <topic>')
  .description('Run research step and write to vault')
  .action(async (topic) => { await runResearch(topic); });

// ── consolidate ────────────────────────────────────────────────────────────
program
  .command('consolidate [args...]')
  .description('Manually trigger vault consolidation (project phases/docs)')
  .action(async (args) => { await runConsolidate(args ?? []); });

// ── monthly-consolidate ───────────────────────────────────────────────────
program
  .command('monthly-consolidate [args...]')
  .description('Consolidate last month daily plans into a single monthly note (LLM summary + optional prune)')
  .allowUnknownOption(true)
  .action(async (args) => { await runMonthlyConsolidate(args ?? []); });

// ── import ────────────────────────────────────────────────────────────────
program
  .command('import <linearProjectId>')
  .description('Import a Linear project as a vault bundle')
  .action(async (linearId) => {
    const config = loadConfig();
    if (!config.linear) {
      console.error('Linear not configured. Add linear config to onyx.config.json');
      process.exit(1);
    }
    console.log(`[onyx] Importing Linear project ${linearId}...`);
    const bundle = await importLinearProject(linearId, config);
    console.log(`[onyx] Imported "${bundle.projectId}"`);
    console.log(`  ${bundle.phases.length} phases created in: ${bundle.bundleDir}`);
  });

// ── reset ─────────────────────────────────────────────────────────────────
program
  .command('reset [project]')
  .description('Reset a blocked phase to phase-ready')
  .action(async (project) => { await runReset(project); });

// ── set-state ─────────────────────────────────────────────────────────────
program
  .command('set-state <phasePath> <state>')
  .description('Programmatic state change (for scripts/dashboard)')
  .action(async (phasePath, newState) => {
    const normalized = normalizeTag(newState);
    const node = readPhaseNode(phasePath);
    if (!node.exists) {
      const msg = `Phase note not found: ${phasePath}`;
      if (isJson()) console.log(JSON.stringify({ error: msg }));
      else console.error(`[onyx] ${msg}`);
      process.exit(1);
    }
    const previous = stateFromFrontmatter(node.frontmatter);
    setPhaseTag(phasePath, toTag(normalized));
    if (isJson()) console.log(JSON.stringify({ path: phasePath, previous, new: normalized }));
    else console.log(`[onyx] ${phasePath}: ${previous} → ${normalized}`);
  });

// ── logs ──────────────────────────────────────────────────────────────────
program
  .command('logs [project]')
  .description('Show execution log')
  .option('--recent', 'show most recently modified log')
  .option('--audit [project]', 'show audit trail')
  .action(async (project, opts) => {
    if (opts.audit !== undefined) {
      const { readAuditEvents } = await import('../audit/trail.js');
      const config = loadConfig();
      const projectFilter = typeof opts.audit === 'string' ? opts.audit : project;
      const events = readAuditEvents(config.vaultRoot, projectFilter || undefined);
      const recent = events.slice(-100);
      for (const e of recent) {
        console.log(`[${e.ts}] ${e.event}${e.projectId ? ` (${e.projectId})` : ''}${e.detail ? ` — ${e.detail}` : ''}`);
      }
      return;
    }
    await runLogs(project);
  });

// ── refresh-context ───────────────────────────────────────────────────────
program
  .command('refresh-context [project]')
  .description('Re-scan repo and update Repo Context note')
  .action(async (project) => { await runRefreshContext(project); });

// ── linear-uplink ─────────────────────────────────────────────────────────
program
  .command('linear-uplink [project]')
  .description('Sync vault phases to Linear issues')
  .action(async (project) => { await runLinearUplink(project); });

// ── aliases ───────────────────────────────────────────────────────────────
program.command('atomize <project> [n]').description('Alias: US spelling of atomise')
  .action(async (p, n) => { await runAtomiseCommand(p, n); }).helpOption(false);

await program.parseAsync(process.argv);
