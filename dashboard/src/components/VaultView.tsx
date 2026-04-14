'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import type { VaultFileNode } from '@/lib/types';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';
import HandTracker, { type HandGestureState, type GestureType } from './HandTracker';

interface Props { tree: VaultFileNode[]; onOpenFile: (path: string) => void }

// ─── Tree ─────────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, onOpen }: { node: VaultFileNode; depth: number; onOpen: (p: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const isOverview = /overview/i.test(node.name);
  const isPhase    = /^p\d+|^phase\s*\d+/i.test(node.name);

  if (node.kind === 'dir') return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', paddingLeft: 6 + depth * 14, cursor: 'pointer', borderRadius: 4, color: 'var(--text-dim)', fontSize: 12 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ color: 'var(--text-faint)', width: 12, flexShrink: 0 }}>{open ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}</span>
        <span style={{ color: open ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0, marginRight: 2 }}>{open ? <FolderOpen size={12}/> : <Folder size={12}/>}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{node.children?.length ?? 0}</span>
      </div>
      {open && node.children?.map(c => <TreeNode key={c.path} node={c} depth={depth + 1} onOpen={onOpen}/>)}
    </div>
  );

  return (
    <div onClick={() => onOpen(node.path)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 6px', paddingLeft: 6 + depth * 14, cursor: 'pointer', borderRadius: 4, color: isOverview ? 'var(--accent)' : isPhase ? 'var(--text-str)' : 'var(--text-dim)', fontSize: 12 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <FileText size={10} style={{ color: 'var(--text-faint)', flexShrink: 0, marginLeft: 12 }}/>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
    </div>
  );
}

// ─── Color system ─────────────────────────────────────────────────────────────

const DOMAIN_HSL: Record<string, [number, number, number]> = {
  '00 - Dashboard': [211, 100, 52],
  '01 - Life':      [145, 65, 50],
  '02 - Fanvue':    [270, 68, 65],
  '03 - Ventures':  [34,  92, 52],
  '04 - Planning':  [195, 82, 67],
  '05 - Finance':   [145, 65, 50],
  '08 - System':    [242, 56, 63],
  '09 - Archive':   [240, 2,  40],
  '10 - OpenClaw':  [211, 100, 52],
  Fanvue:           [270, 68, 65],
  Ventures:         [34,  92, 52],
  OpenClaw:         [211, 100, 52],
  Other:            [240, 10, 45],
  Root:             [240, 2,  40],
};

const PHASE_RGB: Record<string, [number, number, number]> = {
  active:   [10, 132, 255],
  running:  [10, 132, 255],
  blocked:  [255, 69, 58],
  complete: [48, 209, 88],
  done:     [48, 209, 88],
  planned:  [99, 99, 102],
  ready:    [90, 200, 250],
  pending:  [255, 159, 10],
  backlog:  [99, 99, 102],
  planning: [255, 159, 10],
};
const FALLBACK_RGB: [number, number, number] = [99, 99, 102];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const folderRgbCache = new Map<string, [number, number, number]>();

function folderToRgb(folder: string, topFolder: string): [number, number, number] {
  const cached = folderRgbCache.get(folder);
  if (cached) return cached;

  let baseHsl: [number, number, number] = [240, 2, 40];
  for (const [key, val] of Object.entries(DOMAIN_HSL)) {
    if (topFolder === key || topFolder.startsWith(key)) { baseHsl = val; break; }
  }
  const [bh, bs, bl] = baseHsl;

  let rgb: [number, number, number];
  const parts = folder.split('/');
  if (parts.length <= 1) {
    rgb = hslToRgb(bh, bs, bl);
  } else {
    const sub = parts.slice(1, 3).join('/');
    const dh = hashStr(sub) % 60 - 30;
    const ds = hashStr(sub + '_s') % 16 - 8;
    const dl = hashStr(sub + '_l') % 10 - 5;
    rgb = hslToRgb(bh + dh, Math.max(25, Math.min(95, bs + ds)), Math.max(35, Math.min(72, bl + dl)));
  }
  folderRgbCache.set(folder, rgb);
  return rgb;
}

function nodeRgb(n: VaultGraphNode): [number, number, number] {
  if (n.isPhase && n.phaseStatus) return PHASE_RGB[n.phaseStatus] ?? FALLBACK_RGB;
  return folderToRgb(n.folder, n.topFolder || n.folder.split('/')[0] || 'Root');
}

function rgba(rgb: [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

// ─── Sphere types ─────────────────────────────────────────────────────────────

interface SphereNode extends VaultGraphNode {
  theta: number; // longitude 0..2π
  phi: number;   // latitude -π/2..π/2
}
interface SphereLink { source: SphereNode; target: SphereNode }
interface BgStar { theta: number; phi: number; size: number; alpha: number }

// ─── Quaternion camera ────────────────────────────────────────────────────────
// Full 360° rotation without gimbal lock. Camera orientation stored as unit
// quaternion. Mouse drag applies world-Y yaw + camera-local-X pitch so the
// horizon stays stable and there are no poles or clamps.

type Quat = [number, number, number, number]; // [x, y, z, w]

function qIdentity(): Quat { return [0, 0, 0, 1]; }

function qNorm(q: Quat): Quat {
  const n = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2) || 1;
  return [q[0]/n, q[1]/n, q[2]/n, q[3]/n];
}

// Hamilton product: a ∘ b (a applied after b in world space)
function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
  ];
}

function qAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
  const bx = dot < 0 ? -b[0] : b[0], by = dot < 0 ? -b[1] : b[1];
  const bz = dot < 0 ? -b[2] : b[2], bw = dot < 0 ? -b[3] : b[3];
  dot = Math.abs(dot);
  if (dot > 0.9995) return qNorm([a[0]+t*(bx-a[0]), a[1]+t*(by-a[1]), a[2]+t*(bz-a[2]), a[3]+t*(bw-a[3])]);
  const th = Math.acos(dot), si = Math.sin(th);
  const s1 = Math.sin((1-t)*th)/si, s2 = Math.sin(t*th)/si;
  return [a[0]*s1+bx*s2, a[1]*s1+by*s2, a[2]*s1+bz*s2, a[3]*s1+bw*s2];
}

// Transform world vector into camera space (inverse = conjugate of unit quat)
function qRotInv(q: Quat, vx: number, vy: number, vz: number): [number, number, number] {
  const [x, y, z, w] = q;
  return [
    (1-2*(y*y+z*z))*vx + 2*(x*y+w*z)*vy  + 2*(x*z-w*y)*vz,
    2*(x*y-w*z)*vx     + (1-2*(x*x+z*z))*vy + 2*(y*z+w*x)*vz,
    2*(x*z+w*y)*vx     + 2*(y*z-w*x)*vy  + (1-2*(x*x+y*y))*vz,
  ];
}

// ─── Inside-sphere projection ─────────────────────────────────────────────────
function projectInsideSphere(
  theta: number, phi: number,
  camQuat: Quat,
  focal: number,
): { sx: number; sy: number; depth: number; visible: boolean } {
  const wx = Math.cos(phi) * Math.sin(theta);
  const wy = Math.sin(phi);
  const wz = Math.cos(phi) * Math.cos(theta);
  const [x_cam, y_cam, z_cam] = qRotInv(camQuat, wx, wy, wz);
  if (z_cam < 0.05) return { sx: 0, sy: 0, depth: z_cam, visible: false };
  return {
    sx: (x_cam / z_cam) * focal,
    sy: -(y_cam / z_cam) * focal,
    depth: z_cam,
    visible: true,
  };
}

// ─── Sphere layout ────────────────────────────────────────────────────────────
// Two independent spatial controls:
//   bundleSep (1–10): how spread domain cluster CENTRES are across the sphere.
//     Uses a phi-scale factor so 10 = full pole-to-pole spread, 1 = all near equator.
//   nodeSpread (1–10): how tightly nodes pack WITHIN their domain cap.
//     Scales the spherical cap radius. Low = tight cluster, high = loose cloud.
function layoutOnSphere(
  nodes: VaultGraphNode[],
  nodeSpread: number,
  bundleSep: number,
): {
  sphereNodes: SphereNode[];
  domainCenters: Map<string, { theta: number; phi: number }>;
} {
  const domains = [...new Set(nodes.map(n => n.topFolder))];
  // phiScale: 0.1 (equator band) → 1.0 (full sphere, pole to pole)
  const phiScale = Math.max(0.05, bundleSep / 10);
  const domainCenter = new Map(domains.map((d, i) => {
    const y   = 1 - (2 * i + 1) / domains.length;           // -1..1
    const phi = Math.asin(Math.max(-1, Math.min(1, y * phiScale)));
    const theta = 2 * Math.PI * i * 1.618;                   // golden angle
    return [d, { theta, phi }] as [string, { theta: number; phi: number }];
  }));

  const byDomain = new Map<string, VaultGraphNode[]>();
  for (const n of nodes) {
    const g = byDomain.get(n.topFolder) ?? [];
    g.push(n); byDomain.set(n.topFolder, g);
  }

  const sphereNodes: SphereNode[] = [];
  const PHI = 1.618;
  // tighter base formula — default nodeSpread=4 gives ~0.8× old default
  const spreadMul = nodeSpread / 5;
  for (const [domain, dnodes] of byDomain) {
    const center = domainCenter.get(domain)!;
    const capRad = Math.min(0.80, (0.12 + Math.sqrt(dnodes.length) * 0.030) * spreadMul);
    const sorted = [...dnodes].sort((a, b) => b.linkCount - a.linkCount);
    for (let i = 0; i < sorted.length; i++) {
      const t     = i === 0 ? 0 : i / (sorted.length - 1 || 1);
      const r     = capRad * Math.sqrt(t);
      const angle = 2 * Math.PI * i * PHI;
      const dPhi  = r * Math.sin(angle);
      const dTheta = r * Math.cos(angle) / Math.max(0.15, Math.cos(center.phi + dPhi));
      sphereNodes.push({
        ...sorted[i],
        theta: center.theta + dTheta,
        phi: Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, center.phi + dPhi)),
      });
    }
  }
  return { sphereNodes, domainCenters: domainCenter };
}

const DWELL_MS     = 800;
const BG_STAR_COUNT = 350;
const STABLE_FRAMES = 5;

// ─── VaultGraph ───────────────────────────────────────────────────────────────

function VaultGraph({ onOpenFile }: { onOpenFile: (p: string) => void }) {
  const wrapRef    = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const sizeRef    = useRef({ w: 0, h: 0 });

  // Sphere data
  const sphereNodesRef   = useRef<SphereNode[]>([]);
  const sphereLinksRef   = useRef<SphereLink[]>([]);
  const domainCentersRef = useRef<Map<string, { theta: number; phi: number }>>(new Map());
  const bgStarsRef       = useRef<BgStar[]>([]);

  // Camera — stored as unit quaternion (no gimbal lock, full 360°)
  const camQuatRef       = useRef<Quat>(qIdentity());
  const camQuatTargetRef = useRef<Quat>(qIdentity());
  const fovRef           = useRef(75);
  const fovTargetRef     = useRef(75);
  const lastInteractRef  = useRef(Date.now());

  // Projection cache: id → { sx, sy, depth, visible }
  const projCacheRef = useRef<Map<string, { sx: number; sy: number; depth: number; visible: boolean }>>(new Map());

  // Interaction state
  const hovRef       = useRef<SphereNode | null>(null);
  const dirtyRef     = useRef(false);
  const rafRef       = useRef<number>(0);
  const didMoveRef   = useRef(false);
  const downPosRef   = useRef({ x: 0, y: 0 });
  const lookDragRef  = useRef<{ active: boolean; px: number; py: number } | null>(null);

  // Hand tracking state
  const indexCursorRef      = useRef<{ x: number; y: number } | null>(null);
  const palmCursorRef       = useRef<{ x: number; y: number } | null>(null);
  const gestureTypeRef      = useRef<GestureType>('none');
  const dwellRef            = useRef<{ nodeId: string; startTime: number } | null>(null);
  const fistStartRef        = useRef<number | null>(null);
  const gestureCandidateRef = useRef<{ type: GestureType; frames: number }>({ type: 'none', frames: 0 });
  const smoothPalmRef       = useRef<{ x: number; y: number } | null>(null);
  const smoothPinchRef      = useRef<number | null>(null);
  const prevGestureRef      = useRef<HandGestureState | null>(null);

  const [loading, setLoading]       = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [connOnly, setConnOnly]     = useState(true);
  const [search, setSearch]         = useState('');
  const [spacing, setSpacing]       = useState(4);   // 1–10: node spread WITHIN cluster cap
  const [bundleSep, setBundleSep]   = useState(8);   // 1–10: separation BETWEEN cluster centres
  const [nodeSize, setNodeSize]     = useState(5);    // 1–10: node radius multiplier
  const [tooltip, setTooltip]       = useState<{ x: number; y: number; label: string; sub: string } | null>(null);
  const [handMode, setHandMode]       = useState(false);
  const [handPaused, setHandPaused]   = useState(false);
  const handPausedRef                 = useRef(false);
  useEffect(() => { handPausedRef.current = handPaused; }, [handPaused]);
  const [activeGesture, setActiveGesture] = useState<GestureType>('none');

  // Refs for values used in stable callbacks
  const onOpenFileRef  = useRef(onOpenFile);
  useEffect(() => { onOpenFileRef.current = onOpenFile; }, [onOpenFile]);
  const searchRef      = useRef('');
  useEffect(() => { searchRef.current = search; dirtyRef.current = true; }, [search]);
  const showLabelsRef  = useRef(true);
  useEffect(() => { showLabelsRef.current = showLabels; dirtyRef.current = true; }, [showLabels]);
  const nodeSizeRef = useRef(5);
  useEffect(() => { nodeSizeRef.current = nodeSize; dirtyRef.current = true; }, [nodeSize]);

  // Raw data
  const [rawNodes, setRawNodes] = useState<VaultGraphNode[]>([]);
  const [rawLinks, setRawLinks] = useState<VaultGraphLink[]>([]);

  const connectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of rawLinks) { s.add(l.source); s.add(l.target); }
    return s;
  }, [rawLinks]);

  const activeNodes = useMemo(
    () => connOnly ? rawNodes.filter(n => connectedIds.has(n.id)) : rawNodes,
    [rawNodes, connOnly, connectedIds],
  );
  const activeNodeIds = useMemo(() => new Set(activeNodes.map(n => n.id)), [activeNodes]);
  const activeLinks   = useMemo(
    () => rawLinks.filter(l => activeNodeIds.has(l.source) && activeNodeIds.has(l.target)),
    [rawLinks, activeNodeIds],
  );

  const matchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const s = new Set<string>();
    for (const n of activeNodes) {
      if (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) s.add(n.id);
    }
    return s;
  }, [search, activeNodes]);

  // ── Hit-test ref (avoids stale closure in hand gesture callback) ──────────
  const hitTestFnRef = useRef<(mx: number, my: number) => SphereNode | undefined>(() => undefined);
  useEffect(() => {
    hitTestFnRef.current = (mx: number, my: number): SphereNode | undefined => {
      const { w, h } = sizeRef.current;
      let best: SphereNode | undefined;
      let bestD2 = Infinity;
      for (const n of sphereNodesRef.current) {
        const proj = projCacheRef.current.get(n.id);
        if (!proj?.visible) continue;
        const nx = w / 2 + proj.sx;
        const ny = h / 2 + proj.sy;
        const isConn = connectedIds.has(n.id);
        const szMul = nodeSizeRef.current / 5;
        const r = isConn ? Math.max(4, Math.min(24, (4 + 2.5 * n.linkCount) * szMul)) : 3 * szMul;
        const d2 = (nx - mx) ** 2 + (ny - my) ** 2;
        if (d2 <= (r + 8) ** 2 && d2 < bestD2) { bestD2 = d2; best = n; }
      }
      return best;
    };
  }, [connectedIds]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const { width: w, height: h } = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h };
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    dirtyRef.current = true;
  }, []);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const dpr   = window.devicePixelRatio || 1;
    const camQuat = camQuatRef.current;
    const fov     = fovRef.current;
    const focal = (w / 2) / Math.tan((fov / 2) * Math.PI / 180);
    const cx = w / 2, cy = h / 2;
    const nodes   = sphereNodesRef.current;
    const links   = sphereLinksRef.current;
    const hov     = hovRef.current;
    const matched = matchIds;
    const dimmed  = matched ? matched.size > 0 : false;
    const showLbls = showLabelsRef.current;

    // Background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w * dpr, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Background stars ──────────────────────────────────────────────────
    for (const star of bgStarsRef.current) {
      const p = projectInsideSphere(star.theta, star.phi, camQuat, focal);
      if (!p.visible) continue;
      ctx.beginPath();
      ctx.arc(cx + p.sx, cy + p.sy, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,215,235,${(star.alpha * Math.min(1, p.depth)).toFixed(3)})`;
      ctx.fill();
    }

    // ── Project all nodes ─────────────────────────────────────────────────
    projCacheRef.current.clear();
    for (const node of nodes) {
      projCacheRef.current.set(node.id, projectInsideSphere(node.theta, node.phi, camQuat, focal));
    }

    // ── Ghost domain labels (only when no search active) ─────────────────
    if (!searchRef.current.trim()) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [domain, center] of domainCentersRef.current) {
        const p = projectInsideSphere(center.theta, center.phi, camQuat, focal);
        if (!p.visible || p.depth < 0.25) continue;
        const hslEntry = DOMAIN_HSL[domain];
        if (!hslEntry) continue;
        const [bh, bs, bl] = hslEntry;
        const rgb = hslToRgb(bh, bs, bl);
        const parts = domain.split(' - ');
        const lbl = (parts[parts.length - 1] || domain).toUpperCase();
        ctx.font = `500 ${Math.round(10 + p.depth * 3)}px system-ui,sans-serif`;
        ctx.shadowColor = '#0d1117';
        ctx.shadowBlur = 10;
        ctx.fillStyle = rgba(rgb, Math.min(0.42, 0.42 * p.depth));
        ctx.fillText(lbl, cx + p.sx, cy + p.sy);
        ctx.shadowBlur = 0;
      }
      ctx.textBaseline = 'alphabetic';
    }

    // ── Links ─────────────────────────────────────────────────────────────
    for (const link of links) {
      const sp = projCacheRef.current.get(link.source.id);
      const tp = projCacheRef.current.get(link.target.id);
      if (!sp?.visible || !tp?.visible) continue;
      const s = link.source, t = link.target;
      const isDimmed   = dimmed && !matched?.has(s.id) && !matched?.has(t.id);
      const alpha      = Math.min(1, (s.linkCount + t.linkCount) / 20);
      const avgDepth   = (sp.depth + tp.depth) / 2;
      const isHovLink  = hov?.id === s.id || hov?.id === t.id;
      ctx.beginPath();
      ctx.moveTo(cx + sp.sx, cy + sp.sy);
      ctx.lineTo(cx + tp.sx, cy + tp.sy);
      ctx.strokeStyle = isDimmed
        ? 'rgba(60,60,70,0.07)'
        : rgba(nodeRgb(s), alpha * 0.28 * avgDepth + (isHovLink ? 0.32 : 0));
      ctx.lineWidth = 0.5 + alpha * 0.5;
      ctx.stroke();
    }

    // ── Nodes (back-to-front by depth) ────────────────────────────────────
    const sorted = [...nodes].sort((a, b) => {
      const da = projCacheRef.current.get(a.id)?.depth ?? 0;
      const db = projCacheRef.current.get(b.id)?.depth ?? 0;
      return da - db;
    });

    for (const node of sorted) {
      const proj = projCacheRef.current.get(node.id);
      if (!proj?.visible) continue;
      const { sx, sy, depth } = proj;
      const nx = cx + sx, ny = cy + sy;
      const isConn   = connectedIds.has(node.id);
      const isHov    = hov?.id === node.id;
      const isMatch  = matched?.has(node.id) ?? true;
      const isDimmed = dimmed && !isMatch;
      const isHub    = isConn && node.linkCount >= 3;
      const rgb      = nodeRgb(node);
      const depthFade = Math.max(0.3, depth);
      const szMul   = nodeSizeRef.current / 5;

      const baseR = isConn
        ? Math.max(4, Math.min(24, (4 + 2.5 * node.linkCount) * szMul))
        : Math.max(2, 3 * szMul);
      const r = baseR * (0.65 + 0.35 * depthFade);

      // Glow
      if ((isHub || isHov) && !isDimmed) {
        const glowR = r + (isHub ? 7 : 0) + (isHov ? 9 : 0);
        const g = ctx.createRadialGradient(nx, ny, r * 0.3, nx, ny, glowR);
        g.addColorStop(0, rgba(rgb, isHov ? 0.38 : 0.18));
        g.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(nx, ny, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Fill
      ctx.beginPath();
      ctx.arc(nx, ny, isHov ? r * 1.18 : r, 0, Math.PI * 2);
      const fillAlpha = isDimmed ? 0.08 : (isConn ? (node.isPhase ? 0.7 : 0.9) : 0.45) * depthFade;
      ctx.fillStyle = rgba(rgb, fillAlpha);
      ctx.fill();

      // Hub ring
      if (isHub && !isDimmed) {
        ctx.beginPath();
        ctx.arc(nx, ny, r + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(rgb, 0.4 * depthFade);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Phase ring
      if (node.isPhase && !isDimmed) {
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(1, r - 1.5), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(rgb, 0.55 * depthFade);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Labels — always for hubs, always for hovered, optionally for connected nodes
      const showThisLabel = showLbls && !isDimmed && (isHub || isHov || (isConn && depth > 0.7));
      if (showThisLabel) {
        const lbl = node.label.length > 28 ? node.label.slice(0, 28) + '…' : node.label;
        const fontSize = isHub ? 13 : 11;
        ctx.font = `${isHub ? 600 : 400} ${fontSize}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = '#0d1117';
        ctx.shadowBlur = 6;
        const labelAlpha = isHov ? 1 : (isHub ? 0.95 : 0.82) * depthFade;
        ctx.fillStyle = isHov ? '#e6edf3' : rgba(rgb, labelAlpha);
        ctx.fillText(lbl, nx, ny + r + 3);
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Hand cursor ───────────────────────────────────────────────────────
    const gesture   = gestureTypeRef.current;
    const idxCursor = indexCursorRef.current;
    const plmCursor = palmCursorRef.current;
    const cursor    = gesture === 'point' ? idxCursor : plmCursor;

    if (cursor) {
      const { x: ccx, y: ccy } = cursor;
      const col = gesture === 'point'  ? '255,255,255'
                : gesture === 'pinch'  ? '255,214,10'
                : gesture === 'gun'    ? '255,159,10'
                : gesture === 'peace'  ? '68,147,248'
                : gesture === 'fist'   ? '255,69,58'
                : '0,220,180';
      const glowR = gesture === 'palm' || gesture === 'fist' ? 28 : 18;
      const dotR  = gesture === 'palm' ? 6 : 4;

      const cg = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, glowR);
      cg.addColorStop(0, `rgba(${col},0.28)`);
      cg.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(ccx, ccy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ccx, ccy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},0.92)`;
      ctx.fill();

      const dwell = dwellRef.current;
      if (gesture === 'point' && dwell) {
        const progress = Math.min(1, (Date.now() - dwell.startTime) / DWELL_MS);
        ctx.beginPath();
        ctx.arc(ccx, ccy, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,220,180,0.9)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (progress < 1) dirtyRef.current = true;
      }

      const fistStart = fistStartRef.current;
      if (gesture === 'fist' && fistStart) {
        const progress = Math.min(1, (Date.now() - fistStart) / 1000);
        ctx.beginPath();
        ctx.arc(ccx, ccy, 26, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,69,58,0.9)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (progress < 1) dirtyRef.current = true;
      }
    }

    dirtyRef.current = false;
  }, [connectedIds, matchIds]);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(loop);

      // Camera slerp
      const cam = camQuatRef.current, tgt = camQuatTargetRef.current;
      const dot = cam[0]*tgt[0] + cam[1]*tgt[1] + cam[2]*tgt[2] + cam[3]*tgt[3];
      if (Math.abs(dot) < 0.99999) {
        camQuatRef.current = qSlerp(cam, tgt, 0.15);
        dirtyRef.current = true;
      }

      // FOV lerp
      const dFov = fovTargetRef.current - fovRef.current;
      if (Math.abs(dFov) > 0.01) {
        fovRef.current += dFov * 0.15;
        dirtyRef.current = true;
      }

      // Auto-drift when idle > 4s: gentle constant rotation around world Y
      const idleSec = (Date.now() - lastInteractRef.current) / 1000;
      if (idleSec > 4) {
        const driftQ = qAxisAngle(0, 1, 0, 0.0004);
        camQuatTargetRef.current = qNorm(qMul(driftQ, camQuatTargetRef.current));
        dirtyRef.current = true;
      }

      if (dirtyRef.current) draw();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver(() => { resizeCanvas(); dirtyRef.current = true; });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [resizeCanvas]);

  // ── Fetch graph data ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch('/api/onyx/vault-graph').then(r => r.json()).then(
      ({ nodes, links }: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        if (cancelled) return;
        setRawNodes(nodes);
        setRawLinks(links);
        setLoading(false);
      }
    ).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // ── Background stars (generated once) ─────────────────────────────────────
  useEffect(() => {
    const stars: BgStar[] = [];
    for (let i = 0; i < BG_STAR_COUNT; i++) {
      stars.push({
        theta: Math.random() * Math.PI * 2,
        phi:   Math.asin(Math.random() * 2 - 1),  // uniform on sphere
        size:  0.4 + Math.random() * 1.3,
        alpha: 0.06 + Math.random() * 0.28,
      });
    }
    bgStarsRef.current = stars;
  }, []);

  // ── Rebuild sphere layout when nodes/links/spacing change ─────────────────
  useEffect(() => {
    if (!activeNodes.length) return;
    const { sphereNodes, domainCenters } = layoutOnSphere(activeNodes, spacing, bundleSep);
    const idMap = new Map(sphereNodes.map(n => [n.id, n]));
    const sphereLinks: SphereLink[] = activeLinks
      .map(l => ({ source: idMap.get(l.source)!, target: idMap.get(l.target)! }))
      .filter(l => l.source && l.target);
    sphereNodesRef.current   = sphereNodes;
    sphereLinksRef.current   = sphereLinks;
    domainCentersRef.current = domainCenters;
    dirtyRef.current = true;
  }, [activeNodes, activeLinks, spacing, bundleSep]);

  useEffect(() => { dirtyRef.current = true; }, [matchIds, connOnly]);

  // ── Wheel → FOV ───────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    lastInteractRef.current = Date.now();
    camQuatTargetRef.current = [...camQuatRef.current] as Quat; // freeze drift
    const rawDelta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
    const clamped  = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 200);
    fovTargetRef.current = Math.max(15, Math.min(150, fovTargetRef.current + clamped * 0.05));
  }, []);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    lastInteractRef.current = Date.now();
    downPosRef.current = { x: e.clientX, y: e.clientY };
    didMoveRef.current = false;
    lookDragRef.current = { active: true, px: e.clientX, py: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    const moveX = e.clientX - downPosRef.current.x;
    const moveY = e.clientY - downPosRef.current.y;
    if (moveX * moveX + moveY * moveY > 16) didMoveRef.current = true;

    if (lookDragRef.current?.active) {
      const { w, h } = sizeRef.current;
      const dx = e.clientX - lookDragRef.current.px;
      const dy = e.clientY - lookDragRef.current.py;
      lookDragRef.current.px = e.clientX;
      lookDragRef.current.py = e.clientY;
      let q = camQuatRef.current;
      q = qMul(qAxisAngle(0, 1, 0, dx * Math.PI * 1.6 / Math.max(w, 1)), q);
      q = qMul(q, qAxisAngle(1, 0, 0, dy * Math.PI / Math.max(h, 1)));
      q = qNorm(q);
      camQuatRef.current       = q;
      camQuatTargetRef.current = q;
      lastInteractRef.current = Date.now();
      dirtyRef.current = true;
      return;
    }

    const hit = hitTestFnRef.current(mx, my);
    if (hit?.id !== hovRef.current?.id) {
      hovRef.current = hit ?? null;
      if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab';
      dirtyRef.current = true;
    }
    if (hit) {
      const sub = hit.isPhase ? (hit.phaseStatus ?? '') : hit.topFolder;
      setTooltip({ x: mx + 14, y: my - 10, label: hit.label, sub });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    lookDragRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = hovRef.current ? 'pointer' : 'grab';
    dirtyRef.current = true;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (didMoveRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = hitTestFnRef.current(mx, my);
    if (hit) onOpenFileRef.current(hit.id);
  }, []);

  const handleLeave = useCallback(() => {
    lookDragRef.current = null;
    hovRef.current = null;
    setTooltip(null);
    dirtyRef.current = true;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  const homeView = useCallback(() => {
    camQuatTargetRef.current = qIdentity();
    fovTargetRef.current     = 75;
    lastInteractRef.current  = 0;
    dirtyRef.current = true;
  }, []);

  // ── Hand gesture handler ───────────────────────────────────────────────────
  const handleHandGesture = useCallback((state: HandGestureState) => {
    lastInteractRef.current = Date.now();
    const { w, h } = sizeRef.current;

    // Hysteresis: require STABLE_FRAMES consecutive frames before switching gesture
    const rawGesture = state.gesture;
    const cand = gestureCandidateRef.current;
    if (rawGesture === cand.type) {
      cand.frames = Math.min(cand.frames + 1, STABLE_FRAMES + 1);
    } else {
      gestureCandidateRef.current = { type: rawGesture, frames: 1 };
    }
    const gesture = cand.frames >= STABLE_FRAMES ? rawGesture : gestureTypeRef.current;

    // Update cursor positions (mirror X: webcam is selfie-flipped)
    if (state.detected) {
      indexCursorRef.current = { x: (1 - state.indexX) * w, y: state.indexY * h };
      palmCursorRef.current  = { x: (1 - state.palmX)  * w, y: state.palmY  * h };
    } else {
      indexCursorRef.current = null;
      palmCursorRef.current  = null;
      dwellRef.current       = null;
      fistStartRef.current   = null;
      smoothPalmRef.current  = null;
      smoothPinchRef.current = null;
    }

    // Paused: any non-fist gesture resumes
    if (handPausedRef.current) {
      if (gesture !== gestureTypeRef.current) {
        gestureTypeRef.current = gesture;
        setActiveGesture(gesture);
      }
      if (state.detected && gesture !== 'fist' && gesture !== 'none') setHandPaused(false);
      dirtyRef.current = true;
      return;
    }

    // Commit gesture change
    if (gesture !== gestureTypeRef.current) {
      const prevType = gestureTypeRef.current;
      // Quick fist tap → close panel
      if (prevType === 'fist' && fistStartRef.current && Date.now() - fistStartRef.current < 400) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      gestureTypeRef.current  = gesture;
      setActiveGesture(gesture);
      dwellRef.current        = null;
      fistStartRef.current    = null;
      smoothPalmRef.current   = null;
      smoothPinchRef.current  = null;
    }

    if (!state.detected) { prevGestureRef.current = state; dirtyRef.current = true; return; }

    if (gesture === 'fist') {
      camQuatTargetRef.current = [...camQuatRef.current] as Quat; // freeze drift
      if (!fistStartRef.current) fistStartRef.current = Date.now();
      else if (Date.now() - fistStartRef.current >= 1000) {
        setHandPaused(true);
        fistStartRef.current = Date.now();
      }

    } else if (gesture === 'palm' || gesture === 'peace') {
      // Look around: EMA-smooth palm delta → rotate camera
      const ALPHA = 0.35;
      if (!smoothPalmRef.current) smoothPalmRef.current = { x: state.palmX, y: state.palmY };
      const prev = smoothPalmRef.current;
      const sx = prev.x * (1 - ALPHA) + state.palmX * ALPHA;
      const sy = prev.y * (1 - ALPHA) + state.palmY * ALPHA;
      const dx = sx - prev.x, dy = sy - prev.y;
      smoothPalmRef.current = { x: sx, y: sy };

      if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
        // Webcam mirror: dx < 0 → hand moved right → look right (world-Y yaw left-multiply)
        let q = camQuatTargetRef.current;
        q = qMul(qAxisAngle(0, 1, 0, -dx * 6), q);
        q = qMul(q, qAxisAngle(1, 0, 0, -dy * 4));
        camQuatTargetRef.current = qNorm(q);
      }

    } else if (gesture === 'pinch') {
      // Pinch: zoom in (narrow FOV)
      const ALPHA = 0.2;
      smoothPinchRef.current = smoothPinchRef.current == null
        ? state.pinchDist
        : smoothPinchRef.current * (1 - ALPHA) + state.pinchDist * ALPHA;
      const tightness = Math.max(0, 1 - smoothPinchRef.current / 0.13);
      fovTargetRef.current = Math.max(15, fovTargetRef.current - (0.12 + tightness * 0.35));

    } else if (gesture === 'gun') {
      // L-shape: zoom out (widen FOV)
      fovTargetRef.current = Math.min(150, fovTargetRef.current + 0.3);

    } else if (gesture === 'point') {
      // Cursor + dwell-to-open
      camQuatTargetRef.current = [...camQuatRef.current] as Quat; // freeze drift
      const cursor = indexCursorRef.current;
      if (cursor) {
        const hit = hitTestFnRef.current(cursor.x, cursor.y);
        hovRef.current = hit ?? null;
        const now = Date.now();
        if (hit) {
          if (dwellRef.current?.nodeId === hit.id) {
            if (now - dwellRef.current.startTime >= DWELL_MS) {
              onOpenFileRef.current(hit.id);
              dwellRef.current = null;
            }
          } else {
            dwellRef.current = { nodeId: hit.id, startTime: now };
          }
        } else {
          if (dwellRef.current?.nodeId === '__close__') {
            if (now - dwellRef.current.startTime >= DWELL_MS) {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              dwellRef.current = null;
            }
          } else {
            dwellRef.current = { nodeId: '__close__', startTime: now };
          }
        }
      }
    }

    prevGestureRef.current = state;
    dirtyRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Non-passive wheel listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => handleWheel(e);
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [handleWheel]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>

      {/* Controls */}
      <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            width: 140, padding: '4px 9px', borderRadius: 5,
            border: '1px solid rgba(48,54,61,0.9)', background: 'rgba(22,27,34,0.9)',
            color: '#e6edf3', fontSize: 11, outline: 'none', fontFamily: 'inherit',
            backdropFilter: 'blur(6px)',
          }}
        />
        {([
          { key: 'between', label: 'Between', val: bundleSep, set: setBundleSep },
          { key: 'within',  label: 'Within',  val: spacing,   set: setSpacing   },
          { key: 'size',    label: 'Size',     val: nodeSize,  set: setNodeSize  },
        ]).map(({ key, label, val, set }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(22,27,34,0.85)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 5, padding: '3px 8px', backdropFilter: 'blur(4px)' }}>
            <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)' }}>{label}</span>
            <input type="range" min={1} max={10} value={val} onChange={e => set(Number(e.target.value))}
              style={{ width: 56, accentColor: '#4493f8', cursor: 'pointer' }}/>
            <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)', fontFamily: 'monospace', minWidth: 10 }}>{val}</span>
          </div>
        ))}
        {([
          { label: 'Labels',    active: showLabels, toggle: () => setShowLabels(l => !l) },
          { label: 'Connected', active: connOnly,   toggle: () => setConnOnly(c => !c) },
        ] as const).map(({ label, active, toggle }) => (
          <button key={label} onClick={toggle} style={{
            padding: '4px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${active ? 'rgba(68,147,248,0.6)' : 'rgba(48,54,61,0.8)'}`,
            background: active ? 'rgba(68,147,248,0.1)' : 'rgba(22,27,34,0.85)',
            color: active ? '#4493f8' : 'rgba(139,148,158,0.8)',
            backdropFilter: 'blur(4px)',
          }}>{label}</button>
        ))}
        <button onClick={() => { setHandMode(m => !m); setHandPaused(false); }} style={{
          padding: '4px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${handMode ? (handPaused ? 'rgba(255,159,10,0.6)' : 'rgba(0,220,180,0.6)') : 'rgba(48,54,61,0.8)'}`,
          background: handMode ? (handPaused ? 'rgba(255,159,10,0.08)' : 'rgba(0,220,180,0.08)') : 'rgba(22,27,34,0.85)',
          color: handMode ? (handPaused ? 'rgba(255,159,10,0.9)' : 'rgba(0,220,180,0.9)') : 'rgba(139,148,158,0.8)',
          backdropFilter: 'blur(4px)',
        }}>{handMode ? (handPaused ? 'Hand ⏸' : 'Hand ●') : 'Hand'}</button>
        <button onClick={homeView} style={{
          padding: '4px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(48,54,61,0.8)', background: 'rgba(22,27,34,0.85)',
          color: 'rgba(139,148,158,0.8)', backdropFilter: 'blur(4px)',
        }}>Home</button>
        {!loading && (
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.5)' }}>
            {activeNodes.length} nodes · {activeLinks.length} links
          </span>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(139,148,158,0.6)', fontSize: 12 }}>
          Parsing vault…
        </div>
      )}

      <div ref={wrapRef} style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef}
          style={{ display: 'block', cursor: 'grab', position: 'absolute', inset: 0 }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleLeave} onClick={handleClick}
        />
      </div>

      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y, pointerEvents: 'none', zIndex: 20,
          background: 'rgba(22,27,34,0.96)', border: '1px solid rgba(48,54,61,0.9)',
          borderRadius: 6, padding: '6px 11px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3', marginBottom: tooltip.sub ? 2 : 0 }}>{tooltip.label}</div>
          {tooltip.sub && <div style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)', textTransform: 'capitalize' }}>{tooltip.sub}</div>}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: 'rgba(139,148,158,0.4)', userSelect: 'none', pointerEvents: 'none' }}>
        Drag to look around · scroll to zoom · click to open{handMode ? ' · hand tracking on' : ''}
      </div>

      {handMode && (
        <div style={{
          position: 'absolute', bottom: 152, right: 16, zIndex: 45,
          background: 'rgba(13,17,23,0.93)', border: `1px solid ${handPaused ? 'rgba(255,159,10,0.5)' : 'rgba(48,54,61,0.9)'}`,
          borderRadius: 8, padding: '10px 12px', width: 190,
          backdropFilter: 'blur(10px)', boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
            <div style={{ fontSize: 9, color: 'rgba(139,148,158,0.6)', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Hand Gestures
            </div>
            {handPaused && <div style={{ fontSize: 9, color: 'rgba(255,159,10,0.9)', fontFamily: 'monospace', fontWeight: 600 }}>PAUSED</div>}
          </div>
          {([
            { icon: '🖐', label: 'Open palm', desc: 'Look around',              g: 'palm'  },
            { icon: '☝️', label: 'Point',     desc: 'Dwell=open · empty=close', g: 'point' },
            { icon: '🤏', label: 'Pinch',     desc: 'Hold to zoom in',          g: 'pinch' },
            { icon: '🤙', label: 'L-shape',   desc: 'Hold to zoom out',         g: 'gun'   },
            { icon: '✌️', label: 'Peace',     desc: 'Look around (orbit)',       g: 'peace' },
            { icon: '✊', label: 'Fist',      desc: 'Tap=close · hold=pause',   g: 'fist'  },
          ] as { icon: string; label: string; desc: string; g: GestureType }[]).map(({ icon, label, desc, g }) => {
            const isActive = !handPaused && activeGesture === g;
            return (
              <div key={g} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
                borderRadius: 5, marginBottom: 2,
                background: isActive ? 'rgba(0,220,180,0.1)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(0,220,180,0.35)' : 'transparent'}`,
                opacity: handPaused ? 0.45 : 1,
              }}>
                <span style={{ fontSize: 15, lineHeight: 1, width: 18, textAlign: 'center' }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: isActive ? 'rgba(0,220,180,0.95)' : 'rgba(200,210,220,0.8)' }}>{label}</div>
                  <div style={{ fontSize: 9, color: 'rgba(139,148,158,0.5)' }}>{desc}</div>
                </div>
              </div>
            );
          })}
          {handPaused && (
            <div style={{ marginTop: 6, fontSize: 9, color: 'rgba(255,159,10,0.7)', textAlign: 'center' }}>
              make any gesture to resume
            </div>
          )}
        </div>
      )}

      <HandTracker active={handMode} onGesture={handleHandGesture}/>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function VaultView({ tree, onOpenFile }: Props) {
  const [view, setView] = useState<'graph' | 'tree'>('graph');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 0, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-1)' }}>
        {(['graph', 'tree'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 14px', border: '1px solid var(--border)',
            borderRadius: v === 'graph' ? '4px 0 0 4px' : '0 4px 4px 0',
            background: view === v ? 'var(--bg-3)' : 'transparent',
            color: view === v ? 'var(--text-str)' : 'var(--text-faint)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            marginLeft: v === 'tree' ? -1 : 0,
          }}>{v === 'graph' ? 'Graph' : 'File Tree'}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'tree' ? (
          <div style={{ height: '100%', overflow: 'auto', padding: '6px 2px', background: 'var(--bg)' }}>
            {tree.map(n => <TreeNode key={n.path} node={n} depth={0} onOpen={onOpenFile}/>)}
          </div>
        ) : (
          <VaultGraph onOpenFile={onOpenFile}/>
        )}
      </div>
    </div>
  );
}
