import { discoverActivePhases } from '../vault/discover.js';
import { readPhaseNode, readRawFile } from '../vault/reader.js';
import { appendToLog, deriveLogNotePath } from '../vault/writer.js';
import { appendAuditEvent } from '../audit/trail.js';
import type { HealAction } from './index.js';
import matter from 'gray-matter';
import fs from 'fs';

// Single atomic write: set phase-ready + clear all lock fields in one pass
function clearLockAtomic(phasePath: string, frontmatter: Record<string, unknown>): void {
  const existingTags = Array.isArray(frontmatter['tags']) ? (frontmatter['tags'] as string[]) : [];
  const fm: Record<string, unknown> = {
    ...frontmatter,
    state:  'ready',
    status: 'ready',
    tags:   [...existingTags.filter(t => !t.startsWith('phase-')), 'phase-ready'],
  };
  delete fm['locked_by'];
  delete fm['locked_at'];
  delete fm['lock_pid'];
  delete fm['lock_hostname'];
  delete fm['lock_ttl_ms'];

  const raw = fs.readFileSync(phasePath, 'utf-8');
  const parsed = matter(raw);
  fs.writeFileSync(phasePath, matter.stringify(parsed.content, fm), 'utf-8');
}

function getLastLogActivity(phaseNotePath: string): number {
  const raw = readRawFile(phaseNotePath);
  if (!raw) return 0;
  const fm = matter(raw).data as Record<string, unknown>;
  const logPath = deriveLogNotePath(phaseNotePath, fm);
  try {
    return fs.statSync(logPath).mtimeMs;
  } catch {
    return 0;
  }
}

// Scan all phase-active notes across the vault.
// For each: check locked_at age. If stale: clear fields, set phase-ready, append log + audit event.
export function healStaleLocks(
  vaultRoot: string,
  projectsGlob: string,
  thresholdMs: number
): HealAction[] {
  const activePhases = discoverActivePhases(vaultRoot, projectsGlob);
  const now = Date.now();
  const actions: HealAction[] = [];

  for (const phase of activePhases) {
    // Re-read to get fresh frontmatter
    const node = readPhaseNode(phase.path);
    if (!node.exists) continue;

    const lockedAt = node.frontmatter['locked_at'];
    const lockedBy = node.frontmatter['locked_by'];
    const projectId = String(node.frontmatter['project_id'] ?? node.frontmatter['project'] ?? '');

    if (typeof lockedAt !== 'string' || lockedAt === '') {
      // Active with no locked_at — treat as stale immediately
      const description = `phase-active but no locked_at — clearing lock, setting phase-ready`;
      const action: HealAction = {
        type: 'stale_lock_cleared',
        phaseNotePath: phase.path,
        description,
        applied: false,
      };
      try {
        clearLockAtomic(phase.path, node.frontmatter as Record<string, unknown>);
        appendToLog(phase.path, {
          runId: 'healer',
          event: 'stale_lock_cleared',
          detail: 'No locked_at found, reset to phase-ready',
        });
        appendAuditEvent(vaultRoot, {
          ts:            new Date().toISOString(),
          event:         'stale_lock_cleared',
          phaseNotePath: phase.path,
          projectId,
          runId:         'healer',
          detail:        `No locked_at on phase-active note. locked_by was: ${lockedBy ?? 'unknown'}`,
        });
        action.applied = true;
      } catch {
        // Ignore write errors during heal
      }
      actions.push(action);
      continue;
    }

    const lockedAtMs = new Date(lockedAt).getTime();
    if (isNaN(lockedAtMs)) continue;

    const ageMs = now - lockedAtMs;
    if (ageMs < thresholdMs) continue;

    // Check log activity — if there's been a recent log entry, the lock is still active
    const lastLogMs = getLastLogActivity(phase.path);
    if (lastLogMs > 0 && (now - lastLogMs) < thresholdMs) continue;

    const ageMinutes = Math.round(ageMs / 60000);
    const thresholdMinutes = Math.round(thresholdMs / 60000);
    const description = `Stale lock by ${lockedBy ?? 'unknown'} (${ageMinutes}min old, threshold ${thresholdMinutes}min) — clearing, setting phase-ready`;

    const action: HealAction = {
      type: 'stale_lock_cleared',
      phaseNotePath: phase.path,
      description,
      applied: false,
    };

    try {
      clearLockAtomic(phase.path, node.frontmatter as Record<string, unknown>);
      appendToLog(phase.path, {
        runId: 'healer',
        event: 'stale_lock_cleared',
        detail: `Lock by ${lockedBy ?? 'unknown'} was ${ageMinutes}min old (threshold: ${thresholdMinutes}min)`,
      });
      appendAuditEvent(vaultRoot, {
        ts:            new Date().toISOString(),
        event:         'stale_lock_cleared',
        phaseNotePath: phase.path,
        projectId,
        runId:         'healer',
        detail:        `locked_by=${lockedBy ?? 'unknown'} | age=${ageMinutes}min | threshold=${thresholdMinutes}min | lock_pid=${node.frontmatter['lock_pid'] ?? 'unknown'} | lock_hostname=${node.frontmatter['lock_hostname'] ?? 'unknown'}`,
      });
      action.applied = true;
    } catch {
      // Ignore write errors during heal
    }

    actions.push(action);
  }

  return actions;
}
