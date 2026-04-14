import glob from 'fast-glob';
import path from 'path';
import type { PhaseNode } from '../shared/types.js';
import type { SchemaViolation } from '../shared/types.js';
import { readPhaseNode } from './reader.js';
import { stateFromFrontmatter } from '../shared/vault-parse.js';
import { validatePhaseFrontmatter } from '../shared/schemas.js';

const _lastViolations: SchemaViolation[] = [];
export function getLastDiscoveryViolations(): SchemaViolation[] { return [..._lastViolations]; }

// Parse a dependency token to a phase number.
// Handles numeric 1, string "1", and "P1"/"P2" shorthand.
function parsDepNum(d: unknown): number {
  const s = String(d).trim();
  const m = s.match(/^[Pp](\d+)$/);
  if (m) return parseInt(m[1]!, 10);
  const n = Number(s);
  return isNaN(n) ? -1 : n;
}

// Check if all declared dependencies are met (phase-completed).
// Exported so the controller loop can apply it to all phase states, not just ready.
export function dependenciesMet(phase: PhaseNode, allProjectPhases: PhaseNode[]): boolean {
  const deps = phase.frontmatter['depends_on'];
  if (!deps) return true;
  const depNums: number[] = Array.isArray(deps)
    ? (deps as unknown[]).map(parsDepNum).filter(n => n > 0)
    : [parsDepNum(deps)].filter(n => n > 0);
  if (depNums.length === 0) return true;
  for (const depNum of depNums) {
    const dep = allProjectPhases.find(p => Number(p.frontmatter['phase_number']) === depNum);
    if (!dep) return false; // dependency doesn't exist — block
    if (stateFromFrontmatter(dep.frontmatter) !== 'completed') return false;
  }
  return true;
}

// Parse phase_number from frontmatter, default to Infinity for sorting
function phaseNumber(node: PhaseNode): number {
  const n = node.frontmatter['phase_number'] ?? node.frontmatter['phase_num'];
  if (typeof n === 'number') return n;
  if (typeof n === 'string') {
    const parsed = parseInt(n, 10);
    if (!isNaN(parsed)) return parsed;
  }
  // Try to extract from filename: P1, P2, Phase 1, etc.
  const basename = path.basename(node.path);
  const match = basename.match(/[Pp](\d+)/);
  if (match?.[1]) return parseInt(match[1], 10);
  return Infinity;
}

function hasTag(node: PhaseNode, tag: string): boolean {
  const tags = node.frontmatter['tags'];
  if (Array.isArray(tags)) return (tags as string[]).includes(tag);
  if (typeof tags === 'string') return tags === tag;
  return false;
}

function hasStatus(node: PhaseNode, status: string): boolean {
  return node.frontmatter['status'] === status;
}

function isPhaseNote(node: PhaseNode): boolean {
  return node.exists && (
    hasTag(node, 'onyx-phase') ||
    typeof node.frontmatter['phase_number'] !== 'undefined' ||
    typeof node.frontmatter['phase_num'] !== 'undefined' ||
    // Heuristic: it lives in a Phases/ directory
    node.path.includes('/Phases/')
  );
}

function discoverPhaseNodes(vaultRoot: string, projectsGlob: string): PhaseNode[] {
  _lastViolations.length = 0;
  const pattern = `${projectsGlob}/Phases/*.md`;
  const files = glob.sync(pattern, {
    cwd: vaultRoot,
    absolute: false,
    followSymbolicLinks: false,
  });

  // validate each node — skip hard-invalid notes
  const nodes: PhaseNode[] = [];
  for (const f of files) {
    const node = readPhaseNode(path.join(vaultRoot, f));
    if (!node.exists) continue;
    const vr = validatePhaseFrontmatter(node.frontmatter);
    if (!vr.valid) {
      _lastViolations.push({ path: node.path, noteType: 'phase', errors: vr.errors, warnings: vr.warnings });
      console.warn(`[onyx] schema warning — skipping ${path.basename(node.path)}: ${vr.errors.join(', ')}`);
      continue;
    }
    nodes.push(node);
  }
  return nodes;
}

// Scan vault for phase notes tagged phase-ready.
// Returns sorted by phase_number ascending.
// Filters out phases whose depends_on dependencies are not yet completed.
export function discoverReadyPhases(vaultRoot: string, projectsGlob: string): PhaseNode[] {
  const allPhases = discoverPhaseNodes(vaultRoot, projectsGlob).filter(n => n.exists);
  const readyPhases = allPhases.filter(n => hasTag(n, 'phase-ready') || hasStatus(n, 'ready'));
  return readyPhases
    .filter(phase => {
      // Collect all phases for the same project for dependency resolution
      const projectId = String(phase.frontmatter['project_id'] ?? phase.frontmatter['project'] ?? '');
      const bundleDir = path.dirname(path.dirname(phase.path));
      const projectPhases = projectId
        ? allPhases.filter(p => String(p.frontmatter['project_id'] ?? p.frontmatter['project'] ?? '') === projectId)
        : allPhases.filter(p => path.dirname(path.dirname(p.path)) === bundleDir);
      return dependenciesMet(phase, projectPhases);
    })
    .sort((a, b) => {
      // priority: 0–10 (default 5). Higher = run first. Operator's explicit control knob.
      const pa = Number(a.frontmatter['priority'] ?? 5);
      const pb = Number(b.frontmatter['priority'] ?? 5);
      if (pa !== pb) return pb - pa;
      // Tiebreak: risk (high first), then phase_number (ascending)
      const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const ra = riskOrder[String(a.frontmatter['risk'] ?? 'medium')] ?? 1;
      const rb = riskOrder[String(b.frontmatter['risk'] ?? 'medium')] ?? 1;
      if (ra !== rb) return ra - rb;
      return phaseNumber(a) - phaseNumber(b);
    });
}

// Scan vault for phase notes tagged phase-active.
// Returns sorted by phase_number ascending.
export function discoverActivePhases(vaultRoot: string, projectsGlob: string): PhaseNode[] {
  return discoverPhaseNodes(vaultRoot, projectsGlob)
    .filter(n => n.exists && (hasTag(n, 'phase-active') || hasStatus(n, 'active')))
    .sort((a, b) => phaseNumber(a) - phaseNumber(b));
}

// Scan vault for all ONYX phase notes.
// Returns sorted by phase_number ascending.
export function discoverAllPhases(vaultRoot: string, projectsGlob: string): PhaseNode[] {
  return discoverPhaseNodes(vaultRoot, projectsGlob)
    .filter(n => n.exists)
    .sort((a, b) => phaseNumber(a) - phaseNumber(b));
}

// Detect dependency cycles within a set of phases (e.g. P1 → P2 → P1).
// A cycle produces a permanent deadlock: neither phase will ever execute because
// each waits for the other. Returns one entry per cycle found, with the phase
// numbers involved.  Call this at controller startup and warn loudly if non-empty.
export function detectDependencyCycles(
  phases: PhaseNode[],
): Array<{ cycle: number[] }> {
  const byNum = new Map<number, PhaseNode>();
  for (const p of phases) {
    const n = phaseNumber(p);
    if (n !== Infinity) byNum.set(n, p);
  }

  const cycles: Array<{ cycle: number[] }> = [];
  const visiting = new Set<number>();
  const visited  = new Set<number>();

  function dfs(num: number, ancestry: number[]): void {
    if (visiting.has(num)) {
      // We've looped back — slice off the cycle portion from the ancestry
      const cycleStart = ancestry.indexOf(num);
      cycles.push({ cycle: ancestry.slice(cycleStart) });
      return;
    }
    if (visited.has(num)) return;

    visiting.add(num);
    const node = byNum.get(num);
    if (node) {
      const deps = node.frontmatter['depends_on'];
      const depNums: number[] = (
        Array.isArray(deps)
          ? (deps as unknown[]).map(parsDepNum)
          : [parsDepNum(deps)]
      ).filter(n => n > 0);

      for (const dep of depNums) {
        dfs(dep, [...ancestry, num]);
      }
    }
    visiting.delete(num);
    visited.add(num);
  }

  for (const [num] of byNum) {
    if (!visited.has(num)) dfs(num, []);
  }

  return cycles;
}
