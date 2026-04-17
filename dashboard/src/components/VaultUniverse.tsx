'use client';

/**
 * VaultUniverse — the camera lives IN the graph.
 *
 * You are at a node. Its neighbours (1-hop) are visible around you. To "go
 * back to where you came from" you just click the previous node — it's still
 * a neighbour of the current one. No separate back-stack, no hidden parents.
 *
 * When you're inside a project, the neighbours are grouped by what they
 * actually are:
 *   • Active / Ready / Blocked phases go in the primary "workspace" sectors
 *   • Backlog / Planning go further to the side
 *   • Completed go behind
 *   • Hubs + knowledge docs float above
 * So the scene itself tells you what needs attention.
 *
 * Quick-jump project pills + a phase-action sidebar (Launch, Stop, Mark ready,
 * Open) make this a usable ops interface, not just a viewer.
 */

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';

interface Props { onOpenFile: (path: string) => void }

// ── Palette ────────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  '00': '#4493f8', '03': '#ff9f0a', '04': '#00dcb4', '05': '#b478ff',
  '08': '#dc6e6e', '09': '#787878', '10': '#ffc850',
};
function colorForTopFolder(topFolder: string): string {
  const prefix = topFolder.match(/^(\d{2})/)?.[1];
  return (prefix && DOMAIN_COLORS[prefix]) ?? '#9aa4b2';
}
function cleanLabel(label: string): string {
  return label.replace(/\.md$/, '').replace(/^\d+\s*[-–]\s*/, '');
}

// ── Graph helpers ──────────────────────────────────────────────────────────

function findRoot(nodes: VaultGraphNode[]): VaultGraphNode | null {
  const dashboard = nodes.find((n) => /dashboard/i.test(n.label) && n.topFolder.startsWith('00'));
  if (dashboard) return dashboard;
  return nodes.find((n) => n.topFolder.startsWith('00')) ?? nodes[0] ?? null;
}

/** All 1-hop neighbours of a node. Does NOT exclude the previous node — the
 *  whole point is you can click it to go back. */
function neighboursOf(hubId: string, links: VaultGraphLink[], nodes: Map<string, VaultGraphNode>): VaultGraphNode[] {
  const seen = new Set<string>();
  const out: VaultGraphNode[] = [];
  for (const l of links) {
    let neighbourId: string | null = null;
    if (l.source === hubId) neighbourId = l.target;
    else if (l.target === hubId) neighbourId = l.source;
    if (!neighbourId || seen.has(neighbourId)) continue;
    seen.add(neighbourId);
    const n = nodes.get(neighbourId);
    if (n) out.push(n);
  }
  return out;
}

function detectBundles(nodes: VaultGraphNode[]): VaultGraphNode[] {
  const bundles: VaultGraphNode[] = [];
  const seen = new Set<string>();
  const OVERVIEW_RE = /^(.+\s[-–]\s)?Overview(\.md)?$/i;
  for (const n of nodes) {
    if (OVERVIEW_RE.test(n.label) && !seen.has(n.folder)) {
      seen.add(n.folder); bundles.push(n);
    }
  }
  return bundles.sort((a, b) => a.topFolder.localeCompare(b.topFolder));
}

// ── Layout ─────────────────────────────────────────────────────────────────

interface PositionedNode {
  node: VaultGraphNode;
  position: THREE.Vector3;
  section: string | null;
  isPrevious: boolean;  // highlight the node you came from
}

/** Is this a hub-ish file (Overview, Hub, Knowledge, Kanban, Log Hub)? */
function isHubLike(n: VaultGraphNode): boolean {
  return /(overview|hub|kanban|knowledge)$/i.test(n.label.replace(/\.md$/, ''));
}

/**
 * Group neighbours into named sections based on what they are. This is what
 * makes the scene informative when you're inside a project.
 */
interface Section { key: string; label: string; color: string; nodes: VaultGraphNode[] }

function sectionize(neighbours: VaultGraphNode[]): Section[] {
  const phases = neighbours.filter((n) => n.isPhase);
  const isPhaseHeavy = phases.length > 0 && phases.length >= neighbours.length * 0.4;

  if (!isPhaseHeavy) {
    // Not a phase-heavy view — one-section, ordered by "importance".
    const sorted = [...neighbours].sort((a, b) => {
      const aHub = isHubLike(a) ? 1 : 0;
      const bHub = isHubLike(b) ? 1 : 0;
      if (aHub !== bHub) return bHub - aHub;
      return b.linkCount - a.linkCount;
    });
    return [{ key: 'all', label: '', color: '#9aa4b2', nodes: sorted }];
  }

  const byKey = new Map<string, VaultGraphNode[]>();
  const push = (k: string, n: VaultGraphNode) => {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(n);
  };
  for (const n of neighbours) {
    if (isHubLike(n)) { push('hubs', n); continue; }
    if (!n.isPhase)   { push('other', n); continue; }
    const s = n.phaseStatus ?? 'backlog';
    push(s, n);
  }

  const defs: Array<{ key: string; label: string; color: string }> = [
    { key: 'active',    label: 'Active',    color: '#00dcb4' },
    { key: 'ready',     label: 'Ready',     color: '#4493f8' },
    { key: 'blocked',   label: 'Blocked',   color: '#dc6e6e' },
    { key: 'planning',  label: 'Planning',  color: '#b478ff' },
    { key: 'backlog',   label: 'Backlog',   color: '#9aa4b2' },
    { key: 'hubs',      label: 'Hubs',      color: '#ffc850' },
    { key: 'other',     label: 'Other',     color: '#9aa4b2' },
    { key: 'completed', label: 'Completed', color: '#5a6070' },
  ];

  const out: Section[] = [];
  for (const d of defs) {
    const nodes = byKey.get(d.key);
    if (nodes && nodes.length > 0) out.push({ ...d, nodes });
  }
  return out;
}

/**
 * Position neighbours in 3D given the section breakdown. Each section gets an
 * angular slot around you; within a section nodes are stacked on a small arc
 * so they don't overlap even when there are many.
 */
function layoutNeighbours(sections: Section[], previousId: string | null): PositionedNode[] {
  const out: PositionedNode[] = [];
  const total = sections.length;
  if (total === 0) return out;

  // Preferred angle centers per section key — puts active front, completed behind
  const preferred: Record<string, number> = {
    active:   0,
    ready:    Math.PI * 0.28,
    blocked:  -Math.PI * 0.28,
    planning: Math.PI * 0.55,
    backlog:  Math.PI * 0.75,
    hubs:     -Math.PI * 0.6,
    other:    -Math.PI * 0.85,
    completed: Math.PI,
    all:      0,
  };

  for (const sec of sections) {
    const count = sec.nodes.length;
    const centerAngle = preferred[sec.key] ?? 0;
    const hasPreference = sec.key in preferred && sec.key !== 'all';

    // Radius grows with the largest section so nothing bunches up
    const maxSectionSize = Math.max(...sections.map((s) => s.nodes.length));
    const radius = Math.max(5, Math.min(12, 4 + maxSectionSize * 0.5));

    if (sec.key === 'all') {
      // Ungrouped — even ring
      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? 0 : (i / count) * Math.PI * 2;
        const x = Math.sin(angle) * radius;
        const z = -Math.cos(angle) * radius;
        const y = ((i * 0.317) % 1 - 0.5) * 0.8;
        out.push({
          node: sec.nodes[i],
          position: new THREE.Vector3(x, y, z),
          section: null,
          isPrevious: sec.nodes[i].id === previousId,
        });
      }
      continue;
    }

    // Section with a preferred center — distribute nodes in a local arc
    const span = count === 1 ? 0 : Math.min(Math.PI * 0.4, count * 0.18);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = centerAngle + (t - 0.5) * span;
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;
      // Slight vertical stacking for larger sections
      const y = sec.key === 'hubs' ? 1.5 : (count > 8 ? (i % 3 - 1) * 0.6 : 0);
      out.push({
        node: sec.nodes[i],
        position: new THREE.Vector3(x, y, z),
        section: sec.label,
        isPrevious: sec.nodes[i].id === previousId,
      });
    }
  }
  return out;
}

/** Label anchors for each section (floating section-name in space). */
function sectionLabelAnchors(sections: Section[]): Array<{ label: string; position: THREE.Vector3; color: string }> {
  if (sections.length === 0 || sections[0].key === 'all') return [];
  const preferred: Record<string, number> = {
    active: 0, ready: Math.PI * 0.28, blocked: -Math.PI * 0.28,
    planning: Math.PI * 0.55, backlog: Math.PI * 0.75,
    hubs: -Math.PI * 0.6, other: -Math.PI * 0.85, completed: Math.PI,
  };
  const maxSectionSize = Math.max(...sections.map((s) => s.nodes.length));
  const radius = Math.max(5, Math.min(12, 4 + maxSectionSize * 0.5)) + 1.4;
  return sections.map((sec) => {
    const angle = preferred[sec.key] ?? 0;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;
    const y = sec.key === 'hubs' ? 2.6 : 1.5;
    return { label: sec.label, position: new THREE.Vector3(x, y, z), color: sec.color };
  });
}

// ── 3D Node ────────────────────────────────────────────────────────────────

/** Classify a node's visual kind — drives shape, size, and what adornments
 *  appear on it in the scene. */
type NodeKind = 'hub' | 'phase' | 'log' | 'knowledge' | 'directive' | 'leaf';
function kindOf(n: VaultGraphNode): NodeKind {
  const stem = n.label.replace(/\.md$/, '');
  if (/overview|(\s|^)hub$|kanban|phase group/i.test(stem)) return 'hub';
  if (n.isPhase) return 'phase';
  if (/log\b/i.test(stem) || n.id.includes('/Logs/')) return 'log';
  if (/knowledge/i.test(stem)) return 'knowledge';
  if (n.directive || n.id.includes('/Directives/')) return 'directive';
  return 'leaf';
}

const KIND_SIZE: Record<NodeKind, number> = {
  hub: 0.85, phase: 0.6, log: 0.4, knowledge: 0.55, directive: 0.5, leaf: 0.45,
};

function WorldNode({
  pn, onTap, currentYawRef,
}: {
  pn: PositionedNode;
  onTap: (node: VaultGraphNode) => void;
  currentYawRef: React.MutableRefObject<number>;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const color = colorForTopFolder(pn.node.topFolder);
  const kind = kindOf(pn.node);
  const isActive = pn.node.phaseStatus === 'active';
  const isReady = pn.node.phaseStatus === 'ready';
  const isBlocked = pn.node.phaseStatus === 'blocked';
  const statusColor = isActive ? '#00dcb4' : isReady ? '#4493f8' : isBlocked ? '#dc6e6e' : null;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.2;
    if (isActive || isReady) {
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.1;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  const radius = KIND_SIZE[kind];
  const angle = Math.atan2(pn.position.x, -pn.position.z);
  const angleDiff = Math.abs(((angle - currentYawRef.current + Math.PI) % (Math.PI * 2)) - Math.PI);
  const inFront = angleDiff < 0.4;

  return (
    <group position={pn.position} scale={hovered ? 1.15 : 1}>
      {/* Hub: bright outer shell to flag "you can enter this" */}
      {kind === 'hub' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.25, radius * 1.45, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Phase: status-colored rim */}
      {statusColor && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.35, radius * 1.52, 32]} />
          <meshBasicMaterial color={statusColor} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Previous-node halo */}
      {pn.isPrevious && (
        <mesh>
          <sphereGeometry args={[radius * 1.9, 24, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.09} />
        </mesh>
      )}
      {/* Glow */}
      <mesh>
        <sphereGeometry args={[radius * 1.5, 20, 14]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 0.25 : (inFront ? 0.16 : 0.08)} />
      </mesh>
      {/* Core */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onTap(pn.node); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.1 : (inFront ? (kind === 'hub' ? 1.0 : 0.8) : 0.4)}
          roughness={0.45}
          metalness={kind === 'hub' ? 0.25 : 0.15}
        />
      </mesh>
      {/* Label — pill background for readability on any backdrop */}
      <Html
        position={[0, -radius - 0.5, 0]}
        center
        distanceFactor={6}
        zIndexRange={[2, 3]}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 9px',
          background: 'rgba(5,7,13,0.78)',
          border: `1px solid ${color}55`,
          borderRadius: 6,
          fontSize: kind === 'hub' ? 14 : 12,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: kind === 'hub' ? 700 : 500,
          color: '#ffffff',
          letterSpacing: '0.01em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor ?? color, boxShadow: statusColor ? `0 0 6px ${statusColor}` : 'none' }}/>
          <span>{cleanLabel(pn.node.label)}</span>
        </div>
      </Html>
    </group>
  );
}

// ── Section label in 3D ────────────────────────────────────────────────────

function SectionLabel({ label, position, color }: { label: string; position: THREE.Vector3; color: string }) {
  return (
    <Html
      position={[position.x, position.y, position.z]}
      center
      distanceFactor={9}
      zIndexRange={[2, 3]}
      style={{ pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <div style={{
        padding: '3px 12px',
        background: `${color}2a`,
        border: `1px solid ${color}66`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        textShadow: '0 2px 8px rgba(0,0,0,0.9)',
      }}>
        {label}
      </div>
    </Html>
  );
}

// ── Floor ──────────────────────────────────────────────────────────────────

function FloorDisc({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]}>
      <ringGeometry args={[0.5, 4, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Camera ─────────────────────────────────────────────────────────────────

function FirstPersonCamera({
  yaw, fov, walkProgress, walkTargetPosition,
}: {
  yaw: number;
  fov: number;
  walkProgress: number;
  walkTargetPosition: THREE.Vector3 | null;
}) {
  const { camera } = useThree();
  useFrame(() => {
    if (walkTargetPosition && walkProgress > 0) {
      camera.position.lerpVectors(new THREE.Vector3(0, 0, 0), walkTargetPosition, walkProgress);
    } else {
      camera.position.set(0, 0, 0);
    }
    const lookX = Math.sin(yaw) * 10;
    const lookZ = -Math.cos(yaw) * 10;
    camera.lookAt(camera.position.x + lookX, camera.position.y, camera.position.z + lookZ);
    // Smoothly lerp FOV toward the target set by wheel/pinch
    if ('fov' in camera) {
      const persp = camera as THREE.PerspectiveCamera;
      persp.fov += (fov - persp.fov) * 0.18;
      persp.updateProjectionMatrix();
    }
  });
  return null;
}

// ── Detail sidebar ─────────────────────────────────────────────────────────

/**
 * Compact floating action bar — appears when a node is "selected" (last clicked).
 * Shows phase metadata chips + actions. Content display is handled by the
 * dashboard's main Drawer via onOpenFile, so we don't duplicate that panel.
 */
function NodeActionBar({
  node, onDismiss, onOpenFile, onAction, onHop, canHop,
}: {
  node: VaultGraphNode;
  onDismiss: () => void;
  onOpenFile: (p: string) => void;
  onAction: (verb: string) => Promise<void>;
  onHop: () => void;
  canHop: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const isPhase = node.isPhase;
  const isActive = node.phaseStatus === 'active';
  const isBlocked = node.phaseStatus === 'blocked';
  const statusColor = isActive ? '#00dcb4' : node.phaseStatus === 'ready' ? '#4493f8' : isBlocked ? '#dc6e6e' : '#9aa4b2';

  const run = async (verb: string) => {
    setBusy(verb);
    try { await onAction(verb); } finally { setBusy(null); }
  };

  return (
    <div data-overlay="true" onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      zIndex: 25,
      maxWidth: 'calc(100vw - 24px)',
      background: 'rgba(13,17,23,0.96)', border: '1px solid rgba(48,54,61,0.95)',
      borderRadius: 10, backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(48,54,61,0.5)' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>
            {cleanLabel(node.label)}
          </div>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" style={{
          padding: '2px 8px', fontSize: 14, fontFamily: 'inherit',
          background: 'transparent', color: 'rgba(139,148,158,0.8)',
          border: 'none', cursor: 'pointer',
        }}>×</button>
      </div>

      {/* Metadata chips for phases */}
      {isPhase && (node.phaseStatus || node.profile || node.directive) && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 12px', flexWrap: 'wrap', fontSize: 10, borderBottom: '1px solid rgba(48,54,61,0.4)' }}>
          {node.phaseStatus && <Chip label="STATUS" value={node.phaseStatus} color={statusColor} />}
          {node.profile && <Chip label="PROFILE" value={node.profile} />}
          {node.directive && <Chip label="DIRECTIVE" value={node.directive} />}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
        <button onClick={() => { onOpenFile(node.id); onDismiss(); }} style={actionBtnStyle('#4493f8')}>Open</button>
        {canHop && (
          <button onClick={onHop} style={actionBtnStyle('#ffc850')}>Hop in →</button>
        )}
        {isPhase && !isActive && (
          <button disabled={!!busy} onClick={() => run('launch')} style={actionBtnStyle('#00dcb4', busy === 'launch')}>
            {busy === 'launch' ? 'Launching…' : 'Launch agent'}
          </button>
        )}
        {isPhase && isActive && (
          <button disabled={!!busy} onClick={() => run('stop')} style={actionBtnStyle('#ff9f0a', busy === 'stop')}>
            {busy === 'stop' ? 'Stopping…' : 'Stop + reset'}
          </button>
        )}
        {isPhase && node.phaseStatus !== 'ready' && !isActive && (
          <button disabled={!!busy} onClick={() => run('ready')} style={actionBtnStyle('#b478ff', busy === 'ready')}>
            {busy === 'ready' ? 'Marking…' : 'Mark ready'}
          </button>
        )}
      </div>
    </div>
  );
}

function LegendRow({ dot, label }: { dot: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '1px 0' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 6px ${dot}88` }}/>
      <span>{label}</span>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = color ?? 'rgba(139,148,158,0.9)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'rgba(139,148,158,0.6)', fontSize: 9, letterSpacing: '0.1em' }}>{label}</span>
      <span style={{
        color: c, fontWeight: 600, textTransform: label === 'STATUS' ? 'uppercase' : 'none',
        background: `${c}1a`, border: `1px solid ${c}44`, padding: '2px 7px', borderRadius: 3,
      }}>{value}</span>
    </div>
  );
}

function actionBtnStyle(color: string, busy = false): React.CSSProperties {
  return {
    padding: '5px 11px', fontSize: 11, fontFamily: 'inherit',
    background: busy ? `${color}22` : `${color}15`, color,
    border: `1px solid ${color}66`, borderRadius: 4,
    cursor: busy ? 'wait' : 'pointer', fontWeight: 500,
    opacity: busy ? 0.7 : 1,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function VaultUniverse({ onOpenFile }: Props) {
  const [nodes, setNodes] = useState<Map<string, VaultGraphNode>>(new Map());
  const [links, setLinks] = useState<VaultGraphLink[]>([]);
  const [bundles, setBundles] = useState<VaultGraphNode[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [previousId, setPreviousId] = useState<string | null>(null);

  const [yaw, setYaw] = useState(0);
  const yawRef = useRef(0);
  useEffect(() => { yawRef.current = yaw; }, [yaw]);

  // FOV = zoom. Lower FOV = zoomed in; higher = zoomed out.
  const [fov, setFov] = useState(70);
  const fovRef = useRef(70);
  useEffect(() => { fovRef.current = fov; }, [fov]);

  // Pinch (two-finger) distance baseline, for touch zoom.
  const pinchRef = useRef<{ startDist: number; startFov: number } | null>(null);

  const [walkProgress, setWalkProgress] = useState(0);
  const walkTargetIdRef = useRef<string | null>(null);
  const walkTargetPosRef = useRef<THREE.Vector3 | null>(null);

  /** The last-tapped node. Its actions are shown in the floating action bar. */
  const [selectedNode, setSelectedNode] = useState<VaultGraphNode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const dragRef = useRef<{ x: number; yaw0: number; moved: boolean } | null>(null);

  // ── Fetch graph ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/onyx/vault-graph').then((r) => r.json()).then(
      (d: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        const map = new Map<string, VaultGraphNode>();
        for (const n of d.nodes) map.set(n.id, n);
        setNodes(map);
        setLinks(d.links);
        setBundles(detectBundles(d.nodes));
        const root = findRoot(d.nodes);
        if (root) setCurrentId(root.id);
        setLoading(false);
      },
    );
  }, []);

  const currentNode = useMemo(() => currentId ? nodes.get(currentId) ?? null : null, [currentId, nodes]);

  const sections = useMemo(() => {
    if (!currentId) return [];
    return sectionize(neighboursOf(currentId, links, nodes));
  }, [currentId, links, nodes]);

  const positioned = useMemo(() => layoutNeighbours(sections, previousId), [sections, previousId]);
  const sectionLabels = useMemo(() => sectionLabelAnchors(sections), [sections]);

  const currentColor = currentNode ? colorForTopFolder(currentNode.topFolder) : '#4493f8';

  // ── Hop between nodes ───────────────────────────────────────────────
  const hopTo = useCallback((id: string) => {
    const pn = positioned.find((p) => p.node.id === id);
    if (!pn) return;
    walkTargetIdRef.current = id;
    walkTargetPosRef.current = pn.position.clone();
    setWalkProgress(0.001);
  }, [positioned]);

  // Advance animation → commit hop
  useEffect(() => {
    if (walkProgress === 0 || walkProgress >= 1) return;
    const raf = requestAnimationFrame(() => {
      const next = Math.min(1, walkProgress + 0.05);
      if (next >= 1) {
        const id = walkTargetIdRef.current;
        walkTargetIdRef.current = null;
        walkTargetPosRef.current = null;
        setWalkProgress(0);
        if (!id) return;
        setPreviousId(currentId);
        setHistory((h) => (h[h.length - 1] === currentId ? h : (currentId ? [...h, currentId] : h)));
        setCurrentId(id);
        setYaw(0);
      } else {
        setWalkProgress(next);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [walkProgress, currentId]);

  /**
   * Auto-routing tap: hub-like nodes hop the camera; everything else
   * (phases, docs, logs — atoms) opens the dashboard's main drawer AND
   * surfaces the floating action bar when it's a phase.
   */
  const handleTap = useCallback((node: VaultGraphNode) => {
    if (isHubLike(node)) {
      hopTo(node.id);
      setSelectedNode(null);
      return;
    }
    onOpenFile(node.id);
    if (node.isPhase) setSelectedNode(node);
    else setSelectedNode(null);
  }, [hopTo, onOpenFile]);

  const jumpToBundle = useCallback((id: string) => {
    if (id === currentId) return;
    setPreviousId(currentId);
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setYaw(0);
    setSelectedNode(null);
  }, [currentId]);

  const jumpToHistory = useCallback((index: number) => {
    setHistory((h) => {
      const target = h[index];
      if (target) {
        setPreviousId(currentId);
        setCurrentId(target);
        setYaw(0);
        setSelectedNode(null);
        return h.slice(0, index);
      }
      return h;
    });
  }, [currentId]);

  const goBack = useCallback(() => {
    if (selectedNode) { setSelectedNode(null); return; }
    if (history.length > 0) {
      const last = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setPreviousId(currentId);
      setCurrentId(last);
      setYaw(0);
    }
  }, [selectedNode, history, currentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack]);

  // ── Pointer drag to spin ────────────────────────────────────────────
  // Capture is deferred until the pointer actually moves past the drag
  // threshold — otherwise setPointerCapture swallows the node click.
  const captureIdRef = useRef<number | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-overlay="true"]')) return;
    dragRef.current = { x: e.clientX, yaw0: yawRef.current, moved: false };
    captureIdRef.current = e.pointerId;
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    if (!dragRef.current.moved && Math.abs(dx) > 4) {
      dragRef.current.moved = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (dragRef.current.moved) setYaw(dragRef.current.yaw0 + dx * 0.005);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (captureIdRef.current !== null) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(captureIdRef.current); } catch { /* noop */ }
      captureIdRef.current = null;
    }
    dragRef.current = null;
  }, []);

  // Wheel zoom — adjust FOV. Clamp to a usable band.
  const onWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-overlay="true"]')) return;
    // deltaY positive = zoom out (wider FOV), negative = zoom in (narrower FOV).
    const next = Math.max(30, Math.min(110, fovRef.current + e.deltaY * 0.04));
    setFov(next);
  }, []);

  // Pinch zoom on touch — delta between two-finger distance controls FOV.
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.touches)) {
      activeTouchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { startDist: d, startFov: fovRef.current };
      dragRef.current = null; // cancel any spin in progress
    }
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const scale = d / pinchRef.current.startDist;
      const next = Math.max(30, Math.min(110, pinchRef.current.startFov / scale));
      setFov(next);
    }
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    for (const t of Array.from(e.changedTouches)) activeTouchesRef.current.delete(t.identifier);
  }, []);

  // ── Phase actions ────────────────────────────────────────────────────
  const runPhaseAction = useCallback(async (verb: string) => {
    if (!selectedNode) return;
    const projectId = selectedNode.projectId;
    try {
      if (verb === 'launch') {
        if (!projectId) throw new Error('No project id on phase');
        const res = await fetch('/api/onyx/cli', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'run', args: ['--project', projectId] }),
        });
        if (!res.ok) throw new Error(`CLI run failed (${res.status})`);
        setToast(`🚀 onyx run --project ${projectId}`);
      } else if (verb === 'stop' || verb === 'ready') {
        if (!projectId) throw new Error('No project id');
        const res = await fetch(`/api/onyx/projects/${encodeURIComponent(projectId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phasePath: selectedNode.id, status: 'ready' }),
        });
        if (!res.ok) throw new Error(`Status change failed (${res.status})`);
        setToast(verb === 'stop' ? 'Reset to ready' : 'Marked ready');
      }
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setToast(null), 3500);
  }, [selectedNode]);

  // ── History crumbs ───────────────────────────────────────────────────
  const crumbs = useMemo(() => {
    return history.map((id) => nodes.get(id)).filter((n): n is VaultGraphNode => !!n);
  }, [history, nodes]);

  return (
    <div
      style={{
        width: '100%', height: '100%', position: 'relative',
        background: '#05070d', overflow: 'hidden',
        cursor: dragRef.current ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Canvas camera={{ position: [0, 0, 0], fov: 70, near: 0.1, far: 200 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[0, 4, 0]} intensity={1.2} />
          <pointLight position={[0, -4, 0]} intensity={0.4} color="#4493f8" />
          <Stars radius={80} depth={40} count={800} factor={3} fade speed={0.3} />

          <FirstPersonCamera
            yaw={yaw}
            fov={fov}
            walkProgress={walkProgress}
            walkTargetPosition={walkTargetPosRef.current}
          />
          <FloorDisc color={currentColor} />

          {sectionLabels.map((s) => (
            <SectionLabel key={s.label} label={s.label} position={s.position} color={s.color} />
          ))}

          {positioned.map((p) => (
            <WorldNode
              key={p.node.id}
              pn={p}
              onTap={handleTap}
              currentYawRef={yawRef}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}

      <div data-overlay="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 12,
        background: 'linear-gradient(rgba(5,7,13,0.92), rgba(5,7,13,0.55))',
        padding: '10px 12px 12px',
        pointerEvents: 'none',
      }}>
        {/* Current location */}
        {currentNode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentColor, boxShadow: `0 0 12px ${currentColor}` }}/>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cleanLabel(currentNode.label)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(139,148,158,0.6)', pointerEvents: 'auto' }}>
              {positioned.length} connected
            </div>
          </div>
        )}

        {/* History trail (clickable) */}
        {crumbs.length > 0 && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 10, color: 'rgba(150,160,180,0.7)', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ opacity: 0.5 }}>history:</span>
            {crumbs.map((n, i) => (
              <button
                key={`${n.id}-${i}`}
                onClick={(e) => { e.stopPropagation(); jumpToHistory(i); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: 'auto',
                  background: 'transparent', border: 'none', padding: 0,
                  color: 'rgba(150,160,180,0.8)', fontFamily: 'inherit',
                  fontSize: 10, cursor: 'pointer',
                }}
              >
                {cleanLabel(n.label)}
                {i < crumbs.length - 1 && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
              </button>
            ))}
          </div>
        )}

        {/* Project quick-jump */}
        {bundles.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {bundles.map((b) => {
              const active = currentId === b.id;
              const color = colorForTopFolder(b.topFolder);
              return (
                <button
                  key={b.id}
                  onClick={(e) => { e.stopPropagation(); jumpToBundle(b.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    pointerEvents: 'auto',
                    padding: '3px 10px', fontSize: 10, fontFamily: 'inherit',
                    background: active ? `${color}2a` : 'rgba(22,27,34,0.9)',
                    color: active ? color : 'rgba(200,210,230,0.85)',
                    border: `1px solid ${active ? color + '88' : 'rgba(48,54,61,0.9)'}`,
                    borderRadius: 999, cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    fontWeight: active ? 600 : 400,
                  }}
                >{cleanLabel(b.label)}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Back button */}
      {(history.length > 0 || selectedNode) && (
        <button
          onClick={(e) => { e.stopPropagation(); goBack(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 40, right: 12, zIndex: 15,
            padding: '6px 14px', fontSize: 11, fontFamily: 'inherit',
            background: 'rgba(22,27,34,0.92)', color: 'rgba(200,210,230,0.95)',
            border: '1px solid rgba(48,54,61,0.95)', borderRadius: 999, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>← Back</button>
      )}

      {/* Zoom control + legend toggle (top-right of the canvas) */}
      <div data-overlay="true" style={{
        position: 'absolute', top: 12, right: 12, zIndex: 18,
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setFov(70)}
          title="Reset zoom"
          style={{
            padding: '4px 10px', fontSize: 10, fontFamily: 'monospace',
            background: 'rgba(22,27,34,0.9)', color: 'rgba(200,210,230,0.9)',
            border: '1px solid rgba(48,54,61,0.95)', borderRadius: 5, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >
          {Math.round((70 / fov) * 100)}%
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowLegend((v) => !v)}
          title="What do the shapes and colours mean?"
          style={{
            padding: '4px 10px', fontSize: 11, fontFamily: 'inherit',
            background: showLegend ? 'rgba(68,147,248,0.15)' : 'rgba(22,27,34,0.9)',
            color: showLegend ? '#4493f8' : 'rgba(200,210,230,0.9)',
            border: `1px solid ${showLegend ? '#4493f8' : 'rgba(48,54,61,0.95)'}`,
            borderRadius: 5, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >?</button>
      </div>

      {/* Legend */}
      {showLegend && (
        <div data-overlay="true" onPointerDown={(e) => e.stopPropagation()} style={{
          position: 'absolute', top: 52, right: 12, zIndex: 18,
          width: 220, padding: 12, fontSize: 11,
          background: 'rgba(13,17,23,0.96)',
          border: '1px solid rgba(48,54,61,0.95)',
          borderRadius: 8, backdropFilter: 'blur(8px)',
          color: 'rgba(200,210,230,0.9)', lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(139,148,158,0.7)', marginBottom: 8 }}>Legend</div>
          <LegendRow dot="#ffc850" label="Hub — tap to hop" />
          <LegendRow dot="#00dcb4" label="Phase: active" />
          <LegendRow dot="#4493f8" label="Phase: ready" />
          <LegendRow dot="#dc6e6e" label="Phase: blocked" />
          <LegendRow dot="#b478ff" label="Planning" />
          <LegendRow dot="#9aa4b2" label="Backlog / leaf" />
          <LegendRow dot="#5a6070" label="Completed" />
          <div style={{ height: 1, background: 'rgba(48,54,61,0.6)', margin: '8px 0' }} />
          <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(139,148,158,0.7)', marginBottom: 6 }}>Domains</div>
          <LegendRow dot="#4493f8" label="Dashboard" />
          <LegendRow dot="#ff9f0a" label="Ventures" />
          <LegendRow dot="#00dcb4" label="Finance" />
          <LegendRow dot="#b478ff" label="Systems" />
          <LegendRow dot="#dc6e6e" label="ONYX system" />
          <LegendRow dot="#ffc850" label="OpenClaw" />
        </div>
      )}

      {/* Help */}
      <div data-overlay="true" style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        fontSize: 10, color: 'rgba(139,148,158,0.5)', pointerEvents: 'none',
      }}>
        Drag to spin · scroll / pinch to zoom · tap a hub to hop · tap a leaf to open · Esc to go back
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 14px', fontSize: 11, zIndex: 50,
          background: 'rgba(22,27,34,0.95)', color: '#e6edf3',
          border: '1px solid rgba(68,147,248,0.5)', borderRadius: 20,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
        }}>{toast}</div>
      )}

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(139,148,158,0.7)', fontSize: 12, pointerEvents: 'none' }}>
          Parsing vault…
        </div>
      )}

      {selectedNode && (
        <NodeActionBar
          node={selectedNode}
          onDismiss={() => setSelectedNode(null)}
          onOpenFile={onOpenFile}
          onAction={runPhaseAction}
          onHop={() => {
            const id = selectedNode.id;
            setSelectedNode(null);
            hopTo(id);
          }}
          canHop={neighboursOf(selectedNode.id, links, nodes).length > 0 && selectedNode.id !== currentId}
        />
      )}
    </div>
  );
}
