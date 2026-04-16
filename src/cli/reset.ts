// onyx reset [phase-name]
// Sets a blocked/completed phase back to phase-ready,
// clears lock fields, and resets replan_count.

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { setPhaseTag, setLockFields, resetReplanCount } from '../vault/writer.js';
import path from 'path';

export async function runReset(phaseArg?: string): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[onyx] Failed to load config:', (err as Error).message);
    console.error('       Run: onyx doctor');
    process.exit(1);
  }

  const phases = discoverAllPhases(config.vaultRoot, config.projectsGlob);

  const RESETTABLE_TAGS = new Set(['phase-blocked', 'phase-active', 'phase-planning']);
  const candidates = phaseArg
    ? phases.filter(p => {
        const name = String(p.frontmatter['phase_name'] ?? '');
        const num = String(p.frontmatter['phase_number'] ?? '');
        const tags = Array.isArray(p.frontmatter['tags']) ? p.frontmatter['tags'] as string[] : [];
        const matchesFilter = name.toLowerCase().includes(phaseArg.toLowerCase()) || num === phaseArg;
        const isResettable = tags.some(t => RESETTABLE_TAGS.has(t));
        return matchesFilter && isResettable;
      })
    : phases.filter(p => {
        const tags = Array.isArray(p.frontmatter['tags']) ? p.frontmatter['tags'] as string[] : [];
        return tags.some(t => t === 'phase-blocked');
      });

  if (candidates.length === 0) {
    console.log(phaseArg ? `No phase found matching "${phaseArg}"` : 'No blocked phases found.');
    return;
  }

  for (const phase of candidates) {
    const projectId = String(phase.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phase.path))));
    const phaseLabel = String(phase.frontmatter['phase_name'] ?? path.basename(phase.path, '.md'));
    setLockFields(phase.path, '', '');
    setPhaseTag(phase.path, 'phase-ready');
    resetReplanCount(phase.path);
    console.log(`  reset: [${projectId}] ${phaseLabel} → phase-ready`);
  }
}
