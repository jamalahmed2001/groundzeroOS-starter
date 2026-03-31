import { z } from 'zod';
import type { PhaseState } from './types.js';
import { canTransition } from '../fsm/states.js';

export const PhaseTagSchema = z.enum([
  'phase-backlog', 'phase-planning', 'phase-ready',
  'phase-active', 'phase-blocked', 'phase-completed',
]);

// ─── Soft schema ─────────────────────────────────────────────────────────────
// Used by discover.ts — structural correctness only.
// project_id optional here so notes still surface in `gzos status`.
export const PhaseFrontmatterSchema = z.object({
  phase_number: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
  phase_name:   z.string().min(1),
  tags:         z.union([z.array(z.string()), z.string()]),
  // identity — validated strictly at lock time; warned here
  project_id:   z.string().optional(),
  project:      z.string().optional(),
  // classification
  milestone:    z.string().optional(),
  risk:         z.enum(['low', 'medium', 'high']).optional(),
  depends_on:   z.union([z.array(z.unknown()), z.number(), z.string()]).optional(),
  // linear integration
  linear_issue_id:   z.string().optional(),
  linear_identifier: z.string().optional(),
  // lock fields — shape-checked when present
  locked_by:    z.string().optional(),
  locked_at:    z.string().optional(),
  lock_pid:     z.number().optional(),
  lock_hostname: z.string().optional(),
  lock_ttl_ms:  z.number().optional(),
  // canonical state + legacy
  state:        z.string().optional(),
  status:       z.string().optional(),
}).passthrough();

// ─── Strict schema ────────────────────────────────────────────────────────────
// Used at lock acquisition — refuses to run if these are missing.
const PhaseFrontmatterStrictSchema = PhaseFrontmatterSchema.extend({
  project_id: z.string().min(1, 'project_id is required — run `gzos heal` to auto-repair'),
});

export const OverviewFrontmatterSchema = z.object({
  project_id: z.string().min(1, 'project_id is required in Overview — add it to the frontmatter'),
  project:    z.string().optional(),
  repo_path:  z.string().optional(),
}).passthrough();

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ─── Soft validator (used by discovery) ──────────────────────────────────────
/** Validate phase note frontmatter. Returns errors (hard) and warnings (soft). */
export function validatePhaseFrontmatter(fm: Record<string, unknown>): ValidationResult {
  const result = PhaseFrontmatterSchema.safeParse(fm);
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.') || 'frontmatter'}: ${issue.message}`);
    }
  }

  // project_id: warn (not fail) at discovery — healer will backfill
  if (!fm['project_id'] && !fm['project']) {
    warnings.push('project_id missing — run `gzos heal` to auto-repair (phase will not execute until fixed)');
  } else if (!fm['project_id'] && fm['project']) {
    warnings.push('project_id not set; using legacy `project` field — run `gzos heal` to migrate');
  }

  // Exactly one phase-* tag sanity check
  const tags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : typeof fm['tags'] === 'string' ? [fm['tags'] as string] : [];
  const phaseTags = tags.filter(t => t.startsWith('phase-'));
  if (phaseTags.length === 0 && !fm['state'] && !fm['status']) {
    warnings.push('No phase-* tag found (e.g. phase-backlog). Add one or set `state:` in frontmatter.');
  } else if (phaseTags.length > 1) {
    warnings.push(`Multiple phase-* tags found: [${phaseTags.join(', ')}]. Remove all but one.`);
  }

  if (!fm['milestone']) warnings.push('milestone not set');
  if (!fm['risk'])      warnings.push('risk not set (low/medium/high)');

  return { valid: result.success, errors, warnings };
}

// ─── Strict validator (used before execution) ─────────────────────────────────
/**
 * Strict validation — called before acquiring a lock on a phase.
 * Returns valid: false if project_id is missing or structural fields are wrong.
 * Error messages tell the user exactly what to fix in the note.
 */
export function validatePhaseForExecution(fm: Record<string, unknown>): ValidationResult {
  const result = PhaseFrontmatterStrictSchema.safeParse(fm);
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || 'frontmatter';
      errors.push(`${field}: ${issue.message}`);
    }
  }

  // Lock fields shape check (only validate if locked_by is present)
  const lb = fm['locked_by'];
  const la = fm['locked_at'];
  if (typeof lb === 'string' && lb !== '' && typeof la !== 'string') {
    errors.push('locked_at must be a string when locked_by is set');
  }
  if (typeof lb === 'string' && lb !== '' && typeof la === 'string' && la !== '') {
    const d = new Date(la);
    if (isNaN(d.getTime())) errors.push(`locked_at is not a valid ISO date: "${la}"`);
  }

  return { valid: result.success && errors.length === 0, errors, warnings };
}

// ─── Overview validator ───────────────────────────────────────────────────────
export function validateOverviewFrontmatter(fm: Record<string, unknown>): ValidationResult {
  const result = OverviewFrontmatterSchema.safeParse(fm);
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.') || 'frontmatter'}: ${issue.message}`);
    }
  }
  if (!fm['project_id']) {
    errors.push('project_id missing from Overview — add `project_id: "YourProjectName"` to the frontmatter');
  }
  return { valid: result.success && errors.length === 0, errors, warnings };
}

// ─── FSM transition validator ─────────────────────────────────────────────────
/**
 * Validate that a state transition is allowed.
 * Use canTransition() from fsm/states.ts as the source of truth.
 */
export function validateFSMTransition(from: PhaseState, to: PhaseState): ValidationResult {
  if (canTransition(from, to)) {
    return { valid: true, errors: [], warnings: [] };
  }
  return {
    valid:    false,
    errors:   [`Invalid transition: ${from} → ${to}. Allowed from ${from}: ${getTransitionTargets(from).join(', ')}`],
    warnings: [],
  };
}

function getTransitionTargets(from: PhaseState): PhaseState[] {
  const map: Record<PhaseState, PhaseState[]> = {
    backlog:   ['planning', 'ready'],
    planning:  ['ready', 'backlog'],
    ready:     ['active', 'planning'],
    active:    ['completed', 'blocked'],
    blocked:   ['active', 'planning'],
    completed: ['planning'],
  };
  return map[from] ?? [];
}
