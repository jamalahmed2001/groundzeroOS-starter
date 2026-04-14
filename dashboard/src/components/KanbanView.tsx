'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Cpu, GitBranch, BookOpen, Pencil, Square as StopIcon, Lock, LayoutGrid, Columns, Upload } from 'lucide-react';
import type { GZProject, GZPhase, PhaseStatus } from '@/lib/types';
import { statusColor as sc } from '@/lib/colors';
import PhaseStudio from './PhaseStudio';
import { toast } from './Toast';

interface Props {
  projects: GZProject[];
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
  onOpenProject: (project: GZProject) => void;
  onOpenProjectDiff?: (project: GZProject) => void;
  onRunCLI: (cmd: string, args?: string[]) => void;
}

const COLUMNS: { id: PhaseStatus; label: string }[] = [
  { id: 'backlog',   label: 'Backlog'  },
  { id: 'planning',  label: 'Atomising' },
  { id: 'ready',     label: 'Ready'    },
  { id: 'active',    label: 'Active'   },
  { id: 'blocked',   label: 'Blocked'  },
  { id: 'completed', label: 'Done'     },
];

interface PhaseWithProject extends GZPhase { projectId: string; projectRef: GZProject }

function StatusMenu({ phase, anchor, onSelect, onClose }: {
  phase: PhaseWithProject;
  anchor: { x: number; y: number };
  onSelect: (s: PhaseStatus) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (rect.right > vw - 8)  el.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh - 8) el.style.top  = `${anchor.y - rect.height - 4}px`;
  }, [anchor]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 998 }}/>
      <div ref={menuRef} style={{
        position: 'fixed', left: anchor.x, top: anchor.y + 4,
        background: 'rgba(10,14,22,0.97)', backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--glass-b-hi)',
        borderRadius: 'var(--r-md)', zIndex: 999, overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,0.65)', minWidth: 134,
      }}>
        {COLUMNS.map(({ id, label }) => (
          <div key={id} onClick={() => { onSelect(id); onClose(); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
            fontSize: 12, cursor: 'pointer',
            color: id === phase.status ? sc(id) : 'var(--text-dim)',
            fontWeight: id === phase.status ? 600 : 400,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hi)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc(id), flexShrink: 0 }}/>
            {label}
            {id === phase.status && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function PhaseCard({ phase, onOpen, onOpenStudio, onStatusAnchor, onOpenProject, onDiff, onPlanPhase, onExecute, onKill }: {
  phase: PhaseWithProject;
  onOpen: (p: string) => void;
  onOpenStudio: (ph: PhaseWithProject) => void;
  onStatusAnchor: (ph: PhaseWithProject, anchor: { x: number; y: number }) => void;
  onOpenProject: (p: GZProject) => void;
  onDiff?: (p: GZProject) => void;
  onPlanPhase?: () => void;  // backlog → plan tasks → ready
  onExecute?: () => void;    // ready → run agent → completed/blocked
  onKill?: () => void;
}) {
  const pct = phase.tasksTotal > 0 ? Math.round((phase.tasksDone / phase.tasksTotal) * 100) : 0;
  const isDone = phase.status === 'completed';
  const isActive = phase.status === 'active';
  const isBlocked = phase.status === 'blocked';

  return (
    <div style={{
      borderRadius: 'var(--r-md)',
      border: `1px solid ${isActive ? 'rgba(77,156,248,0.4)' : isBlocked ? 'rgba(245,82,74,0.35)' : 'var(--glass-b)'}`,
      background: isActive ? 'rgba(77,156,248,0.04)' : isBlocked ? 'rgba(245,82,74,0.03)' : 'var(--glass)',
      padding: '7px 9px', marginBottom: 3,
      display: 'flex', flexDirection: 'column', gap: 5,
      transition: 'border-color 0.15s, background 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isActive ? 'rgba(77,156,248,0.6)' : isBlocked ? 'rgba(245,82,74,0.55)' : 'var(--glass-b-hi)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isActive ? 'rgba(77,156,248,0.4)' : isBlocked ? 'rgba(245,82,74,0.35)' : 'var(--glass-b)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button onClick={() => onOpenProject(phase.projectRef)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1 }}>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.04em' }}>{phase.projectId}</span>
        </button>
        {phase.phaseType && phase.phaseType !== 'slice' && (
          <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 500, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--text-faint)44', color: 'var(--text-faint)', letterSpacing: '0.03em', flexShrink: 0 }}>
            {phase.phaseType}
          </span>
        )}
        {phase.lockedBy && (
          <span title={`Locked by: ${phase.lockedBy}`} style={{ display: 'flex', alignItems: 'center' }}>
            <Lock size={8} style={{ color: 'var(--blocked)', opacity: 0.7 }}/>
          </span>
        )}
      </div>

      <div onClick={() => onOpenStudio(phase)} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-str)', cursor: 'pointer', lineHeight: 1.35 }}>
        P{phase.phaseNum} — {phase.phaseName}
      </div>

      {phase.lockedBy && (
        <div style={{ fontSize: 9, color: 'var(--blocked)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>🔒 {phase.lockedBy}</div>
      )}
      {!phase.lockedBy && phase.tasksTotal === 0 && phase.status !== 'completed' && (
        <div style={{ fontSize: 9, color: 'var(--planning)', opacity: 0.75 }}>no tasks — needs atomising</div>
      )}
      {!phase.lockedBy && phase.tasksTotal > 0 && phase.nextTask && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {phase.nextTask}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {phase.tasksTotal > 0 && (
          <>
            <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: sc(phase.status), transition: 'width 0.3s' }}/>
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{phase.tasksDone}/{phase.tasksTotal}</span>
          </>
        )}

        {/* Atomise — backlog phases or any phase with no tasks: generate concrete tasks */}
        {(phase.status === 'backlog' || phase.tasksTotal === 0) && phase.status !== 'completed' && phase.status !== 'active' && onPlanPhase && (
          <button onClick={e => { e.stopPropagation(); onPlanPhase(); }}
            style={{ border: '1px solid rgba(161,121,247,0.3)', background: 'rgba(161,121,247,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--planning)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Plan Phase: generate concrete tasks for this phase → mark ready"
          >
            <Pencil size={9}/> Plan Phase
          </button>
        )}

        {/* Planning in progress — allow re-trigger */}
        {phase.status === 'planning' && onPlanPhase && (
          <button onClick={e => { e.stopPropagation(); onPlanPhase(); }}
            style={{ border: '1px solid rgba(161,121,247,0.3)', background: 'rgba(161,121,247,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--planning)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Re-run planner for this phase"
          >
            <Pencil size={9}/> Plan Phase
          </button>
        )}

        {/* Execute button — ready phases: run agent against repo */}
        {phase.status === 'ready' && onExecute && (
          <button onClick={e => { e.stopPropagation(); onExecute(); }}
            style={{ border: '1px solid rgba(77,156,248,0.3)', background: 'rgba(77,156,248,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--ready)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Run agent for this phase"
          >
            <Cpu size={9}/> Run
          </button>
        )}

        {/* Unblock button — blocked phases only */}
        {isBlocked && (
          <button onClick={e => { e.stopPropagation(); onStatusAnchor(phase, { x: (e.currentTarget as HTMLElement).getBoundingClientRect().left, y: (e.currentTarget as HTMLElement).getBoundingClientRect().bottom }); }}
            style={{ border: '1px solid rgba(245,82,74,0.3)', background: 'rgba(245,82,74,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--blocked)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Change status to unblock"
          >
            <Lock size={8}/> unblock
          </button>
        )}

        {/* Kill button — only on active phases */}
        {isActive && onKill && (
          <button onClick={e => { e.stopPropagation(); onKill(); }}
            style={{ border: '1px solid rgba(245,82,74,0.3)', background: 'rgba(245,82,74,0.06)', borderRadius: 4, cursor: 'pointer', color: 'var(--blocked)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Stop agent & reset to ready"
          >
            <StopIcon size={9}/> Stop
          </button>
        )}

        {/* Diff button — only on completed phases with a repo */}
        {isDone && onDiff && phase.projectRef.repoPath && (
          <button onClick={e => { e.stopPropagation(); onDiff(phase.projectRef); }}
            style={{ border: '1px solid rgba(61,224,114,0.2)', background: 'rgba(61,224,114,0.05)', borderRadius: 4, cursor: 'pointer', color: 'var(--done)', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', fontSize: 9 }}
            title="Review git changes"
          >
            <GitBranch size={9}/> diff
          </button>
        )}

        {/* Open in vault icon */}
        <button onClick={e => { e.stopPropagation(); onOpen(phase.path); }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', padding: '1px 3px' }}
          title="Open in vault"
        >
          <BookOpen size={9}/>
        </button>

        <button onClick={e => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onStatusAnchor(phase, { x: r.left, y: r.bottom });
        }} style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 20, border: `1px solid ${sc(phase.status)}44`, background: sc(phase.status) + '15', color: sc(phase.status), cursor: 'pointer', flexShrink: 0 }}>
          {phase.status}
        </button>
      </div>
    </div>
  );
}

function NoPhaseCard({ project, onOpen, onAtomise }: { project: GZProject; onOpen: () => void; onAtomise: () => void }) {
  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px dashed var(--glass-b)', background: 'var(--glass)', padding: '9px 10px', marginBottom: 5 }}>
      <button onClick={onOpen} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
        {project.id}
      </button>
      <button onClick={onAtomise} style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid rgba(77,156,248,0.25)', background: 'rgba(77,156,248,0.06)', borderRadius: 'var(--r-sm)', padding: '2px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
        <Cpu size={9}/> Plan Project
      </button>
    </div>
  );
}

type ViewMode = 'phases' | 'projects';

function DriverBadge({ driver }: { driver?: string }) {
  if (!driver) return null;
  const label = driver === 'claude-code' ? 'claude' : driver;
  const color = driver === 'claude-code' ? 'var(--accent)' : 'var(--planning)';
  return (
    <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 600, padding: '1px 5px', borderRadius: 3, border: `1px solid ${color}44`, color, letterSpacing: '0.03em', textTransform: 'lowercase', flexShrink: 0 }}>
      {label}
    </span>
  );
}

function ProjectCard({ project, onOpen, onPlan, onExtend, onRunNext, onSync }: {
  project: GZProject;
  onOpen: () => void;
  onPlan: () => void;
  onExtend: () => void;
  onRunNext: () => void;
  onSync?: () => void;
}) {
  const totalPhases = project.phases.length;
  const done = project.phases.filter(p => p.status === 'completed').length;
  const active = project.phases.filter(p => p.status === 'active').length;
  const blocked = project.phases.filter(p => p.status === 'blocked').length;
  const ready = project.phases.filter(p => p.status === 'ready').length;
  const backlog = project.phases.filter(p => p.status === 'backlog' || p.status === 'planning').length;
  const allDone = totalPhases > 0 && done === totalPhases;
  const hasWork = active > 0 || ready > 0 || backlog > 0;
  const pct = totalPhases > 0 ? Math.round((done / totalPhases) * 100) : 0;

  return (
    <div style={{
      borderRadius: 'var(--r-md)',
      border: `1px solid ${active > 0 ? 'rgba(77,156,248,0.25)' : blocked > 0 ? 'rgba(245,82,74,0.2)' : 'var(--glass-b)'}`,
      background: active > 0 ? 'rgba(77,156,248,0.03)' : 'var(--glass)',
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--glass-b-hi)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active > 0 ? 'rgba(77,156,248,0.25)' : blocked > 0 ? 'rgba(245,82,74,0.2)' : 'var(--glass-b)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <button onClick={onOpen} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', lineHeight: 1.3 }}>{project.id}</div>
        </button>
        <DriverBadge driver={project.agentDriver}/>
      </div>

      {totalPhases > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-dim)' }}>
            {done > 0 && <span style={{ color: 'var(--done)' }}>{done} done</span>}
            {active > 0 && <span style={{ color: 'var(--active)' }}>{active} active</span>}
            {ready > 0 && <span style={{ color: 'var(--ready)' }}>{ready} ready</span>}
            {blocked > 0 && <span style={{ color: 'var(--blocked)' }}>{blocked} blocked</span>}
            {backlog > 0 && <span style={{ color: 'var(--text-faint)' }}>{backlog} backlog</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: pct === 100 ? 'var(--done)' : 'var(--accent)', transition: 'width 0.3s' }}/>
            </div>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-faint)' }}>{done}/{totalPhases}</span>
          </div>
        </>
      )}

      {totalPhases === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>No phases — decompose from Overview</div>
      )}
      {allDone && (
        <div style={{ fontSize: 10, color: 'var(--done)' }}>All phases complete</div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* Decompose — no phases yet: break Overview into phase stubs */}
        {totalPhases === 0 && (
          <button onClick={e => { e.stopPropagation(); onPlan(); }}
            style={{ border: '1px solid rgba(161,121,247,0.3)', background: 'rgba(161,121,247,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--planning)', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
            title="Plan Project: break Overview into phases, then generate tasks for each"
          >
            <Pencil size={10}/> Plan Project
          </button>
        )}
        {/* Atomise — has backlog phases: generate concrete tasks for each */}
        {backlog > 0 && (
          <button onClick={e => { e.stopPropagation(); onPlan(); }}
            style={{ border: '1px solid rgba(161,121,247,0.3)', background: 'rgba(161,121,247,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--planning)', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
            title={`Plan Phase: generate tasks for ${backlog} backlog phase(s) → ready`}
          >
            <Pencil size={10}/> Plan Phase {backlog}
          </button>
        )}
        {/* Extend — always available on projects with phases: decompose new phases from updated Overview */}
        {totalPhases > 0 && (
          <button onClick={e => { e.stopPropagation(); onExtend(); }}
            style={{ border: '1px solid rgba(77,156,248,0.3)', background: 'rgba(77,156,248,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
            title="Add Phases: decompose new phases from updated Overview — next iteration, improvements, prod hardening"
          >
            <GitBranch size={10}/> Add Phases
          </button>
        )}
        {/* Run next — has ready phases */}
        {ready > 0 && (
          <button onClick={e => { e.stopPropagation(); onRunNext(); }}
            style={{ border: '1px solid rgba(46,200,102,0.3)', background: 'rgba(46,200,102,0.08)', borderRadius: 4, cursor: 'pointer', color: 'var(--ready)', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
            title="Run next ready phase"
          >
            <Cpu size={10}/> Run
          </button>
        )}
        {/* Linear sync — only for projects imported from Linear */}
        {onSync && project.linearProjectId && (
          <button onClick={e => { e.stopPropagation(); onSync(); }}
            style={{ border: '1px solid rgba(130,80,223,0.3)', background: 'rgba(130,80,223,0.06)', borderRadius: 4, cursor: 'pointer', color: '#8250df', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'inherit' }}
            title="Sync phase statuses back to Linear"
          >
            <Upload size={10}/> Sync
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanView({ projects, onOpenFile, onRefresh, onOpenProject, onOpenProjectDiff, onRunCLI }: Props) {
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<ViewMode>('phases');
  const [menu, setMenu] = useState<{ phase: PhaseWithProject; anchor: { x: number; y: number } } | null>(null);
  const [studioPhase, setStudioPhase] = useState<PhaseWithProject | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<PhaseStatus>>(() => new Set(['completed']));
  const [focusedPhaseIdx, setFocusedPhaseIdx] = useState<number | null>(null);
  const orderedPhasesRef = useRef<PhaseWithProject[]>([]);

  const allPhases: PhaseWithProject[] = projects.flatMap(p =>
    p.phases.map(ph => ({ ...ph, projectId: p.id, projectRef: p }))
  );
  const noPhaseProjects = projects.filter(p => p.phases.length === 0);

  const filtered = filter
    ? allPhases.filter(ph => ph.projectId.toLowerCase().includes(filter.toLowerCase()) || ph.phaseName.toLowerCase().includes(filter.toLowerCase()))
    : allPhases;

  const byStatus = (s: PhaseStatus) => filtered.filter(ph => ph.status === s);

  const handleStatusChange = useCallback(async (phase: PhaseWithProject, newStatus: PhaseStatus) => {
    try {
      const res = await fetch(`/api/onyx/projects/${encodeURIComponent(phase.projectId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: newStatus }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!d.ok) { toast(d.error ?? 'Status update failed', 'error'); return; }
      toast(`Moved to ${newStatus}`, 'success');
      onRefresh();
    } catch {
      toast('Status update failed — check connection', 'error');
    }
  }, [onRefresh]);

  const handleKill = useCallback(async (phase: PhaseWithProject) => {
    if (!confirm(`Kill agent and reset "${phase.phaseName}" to ready?`)) return;
    try {
      await fetch(`/api/onyx/projects/${encodeURIComponent(phase.projectId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: 'ready' }),
      });
      toast(`${phase.phaseName} reset to ready`, 'info');
      onRunCLI('heal');
    } catch {
      toast('Kill failed — try editing vault directly', 'error');
    }
  }, [onRunCLI]);

  const handleAtomise = useCallback((projectId: string) => {
    toast(`Planning ${projectId}…`, 'info');
    onRunCLI('plan', [projectId]);
  }, [onRunCLI]);

  const handleExtend = useCallback((projectId: string) => {
    toast(`Adding phases to ${projectId} from Overview…`, 'info');
    onRunCLI('plan', [projectId, '--extend']);
  }, [onRunCLI]);

  const handleSync = useCallback((projectId: string) => {
    toast(`Syncing ${projectId} to Linear…`, 'info');
    onRunCLI('linear-uplink', [projectId]);
  }, [onRunCLI]);

  const handlePlanPhase = useCallback((phase: PhaseWithProject) => {
    toast(`Planning P${phase.phaseNum} — ${phase.phaseName}…`, 'info');
    onRunCLI('plan', [phase.projectId, String(phase.phaseNum)]);
  }, [onRunCLI]);

  const handleExecutePhase = useCallback((phase: PhaseWithProject) => {
    toast(`Running P${phase.phaseNum} — ${phase.phaseName}…`, 'info');
    onRunCLI('run', [phase.projectId, '--phase', String(phase.phaseNum)]);
  }, [onRunCLI]);

  const filteredProjects = filter
    ? projects.filter(p => p.id.toLowerCase().includes(filter.toLowerCase()))
    : projects;

  // Keep ref current for keyboard handler
  orderedPhasesRef.current = COLUMNS.flatMap(col => filtered.filter(ph => ph.status === col.id));

  // Keyboard navigation (phases view only; runs in capture to beat Shell.tsx)
  useEffect(() => {
    if (view !== 'phases') return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (studioPhase || menu) return; // let overlays handle escape
      const phases = orderedPhasesRef.current;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        setFocusedPhaseIdx(i => i === null ? 0 : Math.min(i + 1, phases.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        setFocusedPhaseIdx(i => i === null ? 0 : Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        setFocusedPhaseIdx(i => {
          if (i !== null && phases[i]) { setStudioPhase(phases[i]); }
          return i;
        });
      } else if (e.key === 'Escape') {
        setFocusedPhaseIdx(null);
      } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        setFocusedPhaseIdx(i => {
          if (i !== null && phases[i]?.status === 'ready') { handleExecutePhase(phases[i]); }
          return i;
        });
        if (focusedPhaseIdx !== null) { e.stopPropagation(); }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [view, studioPhase, menu, focusedPhaseIdx, handleExecutePhase]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-b)', overflow: 'hidden' }}>
          {([
            { id: 'projects' as ViewMode, icon: LayoutGrid, label: 'Projects' },
            { id: 'phases' as ViewMode, icon: Columns, label: 'Phases' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setView(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', border: 'none', fontWeight: view === id ? 600 : 400, color: view === id ? 'var(--text-str)' : 'var(--text-dim)', background: view === id ? 'var(--glass-hi)' : 'transparent' }}>
              <Icon size={11}/> {label}
            </button>
          ))}
        </div>

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={view === 'projects' ? 'Filter projects…' : 'Filter phases…'}
          style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', width: 200, fontFamily: 'inherit' }}/>

        {view === 'phases' && (
          <div style={{ display: 'flex', gap: 10 }}>
            {COLUMNS.map(({ id }) => {
              const count = byStatus(id).length;
              return count > 0 ? <span key={id} style={{ fontSize: 10, color: sc(id), fontFamily: 'monospace' }}>{count}</span> : null;
            })}
          </div>
        )}
        {view === 'projects' && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{filteredProjects.length} projects</span>
        )}
        <div style={{ flex: 1 }}/>
      </div>

      {/* Projects view */}
      {view === 'projects' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {filteredProjects.map(p => (
              <ProjectCard key={p.id} project={p}
                onOpen={() => onOpenProject(p)}
                onPlan={() => handleAtomise(p.id)}
                onExtend={() => handleExtend(p.id)}
                onRunNext={() => { onRunCLI('run', ['--project', p.id, '--once']); toast(`Running next ready phase for ${p.id}`, 'info'); }}
                onSync={() => handleSync(p.id)}
              />
            ))}
            {filteredProjects.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                {filter ? 'No projects match filter' : 'No projects in vault'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phases kanban */}
      {view === 'phases' && (
        <div className="onyx-kanban-board" style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', gap: 8 }}>
          {COLUMNS.map(({ id, label }) => {
            const phases = byStatus(id);
            const showNoPhase = id === 'backlog' && filter === '';
            const isCollapsed = collapsedCols.has(id);
            const totalCount = phases.length + (showNoPhase ? noPhaseProjects.length : 0);
            const colWidth = isCollapsed ? 44 : 214;
            return (
              <div key={id} className="onyx-kanban-col" style={{ width: colWidth, minWidth: colWidth, flexShrink: 0, transition: 'width 0.15s' }}>
                <button
                  onClick={() => setCollapsedCols(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                  title={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}
                >
                  {isCollapsed ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc(id) }}/>
                      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.04em' }}>{totalCount}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc(id), flexShrink: 0 }}/>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 'auto' }}>{totalCount}</span>
                    </>
                  )}
                </button>

                {!isCollapsed && showNoPhase && noPhaseProjects.map(p => (
                  <NoPhaseCard key={p.id} project={p} onOpen={() => onOpenProject(p)} onAtomise={() => handleAtomise(p.id)}/>
                ))}

                {!isCollapsed && phases.map(ph => {
                  const globalIdx = orderedPhasesRef.current.indexOf(ph);
                  const isFocused = globalIdx !== -1 && focusedPhaseIdx === globalIdx;
                  return (
                    <div key={ph.path} style={isFocused ? { outline: '2px solid rgba(77,156,248,0.6)', borderRadius: 'var(--r-md)' } : {}}>
                      <PhaseCard phase={ph} onOpen={onOpenFile}
                        onOpenStudio={setStudioPhase}
                        onStatusAnchor={(ph, anchor) => setMenu({ phase: ph, anchor })}
                        onOpenProject={onOpenProject}
                        onDiff={onOpenProjectDiff}
                        onPlanPhase={() => handlePlanPhase(ph)}
                        onExecute={() => handleExecutePhase(ph)}
                        onKill={() => void handleKill(ph)}/>
                    </div>
                  );
                })}

                {!isCollapsed && phases.length === 0 && !showNoPhase && (
                  <div style={{ border: '1px dashed var(--glass-b)', borderRadius: 'var(--r-md)', padding: '10px', fontSize: 10, color: 'var(--text-faint)', textAlign: 'center' }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {menu && (
        <StatusMenu phase={menu.phase} anchor={menu.anchor}
          onSelect={s => handleStatusChange(menu.phase, s)}
          onClose={() => setMenu(null)}/>
      )}

      {studioPhase && (
        <PhaseStudio phase={studioPhase} onClose={() => setStudioPhase(null)} onRunCLI={onRunCLI}
          onDiff={onOpenProjectDiff ? () => onOpenProjectDiff(studioPhase.projectRef) : undefined}/>
      )}
    </div>
  );
}
