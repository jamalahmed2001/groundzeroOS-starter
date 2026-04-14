'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckSquare, Square, Play, ChevronRight, Square as StopIcon, RefreshCw, CheckCircle, ChevronDown, Plus } from 'lucide-react';
import { toast } from './Toast';
import { statusColor as sc } from '@/lib/colors';
import type { GZPhase, GZProject } from '@/lib/types';

interface PhaseFile { name: string; path: string }
interface ParsedTask { text: string; done: boolean; rawLineIndex: number }

interface Props {
  phase: GZPhase & { projectId: string; projectRef: GZProject };
  onClose: () => void;
  onRunCLI: (cmd: string, args?: string[]) => void;
  onDiff?: () => void;
}

function parseTasks(raw: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^- \[x\]/i.test(t)) tasks.push({ done: true,  text: t.replace(/^- \[x\]\s*/i, ''), rawLineIndex: i });
    else if (/^- \[ \]/.test(t)) tasks.push({ done: false, text: t.replace(/^- \[ \]\s*/, ''), rawLineIndex: i });
  }
  return tasks;
}

function renderInline(t: string): string {
  return t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong style="color:var(--text-str)">$1</strong>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--bg-2);padding:1px 4px;border-radius:3px;font-size:10px;color:var(--accent)">$1</code>');
}

function MarkdownBlock({ raw }: { raw: string }) {
  const lines = raw.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 5 }}/>;
        if (t.startsWith('# '))  return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-str)', marginTop: 10, marginBottom: 3 }}>{t.slice(2)}</div>;
        if (t.startsWith('## ')) return <div key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginTop: 8, marginBottom: 2 }}>{t.slice(3)}</div>;
        if (t.startsWith('### ')) return <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginTop: 6 }}>{t.slice(4)}</div>;
        if (t.startsWith('```')) return <div key={i} style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace' }}>{t}</div>;
        if (/^- \[x\]/i.test(t)) return (
          <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-faint)', textDecoration: 'line-through', padding: '1px 0' }}>
            <span style={{ color: 'var(--done)', flexShrink: 0 }}>✓</span>
            <span dangerouslySetInnerHTML={{ __html: renderInline(t.replace(/^- \[x\]\s*/i, '')) }}/>
          </div>
        );
        if (/^- \[ \]/.test(t)) return (
          <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-str)', padding: '1px 0' }}>
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>○</span>
            <span dangerouslySetInnerHTML={{ __html: renderInline(t.replace(/^- \[ \]\s*/, '')) }}/>
          </div>
        );
        if (t.startsWith('- ')) return (
          <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-dim)', padding: '1px 0' }}>
            <span style={{ flexShrink: 0, color: 'var(--text-faint)' }}>·</span>
            <span dangerouslySetInnerHTML={{ __html: renderInline(t.slice(2)) }}/>
          </div>
        );
        if (t.startsWith('> ')) return <div key={i} style={{ fontSize: 11, color: 'var(--text-faint)', borderLeft: '2px solid var(--accent)', paddingLeft: 8, margin: '2px 0', fontStyle: 'italic' }}>{t.slice(2)}</div>;
        return <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', padding: '1px 0' }} dangerouslySetInnerHTML={{ __html: renderInline(t) }}/>;
      })}
    </div>
  );
}

export default function PhaseStudio({ phase, onClose, onRunCLI, onDiff }: Props) {
  const [raw, setRaw]   = useState<string | null>(null);
  const [tasks, setTasks] = useState<ParsedTask[]>([]);
  const [files, setFiles] = useState<PhaseFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileRaw, setFileRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [logExists, setLogExists] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [addTaskText, setAddTaskText] = useState('') ;
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(phase.status === 'active');

  const logEndRef = useRef<HTMLDivElement>(null);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = phase.status === 'active';
  const isCompleted = phase.status === 'completed';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/onyx/vault-file?path=${encodeURIComponent(phase.path)}`).then(r => r.json()),
      fetch(`/api/onyx/phase-files?path=${encodeURIComponent(phase.path)}`).then(r => r.json()),
    ]).then(([fd, fsd]) => {
      const content: string = (fd as { raw?: string }).raw ?? '';
      setRaw(content);
      setTasks(parseTasks(content));
      setFiles((fsd as { files?: PhaseFile[] }).files ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [phase.path]);

  const fetchLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const data = await fetch(`/api/onyx/phase-logs?path=${encodeURIComponent(phase.path)}`).then(r => r.json()) as { exists: boolean; content: string | null };
      setLogExists(data.exists);
      setLogContent(data.content);
    } catch { /* non-fatal */ }
    finally { setLogLoading(false); }
  }, [phase.path]);

  // Always-on log polling when active
  useEffect(() => {
    void fetchLog();
    if (!isActive) return;
    logPollRef.current = setInterval(() => void fetchLog(), 3000);
    return () => { if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; } };
  }, [isActive, fetchLog]);

  // Auto-scroll log to bottom
  useEffect(() => { if (logExpanded) logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logContent, logExpanded]);

  const killReset = async () => {
    if (!confirm(`Stop the running agent and reset "${phase.phaseName}" back to ready?`)) return;
    try {
      await fetch(`/api/onyx/projects/${encodeURIComponent(phase.projectId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: 'ready' }),
      });
      toast(`${phase.phaseName} reset to ready`, 'info');
      onRunCLI('heal');
      onClose();
    } catch {
      toast('Stop failed — edit vault manually', 'error');
    }
  };

  const markComplete = async () => {
    try {
      const res = await fetch(`/api/onyx/projects/${encodeURIComponent(phase.projectId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: 'completed' }),
      });
      const d = await res.json() as { ok?: boolean };
      if (!d.ok) throw new Error('update failed');
      toast(`${phase.phaseName} marked complete`, 'success');
      onClose();
    } catch {
      toast('Failed to mark complete', 'error');
    }
  };

  const toggleTask = async (idx: number) => {
    if (raw === null) return;
    const task = tasks[idx];
    const lines = raw.split('\n');
    lines[task.rawLineIndex] = task.done
      ? lines[task.rawLineIndex].replace(/^(\s*)- \[x\]/i, '$1- [ ]')
      : lines[task.rawLineIndex].replace(/^(\s*)- \[ \]/, '$1- [x]');
    const next = lines.join('\n');
    setRaw(next);
    setTasks(parseTasks(next));
    try {
      const res = await fetch(`/api/onyx/vault-file?path=${encodeURIComponent(phase.path)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setRaw(raw);
      setTasks(parseTasks(raw));
      toast('Failed to save task — check vault connection', 'error');
    }
  };

  const saveNote = async () => {
    const note = noteText.trim();
    if (!note || raw === null) return;
    const ts = new Date().toLocaleTimeString();
    const appended = raw + `\n\n> **Operator note (${ts}):** ${note}\n`;
    setNoteText('');
    try {
      const res = await fetch(`/api/onyx/vault-file?path=${encodeURIComponent(phase.path)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: appended }),
      });
      if (!res.ok) throw new Error('save failed');
      setRaw(appended);
      toast('Note saved to phase file', 'success');
    } catch {
      toast('Note save failed', 'error');
    }
  };

  const addTask = async () => {
    const text = addTaskText.trim();
    if (!text || raw === null) return;
    const appended = raw.endsWith('\n') ? raw + `- [ ] ${text}\n` : raw + `\n- [ ] ${text}\n`;
    setAddTaskText('');
    setRaw(appended);
    setTasks(parseTasks(appended));
    try {
      const res = await fetch(`/api/onyx/vault-file?path=${encodeURIComponent(phase.path)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: appended }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setRaw(raw);
      setTasks(parseTasks(raw));
      toast('Failed to add task', 'error');
    }
  };

  const openFile = useCallback(async (f: PhaseFile) => {
    setActiveFile(f.path);
    const data = await fetch(`/api/onyx/vault-file?path=${encodeURIComponent(f.path)}`).then(r => r.json()) as { raw?: string };
    setFileRaw(data.raw ?? '');
  }, []);

  const doneCount = tasks.filter(t => t.done).length;
  const driver = phase.projectRef.agentDriver;
  const hasRepo = Boolean(phase.projectRef.repoPath);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fade-in 0.12s ease' }}/>
      <div className="onyx-studio" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 600, maxWidth: '100vw',
        background: 'rgba(10,14,22,0.97)', backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderLeft: '1px solid var(--glass-b-hi)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        animation: 'slide-in 0.2s cubic-bezier(0.22,0.61,0.36,1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 54, borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc(phase.status), flexShrink: 0, boxShadow: isActive ? `0 0 6px ${sc(phase.status)}99` : 'none' }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.04em' }}>{phase.projectId}</span>
              {driver && (
                <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 600, padding: '1px 4px', borderRadius: 3, border: `1px solid ${driver === 'claude-code' ? 'var(--accent)' : 'var(--planning)'}44`, color: driver === 'claude-code' ? 'var(--accent)' : 'var(--planning)', letterSpacing: '0.03em' }}>
                  {driver === 'claude-code' ? 'claude' : driver}
                </span>
              )}
              {!hasRepo && (
                <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-faint)', opacity: 0.7 }}>no repo</span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>P{phase.phaseNum} — {phase.phaseName}</div>
          </div>
          {!isCompleted && (
            <button onClick={() => void markComplete()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--done)', border: '1px solid rgba(61,224,114,0.25)', background: 'rgba(61,224,114,0.06)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              title="Mark this phase as completed">
              <CheckCircle size={9}/> Done
            </button>
          )}
          {isActive ? (
            <button onClick={() => void killReset()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--blocked)', border: '1px solid rgba(245,82,74,0.35)', background: 'rgba(245,82,74,0.08)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <StopIcon size={9}/> Stop
            </button>
          ) : !isCompleted && (
            <button onClick={() => onRunCLI('run', ['--project', phase.projectId])} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ready)', border: '1px solid rgba(46,200,102,0.3)', background: 'rgba(46,200,102,0.06)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <Play size={9}/> Run
            </button>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><X size={14}/></button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && <div style={{ padding: 16, color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>}

          {!loading && (
            <>
              {/* ── Instructions ── */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-b)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Instructions</div>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onBlur={() => { if (noteText.trim()) void saveNote(); }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveNote(); } }}
                  placeholder="Leave a note for the agent… (saves on blur, or ⌘Enter)"
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                />
              </div>

              {/* ── Tasks ── */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-b)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Tasks
                  {tasks.length > 0 && (
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: doneCount === tasks.length ? 'var(--done)' : 'var(--text-faint)' }}>{doneCount}/{tasks.length}</span>
                  )}
                </div>

                {tasks.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0 8px' }}>No tasks yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
                    {tasks.map((task, i) => (
                      <button key={i} onClick={() => void toggleTask(i)} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '6px 8px',
                        borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer',
                        textAlign: 'left', width: '100%', fontFamily: 'inherit',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hi)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {task.done
                          ? <CheckSquare size={13} style={{ color: 'var(--done)', flexShrink: 0, marginTop: 1 }}/>
                          : <Square size={13} style={{ color: 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}/>
                        }
                        <span style={{
                          fontSize: 12, lineHeight: 1.45,
                          color: task.done ? 'var(--text-faint)' : 'var(--text-str)',
                          textDecoration: task.done ? 'line-through' : 'none',
                        }} dangerouslySetInnerHTML={{ __html: renderInline(task.text) }}/>
                      </button>
                    ))}
                  </div>
                )}

                {/* Advance CTA — all tasks done but phase not yet marked complete */}
                {doneCount === tasks.length && tasks.length > 0 && !isCompleted && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 8, borderRadius: 6, border: '1px solid rgba(61,224,114,0.3)', background: 'rgba(61,224,114,0.06)' }}>
                    <span style={{ fontSize: 11, color: 'var(--done)', flex: 1 }}>All tasks complete</span>
                    {onDiff && hasRepo && (
                      <button onClick={onDiff} style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid rgba(77,156,248,0.3)', background: 'transparent', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        Review Diff
                      </button>
                    )}
                    <button onClick={() => void markComplete()} style={{ fontSize: 10, color: 'var(--done)', border: '1px solid rgba(61,224,114,0.3)', background: 'transparent', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, fontWeight: 600 }}>
                      Mark Done
                    </button>
                  </div>
                )}

                {/* Add task */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={addTaskText}
                    onChange={e => setAddTaskText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && addTaskText.trim()) void addTask(); }}
                    placeholder="Add a task…"
                    style={{ flex: 1, padding: '5px 9px', borderRadius: 5, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <button onClick={() => void addTask()} disabled={!addTaskText.trim()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid var(--glass-b)', background: 'transparent', cursor: addTaskText.trim() ? 'pointer' : 'not-allowed', color: addTaskText.trim() ? 'var(--accent)' : 'var(--text-faint)', opacity: addTaskText.trim() ? 1 : 0.5 }}>
                    <Plus size={12}/>
                  </button>
                </div>
              </div>

              {/* ── Log ── */}
              {(logExists || isActive) && (
                <div style={{ borderBottom: '1px solid var(--glass-b)' }}>
                  <button onClick={() => setLogExpanded(v => !v)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}>
                    <ChevronDown size={10} style={{ color: 'var(--text-faint)', transform: logExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }}/>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Log</span>
                    {isActive && <span style={{ fontSize: 9, color: 'var(--active)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--active)', display: 'inline-block' }}/> live</span>}
                    <button onClick={e => { e.stopPropagation(); void fetchLog(); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                      <RefreshCw size={10} className={logLoading ? 'spin' : ''}/>
                    </button>
                  </button>

                  {logExpanded && (
                    <div style={{ padding: '0 16px 14px' }}>
                      {logLoading && !logContent && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>}
                      {!logExists && !logLoading && (
                        <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '4px 0' }}>No log yet — created when the agent runs.</div>
                      )}
                      {logExists && logContent && (
                        <pre style={{ maxHeight: 280, overflow: 'auto', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, margin: 0 }}>
                          {logContent}
                          <div ref={logEndRef}/>
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Files ── */}
              <div>
                <button onClick={() => setFilesExpanded(v => !v)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <ChevronDown size={10} style={{ color: 'var(--text-faint)', transform: filesExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Files</span>
                  {files.length > 0 && <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-faint)' }}>{files.length}</span>}
                </button>

                {filesExpanded && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', gap: 12, minHeight: 0 }}>
                    <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {files.length === 0
                        ? <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '4px 0' }}>No .md files in this directory.</div>
                        : files.map(f => (
                            <button key={f.path} onClick={() => void openFile(f)} style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 8px', borderRadius: 6, border: 'none', textAlign: 'left',
                              background: activeFile === f.path ? 'rgba(77,156,248,0.1)' : 'transparent',
                              color: activeFile === f.path ? 'var(--accent)' : 'var(--text-dim)',
                              borderLeft: `2px solid ${activeFile === f.path ? 'var(--accent)' : 'transparent'}`,
                              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', width: '100%',
                            }}
                              onMouseEnter={e => { if (activeFile !== f.path) e.currentTarget.style.background = 'var(--glass-hi)'; }}
                              onMouseLeave={e => { if (activeFile !== f.path) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <ChevronRight size={9} style={{ flexShrink: 0, opacity: 0.5 }}/>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                            </button>
                          ))
                      }
                    </div>
                    {activeFile && (
                      <div style={{ flex: 1, overflow: 'auto', borderLeft: '1px solid var(--glass-b)', paddingLeft: 12, maxHeight: 320 }}>
                        <MarkdownBlock raw={fileRaw}/>
                      </div>
                    )}
                    {!activeFile && files.length > 0 && (
                      <div style={{ color: 'var(--text-faint)', fontSize: 12, paddingTop: 8, paddingLeft: 12 }}>← Select a file</div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
