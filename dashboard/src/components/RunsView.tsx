'use client';

import { useState } from 'react';
import { GitBranch, X, FileText, ExternalLink } from 'lucide-react';
import type { RunEntry } from '@/lib/types';
import { statusColor } from '@/lib/colors';
import GitDiffPanel from './GitDiffPanel';

interface Props {
  runs: RunEntry[];
  onOpenFile: (path: string) => void;
}

// Derive phase file path from log file path
// e.g. "Fanvue (Main)/Logs/L3 - Phase 3 - Impl.md" → "Fanvue (Main)/Phases/Phase 3 - Impl.md"
function derivePhasePathFromLog(logPath: string): string | null {
  if (!logPath.includes('/Logs/')) return null;
  const phasePart = logPath.replace(/\/Logs\/L\d+\s*-\s*/, '/Phases/');
  return phasePart !== logPath ? phasePart : null;
}

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function eventLabel(ev: string): string {
  const map: Record<string, string> = {
    task_done: 'task done', task_started: 'task started', task_blocked: 'blocked',
    lock_acquired: 'lock acquired', lock_released: 'lock released',
    atomise_done: 'atomised', atomise_started: 'atomising',
    phase_completed: 'completed', phase_blocked: 'blocked',
    replan_done: 'replanned', replan_started: 'replanning',
    stale_lock_cleared: 'lock cleared',
    acceptance_verified: 'acceptance met',
    state_transition: 'state changed',
  };
  return map[ev] ?? ev.replace(/_/g, ' ');
}

// statusColor imported from @/lib/colors

const EVENT_COLOR: Record<string, string> = {
  task_done: 'var(--done)', phase_completed: 'var(--done)', acceptance_verified: 'var(--done)',
  task_blocked: 'var(--blocked)', phase_blocked: 'var(--blocked)',
  lock_acquired: 'var(--active)', task_started: 'var(--active)',
  atomise_done: 'var(--ready)', replan_done: 'var(--planning)',
};

function projectHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return (h % 270) + 30; // avoid reds (0-30) and keep it in visible range
}

export default function RunsView({ runs, onOpenFile }: Props) {
  const [diffProject, setDiffProject] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const projects = [...new Set(runs.map(r => r.project))].sort();
  const visible   = filter ? runs.filter(r => r.project === filter) : runs;

  if (runs.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 12 }}>
      No run logs found.
    </div>
  );

  return (
    <>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Filter bar ── */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter(null)} style={{
            padding: '3px 10px', borderRadius: 10, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${!filter ? 'var(--accent)' : 'var(--border)'}`,
            background: !filter ? 'rgba(68,147,248,0.1)' : 'transparent',
            color: !filter ? 'var(--accent)' : 'var(--text-faint)',
          }}>All</button>
          {projects.map(p => {
            const hue = projectHue(p);
            const active = filter === p;
            return (
              <button key={p} onClick={() => setFilter(f => f === p ? null : p)} style={{
                padding: '3px 10px', borderRadius: 10, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${active ? `hsla(${hue},65%,55%,0.7)` : 'var(--border)'}`,
                background: active ? `hsla(${hue},65%,55%,0.1)` : 'transparent',
                color: active ? `hsl(${hue},65%,65%)` : 'var(--text-faint)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: `hsl(${hue},65%,55%)`, flexShrink: 0 }}/>
                {p.length > 18 ? p.slice(0, 18) + '…' : p}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{visible.length} entries</span>
        </div>

        {/* ── Timeline ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {visible.map((run, i) => {
            const hue = projectHue(run.project);
            const evColor = run.lastEvent ? (EVENT_COLOR[run.lastEvent] ?? 'var(--text-faint)') : 'var(--text-faint)';
            const runStatusColor = run.phaseStatus ? statusColor(run.phaseStatus) : undefined;
            const isRecent = Date.now() - new Date(run.modifiedAt).getTime() < 3_600_000;

            return (
              <div key={run.path} onClick={() => onOpenFile(run.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background 0.1s',
                  borderLeft: isRecent ? `2px solid hsl(${hue},65%,55%)` : '2px solid transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Project dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: `hsl(${hue},65%,55%)`, flexShrink: 0 }}/>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: `hsl(${hue},55%,60%)`, fontWeight: 600, flexShrink: 0 }}>
                      {run.project.length > 14 ? run.project.slice(0, 14) + '…' : run.project}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-str)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      P{run.phaseNum} — {run.phaseName}
                    </span>
                  </div>
                  {run.lastEvent && (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <span style={{ color: evColor, fontWeight: 500, flexShrink: 0 }}>{eventLabel(run.lastEvent)}</span>
                      {run.lastDetail && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {run.lastDetail}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{relTime(run.modifiedAt)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {run.phaseStatus && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${runStatusColor}30`, color: runStatusColor, textTransform: 'capitalize', letterSpacing: '0.04em' }}>
                        {run.phaseStatus}
                      </span>
                    )}
                    {(() => {
                      const phasePath = derivePhasePathFromLog(run.path);
                      return phasePath ? (
                        <button onClick={e => { e.stopPropagation(); onOpenFile(phasePath); }} title="Open phase file"
                          style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9 }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ready)'; e.currentTarget.style.borderColor = 'rgba(63,185,80,0.4)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          <ExternalLink size={8}/> phase
                        </button>
                      ) : null;
                    })()}
                    <button onClick={e => { e.stopPropagation(); setDiffProject(run.project); }} title="View git diff"
                      style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9 }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'rgba(68,147,248,0.4)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <GitBranch size={8}/> diff
                    </button>
                    <FileText size={9} style={{ color: 'var(--text-faint)' }}/>
                    <span style={{ fontSize: 9, color: run.sizeKb > 100 ? 'var(--blocked)' : run.sizeKb > 40 ? '#e8a44d' : 'var(--text-faint)', fontFamily: 'monospace' }}>
                      {run.sizeKb}kb
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Diff slide-over ── */}
      {diffProject && (
        <>
          <div onClick={() => setDiffProject(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}/>
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 540,
            background: 'rgba(10,14,22,0.97)', backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            borderLeft: '1px solid var(--glass-b-hi)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            animation: 'slide-in 0.2s cubic-bezier(0.22,0.61,0.36,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 50, borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
              <GitBranch size={13} style={{ color: 'var(--accent)' }}/>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-str)' }}>Git Diff — {diffProject}</span>
              <button onClick={() => setDiffProject(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><X size={14}/></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <GitDiffPanel projectId={diffProject}/>
            </div>
          </div>
        </>
      )}
    </>
  );
}
