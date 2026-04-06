'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckSquare, Square, Play, ChevronRight, Square as StopIcon, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from './Toast';
import { statusColor as sc } from '@/lib/colors';
import type { GZPhase, GZProject } from '@/lib/types';

interface PhaseFile { name: string; path: string }
interface ParsedTask { text: string; done: boolean; rawLineIndex: number }

type Tab = 'tasks' | 'files' | 'logs' | 'chat';

interface Props {
  phase: GZPhase & { projectId: string; projectRef: GZProject };
  onClose: () => void;
  onRunCLI: (cmd: string, args?: string[]) => void;
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

export default function PhaseStudio({ phase, onClose, onRunCLI }: Props) {
  const [tab, setTab] = useState<Tab>('tasks');
  const [raw, setRaw]   = useState<string | null>(null);
  const [tasks, setTasks] = useState<ParsedTask[]>([]);
  const [files, setFiles] = useState<PhaseFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileRaw, setFileRaw] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ role: 'user' | 'sys'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [logExists, setLogExists] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = phase.status === 'active';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/gz/vault-file?path=${encodeURIComponent(phase.path)}`).then(r => r.json()),
      fetch(`/api/gz/phase-files?path=${encodeURIComponent(phase.path)}`).then(r => r.json()),
    ]).then(([fd, fsd]) => {
      const content: string = fd.raw ?? '';
      setRaw(content);
      setTasks(parseTasks(content));
      setFiles(fsd.files ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [phase.path]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);
  useEffect(() => { if (tab === 'logs') logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logContent, tab]);

  const fetchLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const data = await fetch(`/api/gz/phase-logs?path=${encodeURIComponent(phase.path)}`).then(r => r.json()) as { exists: boolean; content: string | null };
      setLogExists(data.exists);
      setLogContent(data.content);
    } catch { /* non-fatal */ }
    finally { setLogLoading(false); }
  }, [phase.path]);

  // Auto-poll logs every 3s when active
  useEffect(() => {
    if (tab !== 'logs') { if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; } return; }
    void fetchLog();
    if (isActive) {
      logPollRef.current = setInterval(() => void fetchLog(), 3000);
    }
    return () => { if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; } };
  }, [tab, isActive, fetchLog]);

  const killReset = async () => {
    if (!confirm(`Kill the running agent and reset "${phase.phaseName}" back to ready?`)) return;
    try {
      await fetch(`/api/gz/projects/${encodeURIComponent(phase.projectId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phasePath: phase.path, status: 'ready' }),
      });
      toast(`${phase.phaseName} reset to ready`, 'info');
      onRunCLI('heal');
      onClose();
    } catch {
      toast('Kill failed — edit vault manually', 'error');
    }
  };

  const markComplete = async () => {
    try {
      const res = await fetch(`/api/gz/projects/${encodeURIComponent(phase.projectId)}`, {
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
    // Optimistic update
    setRaw(next);
    setTasks(parseTasks(next));
    try {
      const res = await fetch(`/api/gz/vault-file?path=${encodeURIComponent(phase.path)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Rollback on failure
      setRaw(raw);
      setTasks(parseTasks(raw));
      toast('Failed to save task — check vault connection', 'error');
    }
  };

  const openFile = useCallback(async (f: PhaseFile) => {
    setActiveFile(f.path);
    const data = await fetch(`/api/gz/vault-file?path=${encodeURIComponent(f.path)}`).then(r => r.json()) as { raw?: string };
    setFileRaw(data.raw ?? '');
  }, []);

  // Auto-expand first file when Files tab opens
  useEffect(() => {
    if (tab === 'files' && files.length > 0 && !activeFile) {
      void openFile(files[0]!);
    }
  }, [tab, files, activeFile, openFile]);

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || sending) return;
    setChatInput('');
    setSending(true);
    setChatMsgs(m => [...m, { role: 'user', text: msg }]);
    const appended = (raw ?? '') + `\n\n> **Agent note (${new Date().toLocaleTimeString()}):** ${msg}\n`;
    try {
      const res = await fetch(`/api/gz/vault-file?path=${encodeURIComponent(phase.path)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: appended }),
      });
      if (!res.ok) throw new Error('save failed');
      setRaw(appended);
      setChatMsgs(m => [...m, { role: 'sys', text: '✓ Note saved to phase file. Hit Run to execute with agent.' }]);
    } catch {
      setChatMsgs(m => [...m, { role: 'sys', text: '✗ Failed to save note to vault. Check connection.' }]);
      toast('Note save failed', 'error');
    }
    setSending(false);
  };

  const doneCount = tasks.filter(t => t.done).length;
  // sc imported from @/lib/colors

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fade-in 0.12s ease' }}/>
      <div className="gzos-studio" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 600,
        background: 'rgba(10,14,22,0.97)', backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderLeft: '1px solid var(--glass-b-hi)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        animation: 'slide-in 0.2s cubic-bezier(0.22,0.61,0.36,1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 54, borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc(phase.status), flexShrink: 0, boxShadow: phase.status === 'active' ? `0 0 6px ${sc(phase.status)}99` : 'none' }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.04em' }}>{phase.projectId}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>P{phase.phaseNum} — {phase.phaseName}</div>
          </div>
          {phase.status !== 'completed' && (
            <button onClick={() => void markComplete()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--done)', border: '1px solid rgba(61,224,114,0.25)', background: 'rgba(61,224,114,0.06)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              title="Mark this phase as completed">
              <CheckCircle size={9}/> Done
            </button>
          )}
          {isActive ? (
            <button onClick={() => void killReset()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--blocked)', border: '1px solid rgba(245,82,74,0.35)', background: 'rgba(245,82,74,0.08)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <StopIcon size={9}/> Kill & Reset
            </button>
          ) : (
            <button onClick={() => onRunCLI('run', ['--project', phase.projectId])} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ready)', border: '1px solid rgba(46,200,102,0.3)', background: 'rgba(46,200,102,0.06)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <Play size={9}/> Run agent
            </button>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><X size={14}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          {([['tasks', 'Tasks', `${doneCount}/${tasks.length}`], ['files', 'Files', String(files.length)], ['logs', 'Logs', isActive ? '●' : ''], ['chat', 'Chat', '']] as [Tab, string, string][]).map(([id, label, badge]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '9px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 11, fontWeight: tab === id ? 600 : 400,
              color: tab === id ? 'var(--text-str)' : id === 'logs' && isActive ? 'var(--active)' : 'var(--text-faint)',
              borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
            }}>
              {label}
              {badge && <span style={{ fontSize: 9, fontFamily: 'monospace', color: tab === id ? 'var(--accent)' : 'var(--text-faint)' }}>{badge}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: tab === 'chat' ? 0 : '12px 16px' }}>
          {loading && <div style={{ padding: 16, color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>}

          {/* ── Tasks ── */}
          {!loading && tab === 'tasks' && (
            tasks.length === 0
              ? <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>No task checkboxes found in this phase.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {tasks.map((task, i) => (
                    <button key={i} onClick={() => void toggleTask(i)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 8px',
                      borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer',
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

          {/* ── Files ── */}
          {!loading && tab === 'files' && (
            <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 0 }}>
              <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {files.length === 0
                  ? <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '8px 0' }}>No .md files in this directory.</div>
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
              <div style={{ flex: 1, overflow: 'auto', borderLeft: '1px solid var(--glass-b)', paddingLeft: 12 }}>
                {activeFile
                  ? <MarkdownBlock raw={fileRaw}/>
                  : <div style={{ color: 'var(--text-faint)', fontSize: 12, paddingTop: 8 }}>← Select a file</div>
                }
              </div>
            </div>
          )}

          {/* ── Logs ── */}
          {!loading && tab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {isActive && <span style={{ fontSize: 9, color: 'var(--active)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--active)', display: 'inline-block' }}/> live · polling every 3s</span>}
                <button onClick={() => void fetchLog()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', marginLeft: 'auto' }}>
                  <RefreshCw size={11} className={logLoading ? 'spin' : ''}/>
                </button>
              </div>
              {logLoading && !logContent && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>Loading logs…</div>}
              {!logExists && !logLoading && (
                <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
                  No log file found for this phase yet.<br/>
                  <span style={{ fontSize: 10 }}>Logs are created when the agent runs.</span>
                </div>
              )}
              {logExists && logContent && (
                <pre style={{ flex: 1, overflow: 'auto', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, margin: 0 }}>
                  {logContent}
                  <div ref={logEndRef}/>
                </pre>
              )}
            </div>
          )}

          {/* ── Chat ── */}
          {!loading && tab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chatMsgs.length === 0 && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, lineHeight: 1.6 }}>
                    Leave instructions for the agent on this phase.<br/>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Notes are appended to the phase file and read on the next run.</span>
                  </div>
                )}
                {chatMsgs.map((m, i) => (
                  <div key={i} style={{
                    padding: '8px 11px', borderRadius: 9,
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    background: m.role === 'user' ? 'rgba(77,156,248,0.12)' : 'var(--glass)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(77,156,248,0.22)' : 'var(--glass-b)'}`,
                    fontSize: 12, color: 'var(--text-str)', lineHeight: 1.45,
                  }}>
                    {m.text}
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--glass-b)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                  placeholder="Add instruction for the agent… (Enter to send)"
                  rows={2}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button onClick={() => void sendChat()} disabled={sending || !chatInput.trim()} style={{
                    padding: '5px 12px', borderRadius: 5, border: '1px solid var(--accent)', background: 'rgba(77,156,248,0.1)',
                    cursor: chatInput.trim() && !sending ? 'pointer' : 'not-allowed',
                    fontSize: 10, color: chatInput.trim() ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'inherit',
                    opacity: chatInput.trim() && !sending ? 1 : 0.5,
                  }}>Send</button>
                  <button onClick={() => onRunCLI('run', ['--project', phase.projectId])} style={{
                    padding: '5px 12px', borderRadius: 5, border: '1px solid rgba(46,200,102,0.3)', background: 'rgba(46,200,102,0.06)',
                    cursor: 'pointer', fontSize: 10, color: 'var(--ready)', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <Play size={8}/> Run
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
