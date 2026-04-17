import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getVaultRoot } from '@/lib/vault';
import { stateFromFrontmatter } from '@onyx/shared/vault-parse';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VaultGraphNode {
  id: string;        // relative path
  label: string;     // filename without .md
  folder: string;    // parent directory
  topFolder: string; // top-level folder name
  size: number;      // bytes
  linkCount: number; // in + out degree
  phaseStatus: string | null;
  isPhase: boolean;
  /** Phase profile when set in frontmatter (content, engineering, research…). */
  profile: string | null;
  /** Directive when set in frontmatter (maniplus-audio-producer, …). */
  directive: string | null;
  /** Project ID when inferable from path/frontmatter. */
  projectId: string | null;
}

export interface VaultGraphLink { source: string; target: string }

// ── Wikilink + markdown-link regexes ──────────────────────────────────────────

const RE_WIKI = /\[\[([^\]|#\n]+)(?:[#|][^\]]*?)?\]\]/g;
const RE_MDLINK = /\[(?:[^\]]*)\]\(([^)]+\.md)\)/g;
const RE_FM = /^---\n([\s\S]*?)\n---/;
const RE_ALIAS_BRACKET = /^aliases:\s*\[([^\]]*)\]/m;
const RE_ALIAS_LIST = /^aliases:\s*\n((?:\s*-\s*.+\n?)+)/m;
const SKIP = new Set(['.git', '.obsidian', '.trash', 'node_modules', '.onyx-backups', 'dist', '.next']);
const MAX_FILES = 2000;
const MAX_FILE_SIZE = 200 * 1024; // 200 KB

// ── Recurse files ─────────────────────────────────────────────────────────────

function walkAll(dir: string, root: string, out: Array<{ relPath: string; absPath: string; size: number }>) {
  if (out.length >= MAX_FILES) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    if (e.name.startsWith('.') || e.name.startsWith('._') || SKIP.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs);
    if (e.isDirectory()) {
      walkAll(abs, root, out);
    } else if (path.extname(e.name).toLowerCase() === '.md') {
      try {
        const { size } = fs.statSync(abs);
        out.push({ relPath: rel, absPath: abs, size });
      } catch { /* skip */ }
    }
  }
}

// ── Name → relPath resolution helpers ────────────────────────────────────────

function normPath(rel: string) {
  return rel.replace(/\.md$/i, '').toLowerCase().trim();
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function GET() {
  const vaultRoot = getVaultRoot();
  if (!fs.existsSync(vaultRoot)) return NextResponse.json({ nodes: [], links: [] });

  // 1. Collect all .md files
  const files: Array<{ relPath: string; absPath: string; size: number }> = [];
  walkAll(vaultRoot, vaultRoot, files);

  // 2. Build lookup maps: basename → [relPath], normPath → relPath
  const byBase = new Map<string, string[]>();   // "fanvue (main) - overview" → ["02 - Fanvue/..."]
  const byNorm = new Map<string, string>();     // full norm path → relPath
  for (const f of files) {
    const base = path.basename(f.relPath, '.md').toLowerCase();
    const list = byBase.get(base) ?? [];
    list.push(f.relPath);
    byBase.set(base, list);
    byNorm.set(normPath(f.relPath), f.relPath);
    byNorm.set(f.relPath.toLowerCase(), f.relPath);
  }

  // Aliases from frontmatter → add extra base entries
  const aliasMap = new Map<string, string>(); // alias.lower → relPath
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) continue;
    try {
      const raw = fs.readFileSync(f.absPath, 'utf8');
      const fmMatch = RE_FM.exec(raw);
      if (!fmMatch) continue;
      const fmRaw = fmMatch[1];
      const m1 = RE_ALIAS_BRACKET.exec(fmRaw);
      const m2 = RE_ALIAS_LIST.exec(fmRaw);
      const aliases: string[] = [];
      if (m1) aliases.push(...m1[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
      if (m2) aliases.push(...m2[1].split('\n').map(s => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean));
      for (const a of aliases) aliasMap.set(a.toLowerCase(), f.relPath);
    } catch { /* skip */ }
  }

  // Resolve a wikilink/path to a relPath
  function resolve(raw: string, fromRel: string): string | null {
    const norm = raw.replace(/\.md$/i, '').toLowerCase().trim();
    // exact full path
    const byFull = byNorm.get(norm) ?? byNorm.get(raw.toLowerCase());
    if (byFull && byFull !== fromRel) return byFull;
    // alias
    const byAlias = aliasMap.get(norm);
    if (byAlias && byAlias !== fromRel) return byAlias;
    // basename
    const candidates = byBase.get(norm.split('/').pop() ?? norm) ?? [];
    const filtered = candidates.filter(r => r !== fromRel);
    if (!filtered.length) return null;
    if (filtered.length === 1) return filtered[0];
    // prefer same directory
    const sameDir = filtered.find(r => path.dirname(r) === path.dirname(fromRel));
    if (sameDir) return sameDir;
    // shortest path wins
    return filtered.sort((a, b) => a.length - b.length)[0];
  }

  // 3. Build node map
  const nodeMap = new Map<string, VaultGraphNode>();
  for (const f of files) {
    const label   = path.basename(f.relPath, '.md');
    const folder  = path.dirname(f.relPath);
    const parts   = f.relPath.split('/');
    const topFolder = parts.length > 1 ? parts[0] : 'Root';
    // A phase is any markdown under a Phases/ directory. Label-format free.
    const isPhase = parts.some(p => p === 'Phases');
    const phasesIdx = parts.lastIndexOf('Phases');
    const pathProjectId = phasesIdx > 0 ? parts[phasesIdx - 1] : null;

    let phaseStatus: string | null = null;
    let profile: string | null = null;
    let directive: string | null = null;
    let projectId: string | null = pathProjectId;
    if (isPhase && f.size <= MAX_FILE_SIZE) {
      try {
        const raw = fs.readFileSync(f.absPath, 'utf8');
        const { data } = matter(raw);
        const fm = data as Record<string, unknown>;
        phaseStatus = stateFromFrontmatter(fm);
        if (typeof fm.profile === 'string') profile = fm.profile;
        if (typeof fm.directive === 'string') directive = fm.directive;
        if (typeof fm.project_id === 'string') projectId = fm.project_id;
        else if (typeof fm.project === 'string') projectId = fm.project;
      } catch { /* skip */ }
    }

    nodeMap.set(f.relPath, {
      id: f.relPath, label, folder, topFolder, size: f.size, linkCount: 0,
      phaseStatus, isPhase, profile, directive, projectId,
    });
  }

  // 4. Parse wikilinks from all files → build links, increment linkCount
  const rawLinks: Array<{ source: string; target: string }> = [];
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) continue;
    let raw: string;
    try { raw = fs.readFileSync(f.absPath, 'utf8'); }
    catch { continue; }

    const targets = new Set<string>();
    RE_WIKI.lastIndex = 0;
    RE_MDLINK.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = RE_WIKI.exec(raw)) !== null) {
      const t = resolve(m[1].trim(), f.relPath);
      if (t) targets.add(t);
    }
    while ((m = RE_MDLINK.exec(raw)) !== null) {
      let href = m[1].trim();
      if (href.startsWith('http://') || href.startsWith('https://')) continue;
      // resolve relative to file's directory
      if (href.startsWith('./') || href.startsWith('../')) {
        href = path.resolve('/' + path.dirname(f.relPath), href).slice(1);
      }
      const t = resolve(href, f.relPath);
      if (t) targets.add(t);
    }

    for (const target of targets) {
      rawLinks.push({ source: f.relPath, target });
      const sn = nodeMap.get(f.relPath); if (sn) sn.linkCount++;
      const tn = nodeMap.get(target);    if (tn) tn.linkCount++;
    }
  }

  // 5. Directory-based structural edges.
  //
  // For every directory containing an *Overview*.md, that directory is a bundle root.
  // Every file that lives anywhere inside that bundle root gets a structural edge to
  // the Overview — regardless of frontmatter. This mirrors how Obsidian shows project
  // files as connected: they share a folder, so they're part of the same cluster.
  //
  // We also add an edge from each bundle Overview up to the top-level Hub file (e.g.
  // "Fanvue Hub.md") when one exists in the parent directory.

  // Build bundle root map: absDir → overviewRelPath
  const bundleRootMap = new Map<string, string>(); // absDir → overviewRelPath
  for (const f of files) {
    if (!/overview/i.test(path.basename(f.relPath, '.md'))) continue;
    bundleRootMap.set(path.dirname(f.absPath), f.relPath);
  }

  // Build domain hub map: absDir → hubRelPath (files named "*Hub.md" at a folder level)
  const domainHubMap = new Map<string, string>(); // absParentDir → hubRelPath
  for (const f of files) {
    if (/Hub\.md$/i.test(f.relPath)) {
      domainHubMap.set(path.dirname(f.absPath), f.relPath);
    }
  }

  const existingLinks = new Set(rawLinks.map(l => `${l.source}|||${l.target}`));

  function addEdge(src: string, tgt: string) {
    if (src === tgt) return;
    const key = `${src}|||${tgt}`;
    if (existingLinks.has(key) || existingLinks.has(`${tgt}|||${src}`)) return;
    rawLinks.push({ source: src, target: tgt });
    existingLinks.add(key);
    const sn = nodeMap.get(src); if (sn) sn.linkCount++;
    const tn = nodeMap.get(tgt); if (tn) tn.linkCount++;
  }

  for (const f of files) {
    // Walk up the directory tree (up to 4 levels) looking for a bundle root
    let dir = path.dirname(f.absPath);
    let depth = 0;
    while (depth < 4) {
      const overviewRel = bundleRootMap.get(dir);
      if (overviewRel) {
        // This file is inside a bundle — connect it to the Overview
        addEdge(f.relPath, overviewRel);

        // Also connect the Overview up to the domain hub in the parent dir (if any)
        const parentDir = path.dirname(dir);
        const hubRel = domainHubMap.get(parentDir);
        if (hubRel) addEdge(overviewRel, hubRel);

        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      depth++;
    }
  }

  // 5b. Folder-hub fallback: any node still at linkCount === 0 (not in any bundle,
  //     no wikilinks) gets linked to the most-connected node in its top-level folder.
  const folderNodes = new Map<string, VaultGraphNode[]>();
  for (const n of nodeMap.values()) {
    const arr = folderNodes.get(n.topFolder) ?? [];
    arr.push(n);
    folderNodes.set(n.topFolder, arr);
  }
  const folderHubs = new Map<string, string>();
  for (const [folder, arr] of folderNodes) {
    const sorted = arr.slice().sort((a, b) => b.linkCount - a.linkCount);
    if (sorted[0] && sorted[0].linkCount > 0) folderHubs.set(folder, sorted[0].id);
  }
  for (const n of nodeMap.values()) {
    if (n.linkCount > 0) continue;
    const hub = folderHubs.get(n.topFolder);
    if (hub) addEdge(n.id, hub);
  }

  // 6. Deduplicate links
  const seen = new Set<string>();
  const links: VaultGraphLink[] = [];
  for (const l of rawLinks) {
    if (l.source === l.target) continue;
    const key = `${l.source}|||${l.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(l);
  }

  const nodes = Array.from(nodeMap.values());
  return NextResponse.json({ nodes, links });
}
