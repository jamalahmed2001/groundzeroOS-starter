// onyx next [project] [--yes]
// Find the highest-priority ready phase and run it (with confirmation).
// If nothing is ready, suggest the next action.

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { stateFromFrontmatter, countTasks } from '../shared/vault-parse.js';
import { runLoop } from '../controller/loop.js';
import { createInterface } from 'readline';
import path from 'path';

export async function runNext(projectArg?: string, opts: { yes?: boolean } = {}): Promise<void> {
  const config = loadConfig();
  const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  if (allPhases.length === 0) {
    console.log('No projects found. Run: onyx init "My Project"');
    return;
  }

  // Filter by project if specified
  const phases = projectArg
    ? allPhases.filter(p => {
        const pid = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
        return pid.toLowerCase().includes(projectArg.toLowerCase());
      })
    : allPhases;

  if (phases.length === 0) {
    console.log(`No project matching "${projectArg}". Available: onyx status`);
    return;
  }

  // Sort ready phases: priority desc → risk → phase number
  const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

  const readyPhases = phases
    .filter(p => stateFromFrontmatter(p.frontmatter) === 'ready')
    .sort((a, b) => {
      const pa = Number(a.frontmatter['priority'] ?? 5);
      const pb = Number(b.frontmatter['priority'] ?? 5);
      if (pa !== pb) return pb - pa;
      const ra = riskOrder[String(a.frontmatter['risk'] ?? 'medium')] ?? 1;
      const rb = riskOrder[String(b.frontmatter['risk'] ?? 'medium')] ?? 1;
      if (ra !== rb) return ra - rb;
      return Number(a.frontmatter['phase_number'] ?? 999) - Number(b.frontmatter['phase_number'] ?? 999);
    });

  // No ready phases — suggest next step
  if (readyPhases.length === 0) {
    const activePhases = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'active');
    const blockedPhases = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'blocked');
    const backlogPhases = phases.filter(p => stateFromFrontmatter(p.frontmatter) === 'backlog');

    if (activePhases.length > 0) {
      const p = activePhases[0]!;
      const pid = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
      const num = p.frontmatter['phase_number'];
      const { done, total } = countTasks(p.content);
      console.log(`\n▶ Already running: ${pid} · P${num} — ${p.frontmatter['phase_name']}`);
      if (total > 0) console.log(`  Progress: ${done}/${total} tasks`);
      console.log(`  → Monitor: onyx logs "${pid}" --follow`);
      return;
    }

    if (blockedPhases.length > 0) {
      console.log(`\n⚠ Blocked phases need your attention:`);
      for (const p of blockedPhases.slice(0, 3)) {
        const pid = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
        const num = p.frontmatter['phase_number'];
        const reason = extractBlockedReason(p.content);
        console.log(`  ${pid} · P${num} — ${p.frontmatter['phase_name']}`);
        if (reason) console.log(`    ↳ ${reason}`);
        console.log(`    → Fix it, then: onyx reset "${pid}"`);
      }
      return;
    }

    if (backlogPhases.length > 0) {
      // Find the one with all deps satisfied
      const completedNums = new Set(
        phases
          .filter(p => stateFromFrontmatter(p.frontmatter) === 'completed')
          .map(p => Number(p.frontmatter['phase_number']))
      );
      const activatable = backlogPhases.filter(p => {
        const deps = p.frontmatter['depends_on'];
        const depsArr: number[] = Array.isArray(deps) ? (deps as unknown[]).map(Number) : [];
        return depsArr.every(d => completedNums.has(d));
      }).sort((a, b) => Number(a.frontmatter['phase_number'] ?? 999) - Number(b.frontmatter['phase_number'] ?? 999));

      if (activatable.length > 0) {
        const p = activatable[0]!;
        const pid = String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '');
        const num = p.frontmatter['phase_number'];
        const tasksDone = countTasks(p.content).total === 0;
        console.log(`\nNo ready phases. Next in backlog:`);
        console.log(`  ${pid}  ·  P${num} — ${p.frontmatter['phase_name']}`);
        if (tasksDone) {
          console.log(`  → Generate tasks first: onyx atomise "${pid}" ${num}`);
        } else {
          console.log(`  → Activate: onyx ready "${pid}" ${num}`);
        }
      } else {
        console.log('\nNo phases can run yet — unmet dependencies. Run: onyx status');
      }
      return;
    }

    const allDone = phases.every(p => stateFromFrontmatter(p.frontmatter) === 'completed');
    if (allDone) {
      const pid = projectArg ?? String(phases[0]!.frontmatter['project_id'] ?? '');
      console.log(`\nAll phases complete for ${pid}. Start new work:`);
      console.log(`  → Add a phase: onyx new phase "${pid}" "Phase name"`);
      console.log(`  → New project: onyx init "New Project"`);
    }
    return;
  }

  // Show the top candidate
  const phase = readyPhases[0]!;
  const pid = String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? '');
  const num = Number(phase.frontmatter['phase_number'] ?? 0);
  const name = String(phase.frontmatter['phase_name'] ?? '');
  const priority = Number(phase.frontmatter['priority'] ?? 5);
  const risk = String(phase.frontmatter['risk'] ?? 'medium');
  const directive = String(phase.frontmatter['directive'] ?? '');
  const { done, total } = countTasks(phase.content);

  console.log(`\n● ${pid}  ·  P${num} — ${name}`);
  console.log(`  Priority: ${priority}  |  Risk: ${risk}  |  Directive: ${directive || 'none'}`);
  if (total > 0) console.log(`  Tasks: ${done}/${total} completed`);
  if (readyPhases.length > 1) {
    const others = readyPhases.slice(1, 4)
      .map(p => `${p.frontmatter['project_id'] ?? ''} P${p.frontmatter['phase_number']}`)
      .join(', ');
    console.log(`  Queue: ${others}${readyPhases.length > 4 ? ` +${readyPhases.length - 4} more` : ''}`);
  }
  console.log('');

  // --yes skips confirmation
  if (opts.yes) {
    console.log(`[onyx] Running P${num} — ${name}...`);
    await runLoop(config, { projectFilter: pid, phaseFilter: num, once: true });
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => rl.question('Run it? [Y/n] ', resolve));
  rl.close();

  if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
    console.log(`Skipped. Run later: onyx run --project "${pid}" --phase ${num}`);
    return;
  }

  console.log(`\n[onyx] Running P${num} — ${name}...`);
  await runLoop(config, { projectFilter: pid, phaseFilter: num, once: true });
}

function extractBlockedReason(content: string): string {
  const m = content.match(/## Human Requirements([\s\S]*?)(?=\n##|\s*$)/);
  if (m) {
    const t = m[1]!.trim();
    if (t && t !== '(none)' && t !== 'None.' && !t.startsWith('-')) return t.split('\n')[0]!.slice(0, 100);
    if (t.startsWith('-')) return t.replace(/^-\s*/, '').split('\n')[0]!.slice(0, 100);
  }
  return '';
}
