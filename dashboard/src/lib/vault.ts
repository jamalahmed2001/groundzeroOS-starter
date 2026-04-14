import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import glob from 'fast-glob';
import type { GZProject, GZPhase, PhaseStatus, RunEntry, VaultFileNode, DailyPlan, InboxItem, GraphNode, GraphEdge } from './types';
import { stateFromFrontmatter, countTasks as sharedCountTasks, stateToTag } from '@onyx/shared/vault-parse';
import { readConfig } from './config';

// ---------------------------------------------------------------------------
// Root resolution — env var for overrides, config file for default
// ---------------------------------------------------------------------------
export function getVaultRoot(): string {
  if (process.env.ONYX_VAULT_ROOT) return process.env.ONYX_VAULT_ROOT;
  const cfgPath = path.resolve(process.cwd(), '..', 'onyx.config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.vault_root) return cfg.vault_root;
    } catch { /* ignore */ }
  }
  throw new Error(
    '[onyx dashboard] vault_root not found. Set ONYX_VAULT_ROOT env var or vault_root in onyx.config.json'
  );
}

// ---------------------------------------------------------------------------
// FSM helpers — delegate to shared implementation
// ---------------------------------------------------------------------------

/** Derive phase status from frontmatter (supports state field, tags, and status fallback). */
export function getPhaseStatus(tagsOrFrontmatter: unknown): PhaseStatus {
  // If called with full frontmatter object, use directly
  if (tagsOrFrontmatter && typeof tagsOrFrontmatter === 'object' && !Array.isArray(tagsOrFrontmatter)) {
    return stateFromFrontmatter(tagsOrFrontmatter as Record<string, unknown>);
  }
  // Legacy: called with just the tags value — wrap in a frontmatter-like object
  return stateFromFrontmatter({ tags: tagsOrFrontmatter });
}

export function statusToTag(s: PhaseStatus): string {
  return stateToTag(s);
}

export { sharedCountTasks as countTasks };

// ---------------------------------------------------------------------------
// Phase status update — writes back to vault file
// ---------------------------------------------------------------------------
export function updatePhaseStatus(vaultRoot: string, relPath: string, newStatus: PhaseStatus): boolean {
  const abs = path.resolve(vaultRoot, relPath);
  if (!abs.startsWith(path.resolve(vaultRoot))) return false;
  if (!fs.existsSync(abs)) return false;
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    const { data, content } = matter(raw);
    // Update tags
    const PHASE_TAGS = ['phase-active','phase-blocked','phase-completed','phase-complete','phase-ready','phase-planning','phase-backlog'];
    let tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : typeof data.tags === 'string' ? [data.tags] : [];
    tags = tags.filter(t => !PHASE_TAGS.includes(t));
    tags.push(statusToTag(newStatus));
    data.tags = tags;
    data.state = newStatus;    // canonical state field
    data.status = newStatus;   // backward compat
    data.updated = new Date().toISOString().split('T')[0];
    const updated = matter.stringify(content, data);
    fs.writeFileSync(abs, updated, 'utf8');
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Project scanner
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', 'node_modules', '.onyx-backups']);

function walkForProjects(dir: string, vaultRoot: string): GZProject[] {
  const results: GZProject[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  const overviewFile = entries.find(e =>
    e.isFile() && / - Overview\.md$/i.test(e.name) && !e.name.startsWith('._')
    && !/Skill Overview/i.test(e.name) && !/Hub\.md$/i.test(e.name)
  );
  if (overviewFile) {
    const overviewAbs = path.join(dir, overviewFile.name);
    try {
      const raw = fs.readFileSync(overviewAbs, 'utf8');
      const { data } = matter(raw);
      if (!data.type || data.type === 'overview' || data.type === 'project') {
        const projectId = String(data.project_id || data.project || overviewFile.name.replace(/\s*-\s*Overview\.md$/i, '')).trim();
        const phases = loadPhases(dir, vaultRoot);
        // Detect Linear linkage from Overview frontmatter, content, or phase frontmatter
        let linearId = data.linear_project_id ? String(data.linear_project_id) : undefined;
        if (!linearId) {
          // Check Overview content for Linear identifiers (e.g. ENG-1234, `linear_project_id`)
          if (/\b[A-Z]{2,6}-\d{3,}\b/.test(raw) || /[Ii]mported from Linear/.test(raw)) {
            linearId = 'linked';
          }
        }
        if (!linearId) {
          // Check if any phase has a linear_issue_id or linear_identifier
          const hasLinearPhase = phases.some(ph => {
            const phaseAbs = path.resolve(vaultRoot, ph.path);
            try {
              const phRaw = fs.readFileSync(phaseAbs, 'utf8');
              const phData = matter(phRaw).data;
              return !!(phData.linear_issue_id || phData.linear_identifier);
            } catch { return false; }
          });
          if (hasLinearPhase) linearId = 'linked';
        }

        results.push({
          id: projectId,
          overviewPath: path.relative(vaultRoot, overviewAbs),
          repoPath: data.repo_path ? String(data.repo_path) : undefined,
          linearProjectId: linearId,
          status: String(data.status || 'active'),
          phases,
          phaseCount: phases.length,
          agentDriver: data.agent_driver ? String(data.agent_driver) as 'claude-code' | 'cursor' : undefined,
        });
        return results;
      }
    } catch { /* skip */ }
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    results.push(...walkForProjects(path.join(dir, e.name), vaultRoot));
  }
  return results;
}

function loadPhases(projectDir: string, vaultRoot: string): GZPhase[] {
  const phasesDir = path.join(projectDir, 'Phases');
  if (!fs.existsSync(phasesDir)) return [];
  const phases: GZPhase[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(phasesDir, { withFileTypes: true }); }
  catch { return []; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name.startsWith('._')) continue;
    const absPath = path.join(phasesDir, e.name);
    try {
      const raw = fs.readFileSync(absPath, 'utf8');
      const { data, content } = matter(raw);
      const status = stateFromFrontmatter(data as Record<string, unknown>);
      const phaseNum = Number(data.phase_number ?? data.phase_num ?? 0);
      const phaseName = String(data.phase_name || data.title || e.name.replace(/\.md$/i, '').replace(/^P?\d+\s*[-–]\s*/, '')).trim();
      const { done, total, nextTask } = sharedCountTasks(content);
      phases.push({
        path: path.relative(vaultRoot, absPath),
        phaseNum, phaseName, status,
        lockedBy: data.locked_by ? String(data.locked_by) : undefined,
        lockedAt: data.locked_at ? String(data.locked_at) : undefined,
        tasksDone: done, tasksTotal: total, nextTask,
        milestone: data.milestone ? String(data.milestone) : undefined,
        risk: data.risk ? String(data.risk) : undefined,
        dependsOn: Array.isArray(data.depends_on) ? data.depends_on.map(Number) : undefined,
        blockedReason: data.blocked_reason ? String(data.blocked_reason) : undefined,
        phaseType: data.phase_type ? String(data.phase_type) : undefined,
      });
    } catch { /* skip */ }
  }
  phases.sort((a, b) => a.phaseNum - b.phaseNum);
  return phases;
}

export function getAllProjects(vaultRoot: string): GZProject[] {
  if (!fs.existsSync(vaultRoot)) return [];

  // Use projects_glob from config to scope which directories to scan
  const cfg = readConfig();
  const projectsGlob: string = cfg.projects_glob ?? cfg.projectsGlob ?? '';

  let projects: GZProject[];
  if (projectsGlob) {
    // Resolve glob patterns to directories, then scan each one
    const patterns = projectsGlob.replace(/\{|\}/g, '').split(',').map((p: string) => p.trim()).filter(Boolean);
    const dirs = new Set<string>();
    for (const pattern of patterns) {
      // Strip trailing /** to get the base directory
      const base = pattern.replace(/\/\*\*$/, '');
      const absBase = path.join(vaultRoot, base);
      if (fs.existsSync(absBase)) dirs.add(absBase);
    }
    projects = [];
    for (const dir of dirs) {
      projects.push(...walkForProjects(dir, vaultRoot));
    }
  } else {
    projects = walkForProjects(vaultRoot, vaultRoot);
  }

  const seen = new Set<string>();
  return projects.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Daily plan + Inbox
// ---------------------------------------------------------------------------
export function getDailyPlan(vaultRoot: string): DailyPlan {
  const today = new Date().toISOString().split('T')[0];

  // Check multiple locations for today's plan (priority order)
  const candidates = [
    path.join(vaultRoot, '04 - Planning', `Daily - ${today}.md`),
    path.join(vaultRoot, '04 - Planning', `${today}.md`),
    path.join(vaultRoot, '00 - Dashboard', 'Daily', `${today}.md`),
    path.join(vaultRoot, '09 - Archive', 'Daily Archive (Legacy)', `Daily - ${today}.md`),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      return { date: today, raw, exists: true };
    }
  }

  // No plan for today — find the most recent plan across all locations
  const searchDirs = [
    path.join(vaultRoot, '04 - Planning'),
    path.join(vaultRoot, '00 - Dashboard', 'Daily'),
    path.join(vaultRoot, '09 - Archive', 'Daily Archive (Legacy)'),
  ];

  let latestDate = '';
  let latestPath = '';
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (m && m[1]! <= today && m[1]! > latestDate) {
        latestDate = m[1]!;
        latestPath = path.join(dir, f);
      }
    }
  }

  if (latestPath && latestDate) {
    const raw = fs.readFileSync(latestPath, 'utf8');
    return { date: latestDate, raw, exists: true };
  }

  return { date: today, raw: '', exists: false };
}

export function getInboxItems(vaultRoot: string): InboxItem[] {
  const inboxPath = path.join(vaultRoot, '00 - Dashboard', 'Inbox.md');
  if (!fs.existsSync(inboxPath)) return [];
  const raw = fs.readFileSync(inboxPath, 'utf8');
  const { content } = matter(raw);
  const items: InboxItem[] = [];
  for (const line of content.split('\n')) {
    const doneMatch = /^\s*-\s*\[x\]\s*(.+)/.exec(line);
    const openMatch = /^\s*-\s*\[ \]\s*(.+)/.exec(line);
    if (doneMatch) items.push({ text: doneMatch[1].trim(), done: true });
    else if (openMatch) {
      const text = openMatch[1].trim();
      const tsMatch = /^\[(\d{4}-\d{2}-\d{2}[^\]]*)\]\s*/.exec(text);
      items.push({ text: tsMatch ? text.slice(tsMatch[0].length) : text, done: false, ts: tsMatch?.[1] });
    }
  }
  return items.filter(i => !i.done);
}

// ---------------------------------------------------------------------------
// Recent runs
// ---------------------------------------------------------------------------
function parseLastLogEvent(content: string): { lastEvent?: string; lastDetail?: string } {
  const lines = content.split('\n');
  // Scan backwards for last log entry line: "- [timestamp] **event** (run: ...)"
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const evMatch = line.match(/\*\*([^*]+)\*\*/);
    if (evMatch) {
      const lastEvent = evMatch[1];
      // Look for a detail line immediately after
      let lastDetail: string | undefined;
      const next = lines[i + 1] ?? '';
      const detailMatch = next.match(/^\s+detail:\s*(.+)$/);
      if (detailMatch) lastDetail = detailMatch[1].slice(0, 80);
      return { lastEvent, lastDetail };
    }
  }
  return {};
}

function lookupPhaseStatus(projectDir: string, phaseNum: number): string | undefined {
  const phasesDir = path.join(projectDir, 'Phases');
  if (!fs.existsSync(phasesDir)) return undefined;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(phasesDir, { withFileTypes: true }); }
  catch { return undefined; }
  const prefix = `P${phaseNum}`;
  const match = entries.find(e => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith('.md'));
  if (!match) return undefined;
  try {
    const raw = fs.readFileSync(path.join(phasesDir, match.name), 'utf8');
    const { data } = matter(raw);
    return stateFromFrontmatter(data as Record<string, unknown>);
  } catch { return undefined; }
}

export function getRecentRuns(vaultRoot: string, limit = 30): RunEntry[] {
  const runs: RunEntry[] = [];
  function walkLogs(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      if (e.name === 'Logs') {
        const logsDir = path.join(dir, 'Logs');
        let logFiles: fs.Dirent[];
        try { logFiles = fs.readdirSync(logsDir, { withFileTypes: true }); }
        catch { continue; }
        for (const lf of logFiles) {
          if (!lf.isFile() || !lf.name.endsWith('.md') || lf.name.startsWith('._')) continue;
          const absPath = path.join(logsDir, lf.name);
          try {
            const stat = fs.statSync(absPath);
            const raw = fs.readFileSync(absPath, 'utf8');
            const { data, content } = matter(raw);
            const numMatch = lf.name.match(/^L(\d+)/i);
            const phaseNum = numMatch ? Number(numMatch[1]) : 0;
            const projectName = path.basename(dir).replace(/\s*-\s*Overview\.md$/i, '');
            const phaseName = lf.name.replace(/^L\d+\s*-\s*/i, '').replace(/\.md$/i, '');
            const { lastEvent, lastDetail } = parseLastLogEvent(content);
            const phaseStatus = lookupPhaseStatus(dir, phaseNum);
            runs.push({
              project: String(data.project_id || data.project || projectName),
              phaseName, phaseNum,
              path: path.relative(vaultRoot, absPath),
              modifiedAt: stat.mtime.toISOString(),
              sizeKb: Math.round(stat.size / 1024),
              lastEvent, lastDetail, phaseStatus,
            });
          } catch { /* skip */ }
        }
      } else {
        walkLogs(path.join(dir, e.name));
      }
    }
  }
  walkLogs(vaultRoot);
  return runs.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Vault tree
// ---------------------------------------------------------------------------
const TREE_SKIP = new Set([...SKIP_DIRS, 'dist', '.next', 'coverage']);

export function buildVaultTree(vaultRoot: string): VaultFileNode[] {
  function walk(dir: string, prefix: string): VaultFileNode[] {
    const nodes: VaultFileNode[] = [];
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return nodes; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.startsWith('._') || TREE_SKIP.has(e.name)) continue;
      const relPath = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        nodes.push({ name: e.name, path: relPath, kind: 'dir', children: walk(path.join(dir, e.name), relPath) });
      } else if (e.name.endsWith('.md')) {
        nodes.push({ name: e.name.replace(/\.md$/i, ''), path: relPath, kind: 'file' });
      }
    }
    nodes.sort((a, b) => a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
    return nodes;
  }
  return walk(vaultRoot, '');
}

export function writeVaultFile(vaultRoot: string, relPath: string, newContent: string): boolean {
  const abs = path.resolve(vaultRoot, relPath);
  if (!abs.startsWith(path.resolve(vaultRoot))) return false;
  try { fs.writeFileSync(abs, newContent, 'utf8'); return true; }
  catch { return false; }
}

export function readVaultFile(vaultRoot: string, relPath: string): { raw: string; content: string; frontmatter: Record<string, unknown> } | null {
  const abs = path.resolve(vaultRoot, relPath);
  if (!abs.startsWith(path.resolve(vaultRoot))) return null;
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    const { data, content } = matter(raw);
    return { raw, content, frontmatter: data as Record<string, unknown> };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Vault graph — projects, phases, hubs, wikilinks
// ---------------------------------------------------------------------------
function extractWikilinks(content: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#\n]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // strip path prefix and .md suffix for matching
    const raw = m[1].trim();
    const base = raw.split('/').pop()?.replace(/\.md$/i, '') ?? raw;
    if (base && !base.startsWith('._')) out.push(base.toLowerCase());
  }
  return out;
}

export function buildVaultGraph(vaultRoot: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const projects = getAllProjects(vaultRoot);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (s: string, t: string) => {
    if (s === t) return;
    const k = `${s}→${t}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    edges.push({ source: s, target: t });
  };

  // Build name→nodeId lookup for wikilink matching
  const nameLookup = new Map<string, string>();

  // Area hubs — derive from folder prefixes (level1 + level2)
  // level1: "02 - Fanvue" → "Fanvue"
  // level2: "02 - Fanvue/01 - Creator Tools" → "Creator Tools" (connected hub→subhub→project)
  const HUB_PALETTE = [
    '#e3b341', // gold
    '#58a6ff', // blue
    '#3fb950', // green
    '#d29922', // amber
    '#f85149', // red
    '#a371f7', // purple
    '#39c5cf', // teal
    '#ff7b72', // salmon
  ];

  const hashToIndex = (s: string, mod: number) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % mod;
  };

  const hubColor = (key: string) => HUB_PALETTE[hashToIndex(key.toLowerCase(), HUB_PALETTE.length)];
  const cleanFolder = (seg: string) => seg.replace(/^\d+\s*-\s*/, '').trim();

  const hubMap = new Map<string, string>(); // folderPrefix("A" or "A/B") → hubId
  const ensureHub = (prefix: string, hubLevel: number): string | null => {
    if (!prefix) return null;
    const existing = hubMap.get(prefix);
    if (existing) return existing;

    const segs = prefix.split('/').filter(Boolean);
    const label = cleanFolder(segs[segs.length - 1] ?? prefix);
    if (!label) return null;

    const hubId = `hub:${prefix}`;
    hubMap.set(prefix, hubId);
    nodes.push({ id: hubId, label, type: 'hub', path: prefix, hubLevel, color: hubColor(prefix) });

    // Wikilink matching convenience
    nameLookup.set(label.toLowerCase(), hubId);
    nameLookup.set((label + ' hub').toLowerCase(), hubId);
    nameLookup.set(prefix.toLowerCase(), hubId);

    return hubId;
  };

  // Build hubs (level1 + level2) from all projects
  for (const p of projects) {
    const parts = p.overviewPath.split('/');
    const lvl1 = parts[0] ?? '';
    const lvl2 = parts.length > 2 ? `${parts[0]}/${parts[1]}` : '';

    const hub1 = ensureHub(lvl1, 1);
    const hub2 = lvl2 ? ensureHub(lvl2, 2) : null;
    if (hub1 && hub2) addEdge(hub1, hub2);
  }

  // Project nodes
  for (const p of projects) {
    const pid = `project:${p.id}`;
    nodes.push({ id: pid, label: p.id, type: 'project', path: p.overviewPath });
    nameLookup.set(p.id.toLowerCase(), pid);
    const base = p.overviewPath.split('/').pop()?.replace(/\.md$/i, '').toLowerCase();
    if (base) nameLookup.set(base, pid);

    // Connect to hub / sub-hub (hub→subhub→project)
    const parts = p.overviewPath.split('/');
    const lvl1 = parts[0] ?? '';
    const lvl2 = parts.length > 2 ? `${parts[0]}/${parts[1]}` : '';

    const hub2 = lvl2 ? hubMap.get(lvl2) : undefined;
    const hub1 = hubMap.get(lvl1);
    if (hub2) addEdge(hub2, pid);
    else if (hub1) addEdge(hub1, pid);

    // Phase nodes
    for (const ph of p.phases) {
      const phid = `phase:${ph.path}`;
      nodes.push({ id: phid, label: `P${ph.phaseNum} ${ph.phaseName}`, type: 'phase', status: ph.status, path: ph.path });
      nameLookup.set(ph.phaseName.toLowerCase(), phid);
      const phBase = ph.path.split('/').pop()?.replace(/\.md$/i, '').toLowerCase();
      if (phBase) nameLookup.set(phBase, phid);
      addEdge(pid, phid);
    }
  }

  // Wikilinks from overview files
  for (const p of projects) {
    const pid = `project:${p.id}`;
    const absPath = path.join(vaultRoot, p.overviewPath);
    try {
      const raw = fs.readFileSync(absPath, 'utf8');
      const { content } = matter(raw);
      for (const link of extractWikilinks(content)) {
        const targetId = nameLookup.get(link);
        if (targetId && targetId !== pid) addEdge(pid, targetId);
      }
    } catch { /* skip */ }
  }

  return { nodes, edges };
}
