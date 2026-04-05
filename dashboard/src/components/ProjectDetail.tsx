'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Play, Cpu, GitBranch, ExternalLink, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import type { GZProject, GZPhase, PhaseStatus } from '@/lib/types';
import { statusColor as sc } from '@/lib/colors';
import GitDiffPanel from './GitDiffPanel';

interface Props {
  project: GZProject;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onRunCLI: (cmd: string, args?: string[]) => void;
  onRefresh: () => void;
  initialTab?: 'phases' | 'scope' | 'diff' | 'actions';
}

const STATUSES: PhaseStatus[] = ['backlog', 'planning', 'ready', 'active', 'blocked', 'completed'];

// ── Task list (expanded from vault file) ─────────────────────────────────────

function TaskList({ phasePath }: { phasePath: string }) {
  const [tasks, setTasks] = useState<{ text: string; done: boolean }[] | null>(null);

  useEffect(() => {
    fetch(`/api/gz/vault-file?path=${encodeURIComponent(phasePath)}`)
      .then(r => r.json())
      .then((d: { raw: string }) => {
        const lines = d.raw?.split('\n') ?? [];
        const parsed: { text: string; done: boolean }[] = [];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i]!;
          if (!/^\s*-\s*\[[ x]\]/i.test(l)) continue;
          const done = /\[x\]/i.test(l);
          let text = l.replace(/^\s*-\s*\[[ x]\]\s*/i, '').trim();
          // If bare checkbox (no inline text), look ahead for the first non-empty continuation line
          if (!text) {
            for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
              const next = lines[j]!.trim();
              if (!next || /^\s*-\s*\[/.test(next) || /^<!--/.test(next) || /^##/.test(next)) break;
              text = next;
              break;
            }
          }
          if (text) parsed.push({ text, done });
        }
        setTasks(parsed);
      })
      .catch(() => setTasks([]));
  }, [phasePath]);

  if (!tasks) return <div style={{ fontSize: 10, color: 'var(--text-faint)', padding: '4px 0' }}>Loading tasks…</div>;
  if (!tasks.length) return <div style={{ fontSize: 10, color: 'var(--text-faint)', padding: '4px 0' }}>No tasks found.</div>;

  return (
    <div style={{ padding: '6px 0 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {tasks.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11 }}>
          <span style={{ color: t.done ? 'var(--done)' : 'var(--text-faint)', marginTop: 1, flexShrink: 0, fontSize: 10 }}>{t.done ? '✓' : '○'}</span>
          <span style={{ color: t.done ? 'var(--text-faint)' : 'var(--text-dim)', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1, lineHeight: 1.5 }}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Phase row ─────────────────────────────────────────────────────────────────

function PhaseRow({ phase, onOpen, onStatusChange }: {
  phase: GZPhase;
  onOpen: (p: string) => void;
  onStatusChange: (ph: GZPhase, s: PhaseStatus) => void;
}) {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const pct = phase.tasksTotal > 0 ? Math.round((phase.tasksDone / phase.tasksTotal) * 100) : 0;

  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--glass-b)', padding: '10px 12px', marginBottom: 6, background: 'var(--glass)', transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-b-hi)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-b)')}>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Expand tasks toggle */}
        {phase.tasksTotal > 0 && (
          <button onClick={() => setTasksOpen(o => !o)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0', color: 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
            {tasksOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
          </button>
        )}
        {phase.tasksTotal === 0 && <div style={{ width: 12, flexShrink: 0 }}/>}

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpen(phase.path)}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-str)', marginBottom: 2 }}>P{phase.phaseNum} — {phase.phaseName}</div>
          {phase.blockedReason && (
            <div style={{ fontSize: 10, color: 'var(--blocked)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠ {phase.blockedReason}</div>
          )}
          {!phase.blockedReason && phase.nextTask && !tasksOpen && (
            <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {phase.nextTask}</div>
          )}
        </div>

        {/* Status badge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, border: `1px solid ${sc(phase.status)}44`, background: sc(phase.status) + '15', color: sc(phase.status), cursor: 'pointer', letterSpacing: '0.04em' }}>
            {phase.status}
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}/>
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'rgba(10,14,22,0.96)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-b-hi)', borderRadius: 'var(--r-md)', zIndex: 11, overflow: 'hidden', minWidth: 128, boxShadow: '0 12px 36px rgba(0,0,0,0.6)' }}>
                {STATUSES.map(s => (
                  <div key={s} onClick={() => { onStatusChange(phase, s); setMenuOpen(false); }} style={{ padding: '7px 12px', fontSize: 11, cursor: 'pointer', color: s === phase.status ? sc(s) : 'var(--text-dim)', fontWeight: s === phase.status ? 600 : 400, display: 'flex', alignItems: 'center', gap: 7 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hi)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc(s), flexShrink: 0 }}/> {s}
                    {s === phase.status && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {phase.tasksTotal > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: sc(phase.status), transition: 'width 0.3s' }}/>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{phase.tasksDone}/{phase.tasksTotal}</span>
        </div>
      )}

      {/* Expanded task list */}
      {tasksOpen && <TaskList phasePath={phase.path}/>}
    </div>
  );
}

// ── Scope editor ──────────────────────────────────────────────────────────────

function ScopeEditor({ project, onClose }: { project: GZProject; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/gz/vault-file?path=${encodeURIComponent(project.overviewPath)}`)
      .then(r => r.json())
      .then((d: { raw: string }) => { setContent(d.raw ?? ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [project.overviewPath]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; setContent(c => c.slice(0, s) + '  ' + c.slice(end)); requestAnimationFrame(() => { if (ref.current) { ref.current.selectionStart = ref.current.selectionEnd = s + 2; } }); }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/gz/vault-file?path=${encodeURIComponent(project.overviewPath)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1000);
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '12px 0' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <textarea ref={ref} value={content} onChange={e => setContent(e.target.value)} onKeyDown={handleKey}
        style={{ flex: 1, padding: '12px', borderRadius: 'var(--r-md)', border: '1px solid var(--glass-b)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-str)', fontSize: 11.5, fontFamily: 'monospace', resize: 'none', outline: 'none', lineHeight: 1.7, caretColor: 'var(--accent)' }}/>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => void save()} disabled={saving} style={{ flex: 1, padding: '7px', borderRadius: 'var(--r-sm)', border: `1px solid rgba(46,200,102,0.3)`, background: saved ? 'rgba(61,224,114,0.1)' : 'transparent', cursor: 'pointer', fontSize: 11.5, color: saved ? 'var(--done)' : 'var(--ready)', fontFamily: 'inherit' }}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : '⌘S  Save to Vault'}
        </button>
        <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-dim)', fontFamily: 'inherit' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProjectDetail({ project, onClose, onOpenFile, onRunCLI, onRefresh, initialTab = 'phases' }: Props) {
  const [tab, setTab] = useState<'phases' | 'scope' | 'diff' | 'actions'>(initialTab);

  const handleStatusChange = async (phase: GZPhase, newStatus: PhaseStatus) => {
    try {
      const res = await fetch(`/api/gz/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: newStatus }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Status change failed'); return; }
    } catch { alert('Network error'); return; }
    onRefresh();
  };

  const TABS: { id: typeof tab; label: string }[] = [
    { id: 'phases',  label: 'Phases'  },
    { id: 'scope',   label: 'Scope'   },
    ...(project.repoPath ? [{ id: 'diff' as const, label: 'Git Diff' }] : []),
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, animation: 'fade-in 0.12s ease' }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 500,
        background: 'rgba(10,14,22,0.95)', backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderLeft: '1px solid var(--glass-b-hi)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        animation: 'slide-in 0.2s cubic-bezier(0.22,0.61,0.36,1)',
      }}>
        {/* Header */}
        <div style={{ padding: '0 14px', height: 50, borderBottom: '1px solid var(--glass-b)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.id}</div>
          </div>
          {project.repoPath && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={9}/>{project.repoPath.split('/').pop()}
            </span>
          )}
          <button onClick={() => onOpenFile(project.overviewPath)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }} title="Open overview">
            <ExternalLink size={13}/>
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
            <X size={14}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-b)', flexShrink: 0, padding: '0 14px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 12, color: tab === t.id ? 'var(--text-str)' : 'var(--text-dim)',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontFamily: 'inherit',
              ...(t.id === 'diff' ? { color: tab === t.id ? 'var(--accent)' : 'var(--text-dim)' } : {}),
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px', minHeight: 0 }}>
          {tab === 'phases' && (
            project.phases.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>No phases yet. Decompose to break the Overview into phases.</div>
                <button onClick={() => onRunCLI('plan', [project.id])} style={{ padding: '7px 18px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(77,156,248,0.3)', background: 'rgba(77,156,248,0.07)', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Cpu size={12}/> Decompose
                </button>
              </div>
            ) : (
              project.phases.map(ph => (
                <PhaseRow key={ph.path} phase={ph} onOpen={onOpenFile} onStatusChange={handleStatusChange}/>
              ))
            )
          )}

          {tab === 'scope' && <ScopeEditor project={project} onClose={() => setTab('phases')}/>}

          {tab === 'diff' && project.repoPath && <GitDiffPanel projectId={project.id}/>}

          {tab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: Play,       label: 'Run next ready phase',   cmd: 'run',  args: ['--project', project.id],          color: 'var(--ready)'    },
                { icon: Cpu,        label: 'Decompose + Atomise',     cmd: 'plan', args: [project.id],                       color: 'var(--accent)'   },
                { icon: GitBranch,  label: 'Extend (new phases)',     cmd: 'plan', args: [project.id, '--extend'],           color: 'var(--planning)' },
                ...(project.linearProjectId ? [{ icon: Upload, label: 'Sync to Linear', cmd: 'linear-uplink', args: [project.id], color: '#8250df' }] : []),
              ].map(({ icon: Icon, label, cmd, args, color }) => (
                <button key={label} onClick={() => { onRunCLI(cmd, args); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--glass-b)', background: 'var(--glass)', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 12, fontFamily: 'inherit', textAlign: 'left', width: '100%', transition: 'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = 'var(--text-str)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-b)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
                >
                  <Icon size={14} style={{ color, flexShrink: 0 }}/> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
