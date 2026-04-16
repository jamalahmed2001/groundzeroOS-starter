import type { ControllerConfig } from '../config/load.js';
import { runAllHeals } from '../healer/index.js';
import { maintainVaultGraph } from '../vault/graphMaintainer.js';
import { discoverAllPhases, dependenciesMet, detectDependencyCycles } from '../vault/discover.js';
import { routePhase } from './router.js';
import { runPhase } from '../executor/runPhase.js';
import { atomisePhase } from '../planner/atomiser.js';
import { consolidatePhase } from '../planner/consolidator.js';
import { consolidateVaultNodes } from '../vault/nodeConsolidator.js';
import { replanPhase } from '../planner/replan.js';
import { notify } from '../notify/notify.js';
import { readBundle } from '../vault/reader.js';
import { runPhaseReview } from '../skills/phaseReview.js';
import { randomBytes } from 'crypto';
import path from 'path';

// Shutdown flag — set by SIGINT/SIGTERM handlers
let _shutdownRequested = false;

export function requestShutdown(): void {
  _shutdownRequested = true;
}

export function isShutdownRequested(): boolean {
  return _shutdownRequested;
}

export interface IterationResult {
  iteration: number;
  phasesActedOn: string[];
  healed: { applied: number; detected: number };
  graphRepairs: number;
  nodesConsolidated: number;
  halted: boolean;
  haltReason?: string;
}

export interface RunOptions {
  projectFilter?: string;
  phaseFilter?: number;
  dryRun?: boolean;
  once?: boolean;
}

export function generateRunId(): string {
  return 'onyx-' + Date.now() + '-' + randomBytes(3).toString('hex');
}

// Main controller loop:
// 1. notify controller_started
// 2. runAllHeals → notify heal_complete
// 3. maintainVaultGraph (ensure fractal link pattern intact)
// 4. discoverAllPhases
// 5. If none: notify controller_idle, return
// 6. For each phase: routePhase → execute/atomise/consolidate/surface
// 7. After each action: notify
// 8. Repeat until no work or maxIterations hit
// 9. If maxIterations hit: notify controller_halted
export async function runLoop(config: ControllerConfig, opts: RunOptions = {}): Promise<IterationResult[]> {
  const runId = generateRunId();
  const results: IterationResult[] = [];

  // Reset shutdown flag for this run
  _shutdownRequested = false;

  // Register SIGINT/SIGTERM handlers for graceful shutdown
  const sigintHandler = () => {
    console.log('\n[onyx] Shutdown requested — finishing current task then exiting cleanly...');
    _shutdownRequested = true;
  };
  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigintHandler);

  try {
    await notify({ event: 'controller_started', runId }, config);

    // Heal first
    const healResult = runAllHeals(config);
    await notify({
      event: 'heal_complete',
      detail: `applied:${healResult.applied} detected:${healResult.detected}`,
      runId,
    }, config);

    // Maintain graph links (fractal pattern enforcement)
    const graphResult = await maintainVaultGraph(config);
    if (graphResult.repairs.length > 0) {
      await notify({
        event: 'heal_complete',
        detail: `graph: ${graphResult.repairs.length} link repairs, ${graphResult.wrongLinksRemoved} wrong links removed`,
        runId,
      }, config);
    }

    // Consolidate completed phase groups and duplicate docs
    const consolidateResult = await consolidateVaultNodes(config);
    if (consolidateResult.actions.length > 0) {
      await notify({
        event: 'heal_complete',
        detail: `consolidate: ${consolidateResult.phasesArchived} phases archived, ${consolidateResult.docsMerged} docs merged`,
        runId,
      }, config);
    }

    // Cycle detection — a cycle in depends_on is a permanent deadlock.
    // Check once at startup so operators get an immediate, clear error rather
    // than a confusing "no actionable phases" message that gives no hint why.
    {
      const allPhasesForCycleCheck = discoverAllPhases(config.vaultRoot, config.projectsGlob);
      const cycles = detectDependencyCycles(allPhasesForCycleCheck);
      if (cycles.length > 0) {
        for (const { cycle } of cycles) {
          const msg = `Dependency cycle detected: P${cycle.join(' → P')} → P${cycle[0]} — these phases will never execute`;
          console.error(`[onyx] ⚠  ${msg}`);
          await notify({ event: 'phase_blocked', detail: msg, runId }, config);
        }
        // Don't abort — cycles only affect the phases involved, others can still run
      }
    }

    let ranToLimit = false;
    for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
      // Check shutdown before each iteration
      if (_shutdownRequested) {
        await notify({ event: 'controller_halted', detail: 'Shutdown requested by user', runId }, config);
        break;
      }

      const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

      if (phases.length === 0) {
        await notify({ event: 'controller_idle', detail: 'No phase notes found', runId }, config);
        results.push({
          iteration,
          phasesActedOn: [],
          healed: { applied: healResult.applied, detected: healResult.detected },
          graphRepairs: graphResult.repairs.length,
          nodesConsolidated: consolidateResult.actions.length,
          halted: false,
          haltReason: 'No phases found',
        });
        break;
      }

      const phasesActedOn: string[] = [];
      let anyWork = false;
      let onceDone = false;

      for (const phase of phases) {
        // Apply optional filters
        if (opts.projectFilter) {
          const projectId = String(phase.frontmatter['project'] ?? '');
          if (!projectId.toLowerCase().startsWith(opts.projectFilter.toLowerCase())) continue;
        }
        if (opts.phaseFilter !== undefined) {
          const phaseNum = Number(phase.frontmatter['phase_number'] ?? -1);
          if (phaseNum !== opts.phaseFilter) continue;
        }

        // Check depends_on before routing — skip phase if deps not yet completed
        const projectId = String(phase.frontmatter['project'] ?? '');
        const bundleDir = path.dirname(path.dirname(phase.path));
        const projectPhases = phases.filter(p => {
          const pProj = String(p.frontmatter['project'] ?? '');
          const pBundle = path.dirname(path.dirname(p.path));
          return pProj === projectId || pBundle === bundleDir;
        });
        if (!dependenciesMet(phase, projectPhases)) continue;

        const operation = routePhase(phase);

        // Dry run: log what would happen and skip execution
        if (opts.dryRun) {
          if (operation.op !== 'wait' && operation.op !== 'skip') {
            const projectId = String(phase.frontmatter['project'] ?? '');
            const phaseLabel = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
            console.log(`[dry-run] would ${operation.op}: [${projectId}] ${phaseLabel}`);
          }
          continue;
        }

        switch (operation.op) {

          // ── atomise: phase is in backlog — generate a task plan ───────────
          case 'atomise': {
            const phaseLabel = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
            const projectId  = String(phase.frontmatter['project'] ?? '');
            const result = await atomisePhase(operation.phaseNode, runId, config);
            phasesActedOn.push(phase.path);
            anyWork = true;
            onceDone = true;
            await notify({
              event: result === 'ready' ? 'atomise_done' : 'phase_blocked',
              projectId,
              phaseLabel,
              runId,
            }, config);
            break;
          }

          // ── execute: phase is ready/active — run tasks with agent ─────────
          // On completion, extract knowledge and run review inline.
          // completed is terminal: the router returns skip on subsequent iterations.
          case 'execute': {
            const phaseLabel = String(phase.frontmatter['phase_name'] ?? '');
            const projectId  = String(phase.frontmatter['project'] ?? '');
            const bundleDir  = path.dirname(path.dirname(phase.path));
            const result = await runPhase(operation.phaseNode, runId, config);
            phasesActedOn.push(phase.path);
            anyWork = true;
            onceDone = true;

            if (result.status === 'completed') {
              await notify({ event: 'phase_completed', projectId, phaseLabel, detail: `${result.tasksCompleted} tasks done`, runId }, config);

              // Extract structured learnings (decisions, gotchas, patterns) into Knowledge.md
              if (config.llm?.apiKey) {
                const bundle = readBundle(bundleDir, projectId || path.basename(bundleDir));
                await consolidatePhase(operation.phaseNode, bundle, runId, config).catch(err =>
                  console.warn('[onyx] Knowledge extraction failed (non-fatal):', (err as Error).message)
                );
              } else {
                console.log('[onyx] Knowledge extraction skipped — set OPENROUTER_API_KEY to enable');
              }

              // Auto-review: diff the repo and log a verdict
              await runPhaseReview(operation.phaseNode, result.repoPath, runId, config).catch(err =>
                console.warn('[onyx] Phase review failed (non-fatal):', (err as Error).message)
              );

            } else if (result.status === 'blocked') {
              // Extract knowledge from the failed attempt before replanning
              if (config.llm?.apiKey) {
                const failBundle = readBundle(bundleDir, projectId || path.basename(bundleDir));
                await consolidatePhase(operation.phaseNode, failBundle, runId, config).catch(err =>
                  console.warn('[onyx] Knowledge extraction from blocked phase (non-fatal):', (err as Error).message)
                );
              }

              // Auto-replan: rewrite task list from failure evidence, set back to phase-ready
              const replanResult = await replanPhase(operation.phaseNode, runId, config);
              if (replanResult !== 'replanned') {
                await notify({
                  event: 'phase_blocked',
                  projectId,
                  phaseLabel,
                  detail: replanResult === 'max_reached'
                    ? 'Max replans reached — needs human review'
                    : (result.blockers[0] ?? 'Blocked'),
                  runId,
                }, config);
              }
            }
            break;
          }

          // ── surface_blocker: phase is blocked — notify operator ───────────
          case 'surface_blocker': {
            await notify({
              event: 'phase_blocked',
              projectId: String(phase.frontmatter['project'] ?? ''),
              phaseLabel: String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md')),
              detail: String(phase.frontmatter['blocker'] ?? 'Phase is blocked'),
              runId,
            }, config);
            break;
          }

          case 'wait':
          case 'skip':
            break;
        }

        // --once: stop after first actionable phase
        if (opts.once && onceDone) break;
      }

      results.push({
        iteration,
        phasesActedOn,
        healed: { applied: healResult.applied, detected: healResult.detected },
        graphRepairs: graphResult.repairs.length,
        nodesConsolidated: consolidateResult.actions.length,
        halted: false,
      });

      // --once mode: break after first iteration that did work
      if (opts.once && onceDone) {
        break;
      }

      if (!anyWork) {
        await notify({ event: 'controller_idle', detail: 'No actionable phases', runId }, config);
        break;
      }

      // Only mark as hitting the limit if we actually reached the last iteration without breaking
      if (iteration === config.maxIterations) ranToLimit = true;
    }

    if (ranToLimit && results.length >= config.maxIterations && results[results.length - 1]?.halted === false) {
      const last = results[results.length - 1];
      if (last) {
        last.halted = true;
        last.haltReason = `maxIterations (${config.maxIterations}) reached`;
      }
      await notify({ event: 'controller_halted', detail: `Hard limit of ${config.maxIterations} iterations reached`, runId }, config);
    }

    return results;
  } finally {
    // Always remove SIGINT/SIGTERM handlers when loop exits
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigintHandler);
  }
}
