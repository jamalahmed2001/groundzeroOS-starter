'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutDashboard, Columns, BookOpen, ScrollText, Settings, RefreshCw, Search, Play, Inbox, Terminal, Download, X, MessageSquare, Send, Loader } from 'lucide-react';
import type { GZProject, RunEntry, VaultFileNode } from '@/lib/types';
import TodayView from './TodayView';
import KanbanView from './KanbanView';
import VaultView from './VaultView';
import RunsView from './RunsView';
import SystemView from './SystemView';
import ProjectDetail from './ProjectDetail';
import LinearImportModal from './LinearImportModal';
import Drawer from './Drawer';
import { ToastProvider } from './Toast';

type Tab = 'today' | 'kanban' | 'vault' | 'runs' | 'system';

interface DashData { projects: GZProject[]; runs: RunEntry[]; tree: VaultFileNode[]; lastFetch: number }

const NAV: { id: Tab; label: string; Icon: React.ElementType; shortcut: string }[] = [
  { id: 'today',  label: 'Today',  Icon: LayoutDashboard, shortcut: '1' },
  { id: 'kanban', label: 'Kanban', Icon: Columns,          shortcut: '2' },
  { id: 'vault',  label: 'Vault',  Icon: BookOpen,         shortcut: '3' },
  { id: 'runs',   label: 'Runs',   Icon: ScrollText,       shortcut: '4' },
  { id: 'system', label: 'System', Icon: Settings,         shortcut: '5' },
];

interface CLIOut { cmd: string; output: string; exitCode: number; ts: number; id: string }

// ─── Search constants ─────────────────────────────────────────────────────────

const QUICK_OPEN = [
  { label: "Today's plan", path: `00 - Dashboard/Daily/${new Date().toISOString().split('T')[0]}.md`, icon: '📅' },
  { label: 'Inbox',        path: '00 - Dashboard/Inbox.md',                                           icon: '📥' },
  { label: 'Dashboard',    path: '00 - Dashboard/Central Dashboard.md',                               icon: '🏠' },
];

const FILE_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  phase:     { label: 'phase',     color: 'var(--active)' },
  overview:  { label: 'overview',  color: 'var(--ready)' },
  hub:       { label: 'hub',       color: 'var(--planning)' },
  kanban:    { label: 'kanban',    color: '#e3b341' },
  knowledge: { label: 'knowledge', color: '#8b5cf6' },
  log:       { label: 'log',       color: 'var(--text-faint)' },
  note:      { label: 'note',      color: 'var(--text-faint)' },
};

const FILE_TYPE_ICON: Record<string, string> = {
  phase: '⚙', overview: '📋', hub: '🏛', kanban: '🗂', knowledge: '📚', log: '📜', note: '📝',
};

function highlightMatch(text: string, query: string): string {
  if (!text || !query) return escHtml(text);
  const escaped = escHtml(text);
  const qEsc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${qEsc})`, 'gi'),
    '<strong style="color:var(--text-str);font-weight:600">$1</strong>');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Quick Capture Modal ──────────────────────────────────────────────────────

function QuickCapture({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 40); }, []);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/gz/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(onClose, 600);
    } catch {
      alert('Failed to save to inbox');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, animation: 'fade-in 0.1s ease' }}/>
      <div style={{
        position: 'fixed', top: '24%', left: '50%', transform: 'translateX(-50%)',
        width: 490, background: 'rgba(10,14,22,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)', WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        border: '1px solid var(--glass-b-hi)',
        borderRadius: 'var(--r-xl)', zIndex: 301, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        animation: 'slide-up 0.18s cubic-bezier(0.22,0.61,0.36,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--glass-b)', height: 48 }}>
          <Inbox size={12} style={{ color: 'var(--text-faint)', marginRight: 8, flexShrink: 0 }}/>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>Quick capture → Inbox</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>c</span>
        </div>
        <div style={{ padding: '12px' }}>
          <textarea
            ref={ref}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
            }}
            placeholder="Capture a thought, idea, or task…"
            rows={4}
            style={{
              width: '100%', padding: '11px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--glass-b)', background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-str)', fontSize: 13, fontFamily: 'inherit',
              resize: 'none', outline: 'none', lineHeight: 1.6, caretColor: 'var(--accent)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>⌘↵ to save · Esc to cancel</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onClose} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => void save()} disabled={saving || !text.trim()} style={{
                padding: '5px 14px', borderRadius: 4, border: '1px solid var(--ready)', background: 'transparent',
                cursor: saving || !text.trim() ? 'not-allowed' : 'pointer', fontSize: 11,
                color: saved ? 'var(--done)' : text.trim() ? 'var(--ready)' : 'var(--text-faint)', fontFamily: 'inherit',
              }}>
                {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save to Inbox'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

interface SettingsData {
  agentDriver: string;
  linearKeySet: boolean;
  linearTeamId: string;
  vaultRoot: string;
  llmModel: string;
  openrouterKeySet: boolean;
  lat: number;
  lng: number;
  modelTiers: { light: string; standard: string; heavy: string };
  prompts: { executor: string; decompose: string; atomise: string; extend: string; replan: string; consolidate: string };
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [linearApiKey, setLinearApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    fetch('/api/gz/settings').then(r => r.json()).then(d => setData(d)).catch(() => setData(null));
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      agentDriver: data.agentDriver,
      lat: data.lat,
      lng: data.lng,
      llmModel: data.llmModel,
      linearTeamId: data.linearTeamId,
    };
    if (linearApiKey)     body.linearApiKey     = linearApiKey;
    if (openrouterApiKey) body.openrouterApiKey = openrouterApiKey;
    body.modelTiers = data.modelTiers;
    body.prompts = data.prompts;
    try {
      const res = await fetch('/api/gz/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, animation: 'fade-in 0.12s ease' }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 480, background: 'var(--bg-1)', border: '1px solid var(--border-hi)',
        borderRadius: 8, zIndex: 301, boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: 48, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-str)' }}>Settings</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', marginRight: 10 }}>⌘,</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14}/></button>
        </div>

        {!data ? (
          <div style={{ padding: '24px', color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>

            {/* Agent driver */}
            <Section label="Agent Driver">
              <div style={{ display: 'flex', gap: 6 }}>
                {['claude-code', 'cursor'].map(d => (
                  <button key={d} onClick={() => setData({ ...data, agentDriver: d })} style={{
                    flex: 1, padding: '7px 0', borderRadius: 4,
                    border: `1px solid ${data.agentDriver === d ? 'var(--accent)' : 'var(--border)'}`,
                    background: data.agentDriver === d ? 'var(--accent)18' : 'transparent',
                    cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                    color: data.agentDriver === d ? 'var(--accent)' : 'var(--text-dim)',
                    fontWeight: data.agentDriver === d ? 600 : 400,
                  }}>{d}</button>
                ))}
              </div>
            </Section>

            {/* Linear */}
            <Section label="Linear Integration">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={linearApiKey}
                  onChange={e => setLinearApiKey(e.target.value)}
                  placeholder={data.linearKeySet ? 'API key set — enter new key to replace' : 'lin_api_…'}
                  type="password"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: 10, padding: '7px 0', color: data.linearKeySet ? 'var(--ready)' : 'var(--text-faint)' }}>
                  {data.linearKeySet ? '✓ set' : 'not set'}
                </span>
              </div>
              <FieldInput label="Team ID" value={data.linearTeamId} placeholder="YOUR_TEAM_ID"
                onChange={v => setData({ ...data, linearTeamId: v })}/>
            </Section>

            {/* OpenRouter */}
            <Section label="OpenRouter API Key">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={openrouterApiKey}
                  onChange={e => setOpenrouterApiKey(e.target.value)}
                  placeholder={data.openrouterKeySet ? 'Key set — enter new key to replace' : 'sk-or-…'}
                  type="password"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: 10, padding: '7px 0', color: data.openrouterKeySet ? 'var(--ready)' : 'var(--text-faint)' }}>
                  {data.openrouterKeySet ? '✓ set' : 'not set'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Used for LLM calls (phase planning, daily plan). Get a key at openrouter.ai</div>
            </Section>

            {/* LLM model */}
            <Section label="LLM Model (default)">
              <FieldInput label="" value={data.llmModel} placeholder="anthropic/claude-sonnet-4-6"
                onChange={v => setData({ ...data, llmModel: v })}/>
            </Section>

            {/* Model tiers */}
            <Section label="Model Tiers (complexity routing)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['light', 'standard', 'heavy'] as const).map(tier => (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: tier === 'heavy' ? 'var(--blocked)' : tier === 'standard' ? 'var(--active)' : 'var(--ready)', width: 54, flexShrink: 0, fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 600 }}>{tier}</span>
                    <input
                      value={data.modelTiers[tier]}
                      onChange={e => setData({ ...data, modelTiers: { ...data.modelTiers, [tier]: e.target.value } })}
                      placeholder={tier === 'light' ? 'anthropic/claude-haiku-4-5-20251001' : tier === 'standard' ? 'anthropic/claude-sonnet-4-6' : 'anthropic/claude-opus-4-6'}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Light = simple tasks. Standard = most tasks. Heavy = complex/risky tasks. Leave blank to use defaults.</div>
            </Section>

            {/* Location (for prayer times) */}
            <Section label="Location (Prayer Times)">
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Latitude</div>
                  <input value={data.lat} onChange={e => { const v = parseFloat(e.target.value); setData({ ...data, lat: Number.isFinite(v) ? v : data.lat }); }}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>Longitude</div>
                  <input value={data.lng} onChange={e => { const v = parseFloat(e.target.value); setData({ ...data, lng: Number.isFinite(v) ? v : data.lng }); }}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}/>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                Default: London (51.5074, -0.1278). Used for prayer time calculation.
              </div>
            </Section>

            {/* Vault root (read-only info) */}
            {/* System Prompts */}
            <Section label="System Prompts">
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 8 }}>Customise the system prompts for each stage. Leave blank to use defaults.</div>
              {([
                { key: 'executor',    label: 'Executor (agent driver)', placeholder: 'System prompt for the coding agent during task execution' },
                { key: 'decompose',   label: 'Decompose (Overview → phases)', placeholder: 'System prompt for breaking Overview into phase stubs' },
                { key: 'atomise',     label: 'Atomise (phase → tasks)', placeholder: 'System prompt for generating concrete tasks from a phase' },
                { key: 'extend',      label: 'Extend (add new phases)', placeholder: 'System prompt for adding phases to existing project' },
                { key: 'replan',      label: 'Replan (blocked → new tasks)', placeholder: 'System prompt for replanning after a phase blocks' },
                { key: 'consolidate', label: 'Consolidate (logs → knowledge)', placeholder: 'System prompt for extracting learnings from logs' },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>
                  <textarea
                    value={(data.prompts as Record<string, string>)?.[key] ?? ''}
                    onChange={e => setData({ ...data, prompts: { ...(data.prompts ?? {}), [key]: e.target.value } })}
                    placeholder={placeholder}
                    rows={3}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 10, outline: 'none', fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.5 }}
                  />
                </div>
              ))}
            </Section>

            <Section label="Vault Root">
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-faint)', padding: '6px 8px', background: 'var(--bg-2)', borderRadius: 4, wordBreak: 'break-all' }}>
                {data.vaultRoot || 'Not set'}
              </div>
            </Section>

            <button onClick={() => void save()} disabled={saving} style={{
              padding: '8px', borderRadius: 5, border: '1px solid var(--ready)', background: 'transparent',
              cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12,
              color: saved ? 'var(--done)' : 'var(--ready)', fontFamily: 'inherit', fontWeight: 500,
            }}>
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function FieldInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}/>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function Shell() {
  const [tab, setTab]                   = useState<Tab>('today');
  const [data, setData]                 = useState<DashData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [drawerPath, setDrawerPath]     = useState<string | null>(null);
  const [detailProject, setDetailProject] = useState<GZProject | null>(null);
  const [detailTab, setDetailTab]       = useState<'phases' | 'scope' | 'diff' | 'actions'>('phases');
  const [linearOpen, setLinearOpen]     = useState(false);
  const [captureOpen, setCaptureOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cliOpen, setCliOpen]           = useState(false);
  const [cliLog, setCliLog]             = useState<CLIOut[]>([]);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQ, setSearchQ]           = useState('');
  const [searchHits, setSearchHits]     = useState<Array<{ path: string; label: string; folder: string; fileType: string; context: string; matchIn: string; score: number }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSel, setSearchSel]       = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchListRef = useRef<HTMLDivElement>(null);

  // Chat pane state
  const [chatOpen, setChatOpen]             = useState(false);
  const [chatMessages, setChatMessages]     = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput]           = useState('');
  const [chatSending, setChatSending]       = useState(false);
  const [chatProject, setChatProject]       = useState<string | undefined>(undefined);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, ru, tr] = await Promise.all([
        fetch('/api/gz/projects').then(r => r.json()),
        fetch('/api/gz/runs').then(r => r.json()),
        fetch('/api/gz/vault-tree').then(r => r.json()),
      ]);
      setData({ projects: pr.projects ?? [], runs: ru.runs ?? [], tree: tr.tree ?? [], lastFetch: Date.now() });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => {
    const id = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const tabKeys: Record<string, Tab> = { '1':'today','2':'kanban','3':'vault','4':'runs','5':'system' };

      if (e.key === 'Escape') {
        // Dismiss topmost overlay only (priority order)
        if (settingsOpen)          { setSettingsOpen(false); return; }
        if (captureOpen)           { setCaptureOpen(false); return; }
        if (linearOpen)            { setLinearOpen(false); return; }
        if (searchOpen)            { setSearchOpen(false); setSearchQ(''); setSearchHits([]); return; }
        if (detailProject)         { setDetailProject(null); return; }
        if (drawerPath)            { setDrawerPath(null); return; }
        if (chatOpen)              { setChatOpen(false); return; }
        if (cliOpen)               { setCliOpen(false); return; }
        return;
      }
      if (inInput) return;

      if (tabKeys[e.key]) { setTab(tabKeys[e.key]); return; }
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { void fetchData(); return; }
      if (e.key === 'i') { setDrawerPath('00 - Dashboard/Inbox.md'); return; }
      if (e.key === 'c') { setCaptureOpen(o => !o); return; }
      if (e.key === 'l') { setLinearOpen(o => !o); return; }
      if (e.key === '.') { setChatOpen(o => !o); return; }
      if (e.key === '`') { setCliOpen(o => !o); return; }
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSettingsOpen(s => !s); return; }
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') { e.preventDefault(); setSearchOpen(s => !s); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchData, settingsOpen, captureOpen, linearOpen, searchOpen, detailProject, drawerPath, chatOpen, cliOpen]);

  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 40); }, [searchOpen]);

  const cliIdRef = useRef(0);
  const runCLI = useCallback(async (cmd: string, args: string[] = []) => {
    const id = `cli_${++cliIdRef.current}_${Date.now()}`;
    const entry: CLIOut = { cmd: [cmd, ...args].join(' '), output: '…running', exitCode: -1, ts: Date.now(), id };
    setCliLog(l => [entry, ...l.slice(0, 9)]);
    setCliOpen(true);
    try {
      const res = await fetch('/api/gz/cli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd, args }) });
      const d = await res.json() as CLIOut;
      setCliLog(l => l.map(x => x.id === entry.id ? { ...entry, ...d } : x));
    } catch {
      setCliLog(l => l.map(x => x.id === entry.id ? { ...entry, output: 'Request failed', exitCode: 1 } : x));
    }
    void fetchData();
  }, [fetchData]);

  const allPhases  = data?.projects.flatMap(p => p.phases) ?? [];
  const activeCount  = allPhases.filter(p => p.status === 'active').length;
  const blockedCount = allPhases.filter(p => p.status === 'blocked').length;

  // Debounced full-text vault search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQ.length < 2) { setSearchHits([]); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/gz/search?q=${encodeURIComponent(searchQ)}`);
        const d = await res.json() as { hits: Array<{ path: string; label: string; folder: string; fileType: string; context: string; matchIn: string; score: number }> };
        setSearchHits(d.hits ?? []);
        setSearchSel(0);
      } catch { setSearchHits([]); }
      finally { setSearchLoading(false); }
    }, 260);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQ]);

  // Chat auto-scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => { if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 60); }, [chatOpen]);

  // Set chat project context when viewing a project
  useEffect(() => {
    if (detailProject) setChatProject(detailProject.id);
  }, [detailProject]);

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatInput('');
    setChatSending(true);
    const newMessages = [...chatMessages, { role: 'user' as const, content: msg }];
    setChatMessages(newMessages);

    // Find repo path for current project
    const proj = data?.projects.find(p => p.id === chatProject);
    const repoPath = proj?.repoPath;

    try {
      const res = await fetch('/api/gz/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, projectId: chatProject, repoPath }),
      });
      const d = await res.json() as { reply?: string; error?: string };
      if (d.error) {
        setChatMessages(m => [...m, { role: 'assistant', content: `Error: ${d.error}` }]);
      } else {
        setChatMessages(m => [...m, { role: 'assistant', content: d.reply ?? '(no response)' }]);
      }
    } catch {
      setChatMessages(m => [...m, { role: 'assistant', content: 'Failed to reach agent. Check connection.' }]);
    }
    setChatSending(false);
  }, [chatInput, chatSending, chatMessages, chatProject, data]);

  return (
    <div className="gzos-shell" style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>

      {/* Sidebar — liquid glass (becomes bottom tab bar on mobile) */}
      <aside className="gzos-sidebar" style={{
        width: 192, flexShrink: 0,
        background: 'rgba(10,14,22,0.82)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderRight: '1px solid var(--glass-b)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="gzos-sidebar-header" style={{ height: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-str)', letterSpacing: '0.12em', fontFamily: 'monospace' }}>GZOS</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>dashboard</span>
        </div>

        <nav className="gzos-sidebar-nav" style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ id, label, Icon, shortcut }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} className="gzos-nav-btn" style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 'var(--r-sm)',
                border: active ? '1px solid rgba(77,156,248,0.22)' : '1px solid transparent',
                cursor: 'pointer', width: '100%',
                background: active ? 'rgba(77,156,248,0.1)' : 'transparent',
                color: active ? 'var(--text-str)' : 'var(--text-dim)',
                fontSize: 12, fontWeight: active ? 500 : 400, fontFamily: 'inherit',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--glass-hi)'; e.currentTarget.style.color = 'var(--text-str)'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)'; } }}
              >
                <Icon size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}/>
                <span className="gzos-nav-label" style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                <span className="gzos-nav-shortcut" style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{shortcut}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom shortcuts */}
        <div className="gzos-sidebar-actions" style={{ padding: '8px', borderTop: '1px solid var(--glass-b)' }}>
          {[
            { Icon: Inbox,    label: 'Inbox',         key: 'i',  action: () => setDrawerPath('00 - Dashboard/Inbox.md') },
            { Icon: Terminal, label: 'Capture',       key: 'c',  action: () => setCaptureOpen(o => !o) },
            { Icon: Download, label: 'Linear Import', key: 'l',  action: () => setLinearOpen(true) },
            { Icon: Search,   label: 'Search',        key: '⌘K', action: () => setSearchOpen(s => !s) },
            { Icon: Settings, label: 'Settings',      key: '⌘,', action: () => setSettingsOpen(s => !s) },
          ].map(({ Icon, label, key, action }) => (
            <button key={label} onClick={action} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', width: '100%',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-faint)', fontSize: 11, borderRadius: 'var(--r-sm)', fontFamily: 'inherit',
              transition: 'color 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-dim)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
            >
              <Icon size={11} style={{ flexShrink: 0 }}/>
              <span style={{ flex: 1 }}>{label}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace' }}>{key}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header — glass */}
        <header className="gzos-header" style={{
          height: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
          borderBottom: '1px solid var(--glass-b)',
          background: 'rgba(10,14,22,0.7)',
          backdropFilter: 'blur(16px) saturate(150%)',
          WebkitBackdropFilter: 'blur(16px) saturate(150%)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-str)' }}>{NAV.find(n => n.id === tab)?.label}</span>
          {data && (
            <div style={{ display: 'flex', gap: 8 }}>
              {activeCount > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--active)' }}>
                  <span className="pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--active)', display: 'inline-block' }}/>
                  {activeCount} active
                </span>
              )}
              {blockedCount > 0 && <span style={{ fontSize: 11, color: 'var(--blocked)' }}>· {blockedCount} blocked</span>}
            </div>
          )}
          <div style={{ flex: 1 }}/>
          {[
            { label: '▶ Run',  cmd: 'run',    color: 'var(--ready)' },
            { label: 'Status', cmd: 'status', color: 'var(--text-dim)' },
          ].map(({ label, cmd, color }) => (
            <button key={cmd} onClick={() => runCLI(cmd)} style={{ padding: '4px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-b)', background: 'var(--glass)', cursor: 'pointer', fontSize: 11, color, fontFamily: 'inherit', transition: 'border-color 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-b-hi)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-b)')}
            >{label}</button>
          ))}
          {data?.lastFetch && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
              {new Date(data.lastFetch).toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => setChatOpen(o => !o)} title="Chat with agent (.)"
            style={{ padding: '4px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${chatOpen ? 'rgba(77,156,248,0.4)' : 'var(--glass-b)'}`, background: chatOpen ? 'rgba(77,156,248,0.08)' : 'var(--glass)', cursor: 'pointer', fontSize: 11, color: chatOpen ? 'var(--accent)' : 'var(--text-dim)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, transition: 'border-color 0.12s' }}>
            <MessageSquare size={11}/> Ask
          </button>
          <button onClick={() => void fetchData()} style={{ width: 26, height: 26, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={11} className={loading ? 'spin' : ''}/>
          </button>
        </header>

        {/* Content + Chat side-by-side */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Main content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <main style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {loading && !data ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 12 }}>Loading vault…</div>
              ) : (
                <>
                  {tab === 'today'  && <TodayView  projects={data?.projects ?? []} onOpenFile={setDrawerPath} onRunCLI={runCLI}/>}
                  {tab === 'kanban' && <KanbanView projects={data?.projects ?? []} onOpenFile={setDrawerPath} onRefresh={fetchData} onOpenProject={setDetailProject} onOpenProjectDiff={p => { setDetailProject(p); setDetailTab('diff'); }} onRunCLI={runCLI}/>}
                  {tab === 'vault'  && <VaultView  tree={data?.tree ?? []}         onOpenFile={setDrawerPath}/>}
                  {tab === 'runs'   && <RunsView   runs={data?.runs ?? []}          onOpenFile={setDrawerPath}/>}
                  {tab === 'system' && <SystemView onRunCLI={runCLI}/>}
                </>
              )}
            </main>

            {/* CLI panel */}
            {cliOpen && (
              <div style={{ height: 185, borderTop: '1px solid var(--glass-b)', background: 'rgba(5,8,14,0.92)', backdropFilter: 'blur(16px)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--glass-b)', gap: 8 }}>
                  <Terminal size={10} style={{ color: 'var(--accent)' }}/>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', flex: 1 }}>gzos</span>
                  {(['heal', 'doctor', 'logs', 'status'] as const).map(cmd => (
                    <button key={cmd} onClick={() => runCLI(cmd)} style={{ padding: '2px 7px', borderRadius: 'var(--r-sm)', border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {cmd}
                    </button>
                  ))}
                  <button onClick={() => setCliOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px', fontFamily: 'monospace', fontSize: 10 }}>
                  {cliLog.length === 0
                    ? <span style={{ color: 'var(--text-faint)' }}>No commands yet. Use buttons above or keyboard shortcuts.</span>
                    : cliLog.map((l, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ color: 'var(--accent)', marginBottom: 1 }}>$ gzos {l.cmd}</div>
                          <pre style={{ color: l.exitCode === 0 ? 'var(--text-dim)' : 'var(--blocked)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                            {l.output.slice(0, 800)}
                          </pre>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}
          </div>

          {/* Chat pane — persistent right panel */}
          {chatOpen && (
            <div className="gzos-chat-pane" style={{
              width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid var(--glass-b)',
              background: 'rgba(8,12,20,0.95)',
              backdropFilter: 'blur(16px)',
            }}>
              {/* Chat header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--glass-b)', gap: 8, flexShrink: 0 }}>
                <MessageSquare size={12} style={{ color: 'var(--accent)' }}/>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-str)', flex: 1 }}>Ask</span>
                {/* Project scope selector */}
                <select value={chatProject ?? ''} onChange={e => setChatProject(e.target.value || undefined)}
                  style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'var(--bg-2)', color: 'var(--text-dim)', fontSize: 10, outline: 'none', maxWidth: 140 }}>
                  <option value="">All projects</option>
                  {(data?.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
                <button onClick={() => { setChatMessages([]); }} title="Clear chat"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 10 }}>clear</button>
                <button onClick={() => setChatOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {chatMessages.length === 0 && (
                  <div style={{ color: 'var(--text-faint)', fontSize: 11, textAlign: 'center', padding: '30px 10px', lineHeight: 1.6 }}>
                    Ask about any project — scope, architecture, next steps, risks.
                    <br/><span style={{ fontSize: 10, opacity: 0.7 }}>Uses {(data?.projects ?? []).find(p => p.id === chatProject)?.repoPath ? 'agent with repo access' : 'vault context'}. Press <kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--glass-b)', fontSize: 9 }}>.</kbd> to toggle.</span>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    padding: '8px 11px',
                    borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: m.role === 'user' ? 'rgba(77,156,248,0.12)' : 'var(--glass)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(77,156,248,0.2)' : 'var(--glass-b)'}`,
                    fontSize: 12, color: 'var(--text)', lineHeight: 1.55,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.content}
                  </div>
                ))}
                {chatSending && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-faint)', fontSize: 11 }}>
                    <Loader size={11} className="spin"/> Thinking…
                  </div>
                )}
                <div ref={chatEndRef}/>
              </div>

              {/* Input */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--glass-b)', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <textarea ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                    placeholder="Ask about scope, architecture, next steps…"
                    rows={2}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.4 }}/>
                  <button onClick={() => void sendChat()} disabled={chatSending || !chatInput.trim()}
                    style={{ width: 34, borderRadius: 8, border: '1px solid var(--glass-b)', background: chatInput.trim() ? 'rgba(77,156,248,0.12)' : 'transparent', cursor: chatInput.trim() ? 'pointer' : 'default', color: chatInput.trim() ? 'var(--accent)' : 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Send size={13}/>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search modal — full-text vault search */}
      {searchOpen && (
        <>
          <div onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchHits([]); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, animation: 'fade-in 0.1s ease' }}/>
          <div
            className="gzos-search-modal"
            style={{
              position: 'fixed', top: '14%', left: '50%', transform: 'translateX(-50%)',
              width: 560, background: 'rgba(10,14,22,0.98)',
              backdropFilter: 'blur(32px) saturate(200%)', WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1px solid var(--glass-b-hi)', borderRadius: 'var(--r-xl)',
              zIndex: 201, overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              animation: 'slide-up 0.18s cubic-bezier(0.22,0.61,0.36,1)',
            }}
            onKeyDown={e => {
              const total = searchQ.length > 1 ? searchHits.length : QUICK_OPEN.length;
              if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSel(s => Math.min(s + 1, total - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setSearchSel(s => Math.max(s - 1, 0)); }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (searchQ.length > 1) {
                  const h = searchHits[searchSel];
                  if (h) { setDrawerPath(h.path); setSearchOpen(false); setSearchQ(''); setSearchHits([]); }
                } else {
                  const s = QUICK_OPEN[searchSel];
                  if (s) { setDrawerPath(s.path); setSearchOpen(false); }
                }
              }
            }}
          >
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--glass-b)' }}>
              <Search size={13} style={{ color: searchLoading ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0, transition: 'color 0.15s' }}/>
              <input ref={searchRef} value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSearchSel(0); }}
                placeholder="Search vault — notes, phases, projects…"
                style={{ flex: 1, border: 'none', background: 'transparent', padding: '13px 11px', fontSize: 13.5, color: 'var(--text-str)', outline: 'none', fontFamily: 'inherit' }}/>
              {searchQ && (
                <button onClick={() => { setSearchQ(''); setSearchHits([]); setSearchSel(0); searchRef.current?.focus(); }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', padding: '2px 4px', fontSize: 12 }}>×</button>
              )}
              <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 6 }}>Esc</span>
            </div>

            {/* Results list */}
            <div ref={searchListRef} style={{ maxHeight: 380, overflow: 'auto' }}>

              {/* Search hits */}
              {searchQ.length > 1 && searchHits.map((h, i) => {
                const isSel = i === searchSel;
                const badge = FILE_TYPE_BADGE[h.fileType] ?? { label: h.fileType, color: 'var(--text-faint)' };
                // Highlight match in context
                const hiCtx = highlightMatch(h.context, searchQ);
                return (
                  <div key={h.path}
                    onClick={() => { setDrawerPath(h.path); setSearchOpen(false); setSearchQ(''); setSearchHits([]); }}
                    onMouseEnter={() => setSearchSel(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                      cursor: 'pointer', borderBottom: '1px solid var(--glass-b)',
                      background: isSel ? 'var(--glass-hi)' : 'transparent',
                      borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent',
                      transition: 'background 0.08s',
                    }}
                  >
                    {/* File icon */}
                    <div style={{ fontSize: 16, flexShrink: 0, opacity: 0.7 }}>{FILE_TYPE_ICON[h.fileType] ?? '📄'}</div>
                    {/* Main */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: isSel ? 'var(--text-str)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {h.label}
                        </span>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${badge.color}44`, color: badge.color, flexShrink: 0, fontFamily: 'monospace' }}>
                          {badge.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text-faint)', opacity: 0.6, marginRight: 5 }}>{h.folder}</span>
                        {h.context && (
                          <span dangerouslySetInnerHTML={{ __html: '· ' + hiCtx }}/>
                        )}
                      </div>
                    </div>
                    {isSel && <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>↵</span>}
                  </div>
                );
              })}

              {/* No results */}
              {searchQ.length > 1 && !searchLoading && searchHits.length === 0 && (
                <div style={{ padding: '20px 14px', color: 'var(--text-faint)', fontSize: 12, textAlign: 'center' }}>
                  No results for <strong style={{ color: 'var(--text-dim)' }}>&ldquo;{searchQ}&rdquo;</strong>
                </div>
              )}

              {/* Loading indicator */}
              {searchQ.length > 1 && searchLoading && searchHits.length === 0 && (
                <div style={{ padding: '16px 14px', color: 'var(--text-faint)', fontSize: 11 }}>Searching…</div>
              )}

              {/* Quick open when idle */}
              {searchQ.length < 2 && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 14px 6px' }}>Quick open</div>
                  {QUICK_OPEN.map((s, i) => {
                    const isSel = i === searchSel;
                    return (
                      <div key={s.path} onClick={() => { setDrawerPath(s.path); setSearchOpen(false); }}
                        onMouseEnter={() => setSearchSel(i)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px',
                          cursor: 'pointer', fontSize: 12, color: isSel ? 'var(--text-str)' : 'var(--text-dim)',
                          background: isSel ? 'var(--glass-hi)' : 'transparent',
                          borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: 14, opacity: 0.7 }}>{s.icon}</span>
                        {s.label}
                        {isSel && <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>↵</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer hint */}
              <div style={{ padding: '6px 14px', borderTop: '1px solid var(--glass-b)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>↑↓ navigate</span>
                <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>↵ open</span>
                <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>Esc close</span>
                {searchHits.length > 0 && <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 'auto', fontFamily: 'monospace' }}>{searchHits.length} results</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Overlays */}
      {captureOpen  && <QuickCapture onClose={() => setCaptureOpen(false)}/>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)}/>}

      {detailProject && (
        <ProjectDetail project={detailProject} onClose={() => { setDetailProject(null); setDetailTab('phases'); }} onOpenFile={setDrawerPath} onRunCLI={runCLI} onRefresh={fetchData} initialTab={detailTab}/>
      )}

      {linearOpen && (
        <LinearImportModal
          projects={data?.projects ?? []}
          onClose={() => setLinearOpen(false)}
          onRefresh={fetchData}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {drawerPath && <Drawer path={drawerPath} onClose={() => setDrawerPath(null)} onWikilinkClick={target => setDrawerPath(target.endsWith('.md') ? target : target + '.md')}/>}
      <ToastProvider/>
    </div>
  );
}

function flattenTree(nodes: VaultFileNode[]): VaultFileNode[] {
  const out: VaultFileNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'file') out.push(n);
    if (n.children) out.push(...flattenTree(n.children));
  }
  return out;
}
