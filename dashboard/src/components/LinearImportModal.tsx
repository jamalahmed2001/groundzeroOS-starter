'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { GZProject } from '@/lib/types';
import type { LinearIssue } from '@/app/api/gz/linear/my-issues/route';

interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state?: string;
  teams?: { nodes: { key: string; name: string }[] };
}

const PRIORITY_LABEL: Record<number, string> = { 0: '', 1: '🔴', 2: '🟠', 3: '🟡', 4: '⚪' };
const STATE_COLOR: Record<string, string> = {
  started:    'var(--active)',
  unstarted:  'var(--text-faint)',
  backlog:    'var(--backlog)',
  triage:     'var(--planning)',
};

interface Props {
  projects: GZProject[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

type View = 'projects' | 'my-issues';
type FetchState = 'loading' | 'ok' | 'unconfigured' | 'error';

export default function LinearImportModal({ projects, onClose, onRefresh, onOpenSettings }: Props) {
  const [view, setView] = useState<View>('my-issues');

  // Projects view state
  const [linearProjects, setLinearProjects] = useState<LinearProject[]>([]);
  const [projectsState, setProjectsState] = useState<FetchState>('loading');

  // My Issues view state
  const [myIssues, setMyIssues] = useState<LinearIssue[]>([]);
  const [viewerName, setViewerName] = useState('');
  const [issuesState, setIssuesState] = useState<FetchState>('loading');
  const [issuesError, setIssuesError] = useState('');

  const [fetchError, setFetchError] = useState('');
  const [teamScoped, setTeamScoped] = useState(false);
  const [filter, setFilter] = useState('');

  const [selectedProject, setSelectedProject] = useState<LinearProject | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [target, setTarget] = useState('__new__');
  const [output, setOutput] = useState('');
  const [importing, setImporting] = useState(false);

  const loadProjects = () => {
    setProjectsState('loading');
    fetch('/api/gz/linear')
      .then(r => r.json())
      .then((d: { projects: LinearProject[]; configured: boolean; error?: string; teamScoped?: boolean }) => {
        if (!d.configured) { setProjectsState('unconfigured'); return; }
        if (d.error) { setProjectsState('error'); setFetchError(d.error); return; }
        setLinearProjects(d.projects);
        setTeamScoped(d.teamScoped ?? false);
        setProjectsState('ok');
      })
      .catch(e => { setProjectsState('error'); setFetchError(String(e)); });
  };

  const loadMyIssues = () => {
    setIssuesState('loading');
    fetch('/api/gz/linear/my-issues')
      .then(r => r.json())
      .then((d: { issues: LinearIssue[]; viewerName: string; configured: boolean; error?: string }) => {
        if (!d.configured) { setIssuesState('unconfigured'); return; }
        if (d.error) { setIssuesState('error'); setIssuesError(d.error); return; }
        setMyIssues(d.issues);
        setViewerName(d.viewerName);
        setIssuesState('ok');
      })
      .catch(e => { setIssuesState('error'); setIssuesError(String(e)); });
  };

  useEffect(() => {
    loadMyIssues();
    loadProjects();
  }, []);

  const runIssueImport = async () => {
    if (!selectedIssue) return;
    setImporting(true);
    setOutput('');
    try {
      const res = await fetch('/api/gz/linear/import-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: selectedIssue.id,
          targetProject: target === '__new__' ? undefined : target,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; project?: string; phase?: string; tasksCount?: number };
      if (data.ok) {
        setOutput(`Imported "${selectedIssue.title}" → ${data.project} / ${data.phase} (${data.tasksCount} tasks)`);
        setSelectedIssue(null);
        onRefresh();
      } else {
        setOutput(`Error: ${data.error}`);
      }
    } catch {
      setOutput('Import failed — check connection');
    }
    setImporting(false);
  };

  const runProjectImport = async () => {
    if (!selectedProject) return;
    setImporting(true);
    setOutput('Running gzos import…\n');
    try {
      const res = await fetch('/api/gz/cli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'import', args: [selectedProject.id] }),
      });
      const data = await res.json() as { output?: string; error?: string };
      setOutput(data.output ?? data.error ?? 'Done');
    } catch {
      setOutput('Import failed — check connection');
    }
    setImporting(false);
    onRefresh();
  };

  const isLoading = view === 'my-issues' ? issuesState === 'loading' : projectsState === 'loading';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, animation: 'fade-in 0.12s ease' }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 560, maxHeight: '82vh', background: 'var(--bg-1)',
        border: '1px solid var(--border-hi)', borderRadius: 8, zIndex: 201,
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: 48, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-str)' }}>Linear</span>
          <button
            onClick={() => { if (view === 'my-issues') loadMyIssues(); else loadProjects(); }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', marginRight: 8 }}
          >
            <RefreshCw size={12} className={isLoading ? 'spin' : ''}/>
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['my-issues', 'projects'] as View[]).map(v => (
            <button key={v} onClick={() => { setView(v); setFilter(''); }}
              style={{
                flex: 1, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: view === v ? 600 : 400,
                color: view === v ? 'var(--text-str)' : 'var(--text-faint)',
                borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              {v === 'my-issues'
                ? `My Issues${viewerName ? ` — ${viewerName}` : ''}`
                : `Projects${teamScoped ? ' (team)' : ''}`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* ── MY ISSUES VIEW ─────────────────────────────────────────── */}
          {view === 'my-issues' && (
            <>
              {issuesState === 'unconfigured' && <UnconfiguredState onClose={onClose} onOpenSettings={onOpenSettings} />}
              {issuesState === 'error' && <ErrorState msg={issuesError} />}
              {issuesState === 'loading' && <LoadingState text="Fetching your issues…" />}
              {issuesState === 'ok' && (
                <>
                  <FilterBar value={filter} onChange={setFilter} placeholder="Filter issues…" count={myIssues.filter(filterIssue(filter)).length} />
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {myIssues.filter(filterIssue(filter)).length === 0 && (
                      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
                        No open issues assigned to you.
                      </div>
                    )}
                    {myIssues.filter(filterIssue(filter)).map(issue => {
                      const isSel = selectedIssue?.id === issue.id;
                      const stateColor = STATE_COLOR[issue.state.type] ?? 'var(--text-faint)';
                      return (
                        <div key={issue.id} onClick={() => setSelectedIssue(isSel ? null : issue)}
                          style={{
                            padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            background: isSel ? 'var(--bg-3)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-2)'; }}
                          onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 9, color: stateColor, flexShrink: 0 }}>●</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace', flexShrink: 0 }}>{issue.team.key}</span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--text-str)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {PRIORITY_LABEL[issue.priority] ?? ''} {issue.title}
                            </span>
                            {issue.project && (
                              <span style={{ fontSize: 9, color: 'var(--text-faint)', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.project.name}</span>
                            )}
                            {isSel && <span style={{ fontSize: 10, color: 'var(--ready)', flexShrink: 0 }}>✓</span>}
                          </div>
                          {issue.state.name && (
                            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, marginLeft: 18 }}>{issue.state.name}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Import controls for selected issue */}
                  {selectedIssue && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 4 }}>
                        Import: <strong style={{ color: 'var(--text-str)' }}>{selectedIssue.title}</strong>
                        {selectedIssue.description && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.4 }}>{selectedIssue.description.slice(0, 150)}{selectedIssue.description.length > 150 ? '…' : ''}</div>}
                      </div>
                      <Field label="Target Vault Project">
                        <select value={target} onChange={e => setTarget(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
                          <option value="__new__">Create new project</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                      </Field>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={runIssueImport} disabled={importing} style={{
                          flex: 1, padding: '7px 0', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent',
                          cursor: importing ? 'not-allowed' : 'pointer', fontSize: 12,
                          color: importing ? 'var(--text-faint)' : 'var(--accent)', fontFamily: 'inherit',
                        }}>
                          {importing ? 'Importing…' : target === '__new__' ? 'Import as new project' : `Add to ${target}`}
                        </button>
                      </div>
                      {output && (
                        <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto', margin: 0 }}>
                          {output}
                        </pre>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── PROJECTS VIEW ──────────────────────────────────────────── */}
          {view === 'projects' && (
            <>
              {projectsState === 'unconfigured' && <UnconfiguredState onClose={onClose} onOpenSettings={onOpenSettings} />}
              {projectsState === 'error' && <ErrorState msg={fetchError} />}
              {projectsState === 'loading' && <LoadingState text="Fetching Linear projects…" />}
              {projectsState === 'ok' && (
                <>
                  <FilterBar value={filter} onChange={setFilter} placeholder="Filter projects…" count={linearProjects.filter(filterProject(filter)).length} />
                  <div style={{ flex: 1, overflow: 'auto', maxHeight: 200 }}>
                    {linearProjects.filter(filterProject(filter)).map(p => {
                      const team = p.teams?.nodes?.[0]?.key;
                      const isSel = selectedProject?.id === p.id;
                      return (
                        <div key={p.id} onClick={() => setSelectedProject(isSel ? null : p)}
                          style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: isSel ? 'var(--bg-3)' : 'transparent' }}
                          onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-2)'; }}
                          onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--text-str)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{p.description}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            {team && <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)', background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>{team}</span>}
                            {p.state && <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{p.state}</span>}
                            {isSel && <span style={{ fontSize: 10, color: 'var(--ready)' }}>✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedProject && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 4 }}>
                        Selected: <strong style={{ color: 'var(--text-str)' }}>{selectedProject.name}</strong>
                      </div>
                    )}
                    <Field label="Target Vault Project">
                      <select value={target} onChange={e => setTarget(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
                        <option value="__new__">Create new project bundle</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                      </select>
                    </Field>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={runProjectImport} disabled={importing || !selectedProject} style={{
                        flex: 1, padding: '7px 0', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent',
                        cursor: importing || !selectedProject ? 'not-allowed' : 'pointer', fontSize: 12,
                        color: importing || !selectedProject ? 'var(--text-faint)' : 'var(--accent)', fontFamily: 'inherit',
                      }}>
                        {importing ? 'Importing…' : selectedProject ? `Import "${selectedProject.name}"` : 'Select a project above'}
                      </button>
                      <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                    {output && (
                      <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', margin: 0 }}>
                        {output}
                      </pre>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function UnconfiguredState({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  return (
    <div style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Linear API key not configured.</div>
      <button onClick={() => { onClose(); onOpenSettings(); }}
        style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'inherit' }}>
        Open Settings
      </button>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return <div style={{ padding: '16px', fontSize: 11, color: 'var(--blocked)', fontFamily: 'monospace' }}>Error: {msg}</div>;
}

function LoadingState({ text }: { text: string }) {
  return <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>{text}</div>;
}

function FilterBar({ value, onChange, placeholder, count }: { value: string; onChange: (v: string) => void; placeholder: string; count: number }) {
  return (
    <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, padding: '4px 9px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function filterIssue(q: string) {
  return (issue: LinearIssue) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return issue.title.toLowerCase().includes(s)
      || issue.team.key.toLowerCase().includes(s)
      || (issue.project?.name ?? '').toLowerCase().includes(s)
      || issue.state.name.toLowerCase().includes(s);
  };
}

function filterProject(q: string) {
  return (p: LinearProject) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.description ?? '').toLowerCase().includes(s);
  };
}
