'use client';

import { useEffect, useState, useRef } from 'react';
import { Play, AlertCircle, Inbox, ChevronDown, ChevronRight, Send, Mail, FileEdit } from 'lucide-react';
import { toast } from './Toast';
import type { GZProject, GZPhase, DailyPlan, InboxItem } from '@/lib/types';
import { statusColor as sc } from '@/lib/colors';

interface Props {
  projects: GZProject[];
  onOpenFile: (path: string) => void;
  onRunCLI: (cmd: string, args?: string[]) => void;
  onOpenEmail: (box?: 'inbox' | 'drafts') => void;
}

// ─── Prayer times (pure JS, London default) ───────────────────────────────────

function toJulianDay(date: Date): number {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) * Math.PI / 180;
  const q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
  const e = (23.439 - 0.00000036 * D) * Math.PI / 180;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const eqt = (q - (180 / Math.PI) * RA) / 15;
  return { dec, eqt };
}

function hourAngle(lat: number, dec: number, altitude: number): number | null {
  const latR = lat * Math.PI / 180;
  const altR = altitude * Math.PI / 180;
  const cosH = (Math.sin(altR) - Math.sin(latR) * Math.sin(dec)) / (Math.cos(latR) * Math.cos(dec));
  if (Math.abs(cosH) > 1) return null;
  return (Math.acos(cosH) * 180 / Math.PI) / 15;
}

function asrAngle(lat: number, dec: number, shadow = 1): number | null {
  const latR = lat * Math.PI / 180;
  const alt = Math.atan(1 / (shadow + Math.tan(Math.abs(latR - dec))));
  return hourAngle(lat, dec, alt * 180 / Math.PI);
}

function calcPrayerTimes(date: Date, lat: number, lng: number) {
  const jd = toJulianDay(date);
  const { dec, eqt } = sunPosition(jd);
  const tzOff = -date.getTimezoneOffset() / 60;
  const noon = 12 - lng / 15 - eqt;

  const toTime = (h: number | null): string => {
    if (h === null) return '--:--';
    const local = ((h + tzOff) % 24 + 24) % 24;
    const hh = Math.floor(local);
    const mm = Math.floor((local - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  return [
    { name: 'Fajr',    time: toTime(hourAngle(lat, dec, -18) !== null ? noon - hourAngle(lat, dec, -18)! : null), color: '#4a9eff' },
    { name: 'Sunrise', time: toTime(hourAngle(lat, dec, -0.833) !== null ? noon - hourAngle(lat, dec, -0.833)! : null), color: '#e3b341' },
    { name: 'Dhuhr',   time: toTime(noon), color: '#e3b341' },
    { name: 'Asr',     time: toTime(asrAngle(lat, dec) !== null ? noon + asrAngle(lat, dec)! : null), color: '#e3953d' },
    { name: 'Maghrib', time: toTime(hourAngle(lat, dec, -0.833) !== null ? noon + hourAngle(lat, dec, -0.833)! : null), color: '#8b5cf6' },
    { name: 'Isha',    time: toTime(hourAngle(lat, dec, -17) !== null ? noon + hourAngle(lat, dec, -17)! : null), color: '#4a9eff' },
  ];
}

function PrayerTimesWidget({ lat, lng }: { lat: number; lng: number }) {
  const [now, setNow] = useState(new Date());
  const times = calcPrayerTimes(now, lat, lng);

  // Tick every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Find current/next prayer
  const timeMins = times.map(t => {
    const [h, m] = t.time.split(':').map(Number);
    return isNaN(h) ? -1 : h * 60 + m;
  });
  const nextIdx = timeMins.findIndex(m => m > nowMins);
  const currentIdx = nextIdx === -1 ? times.length - 1 : nextIdx - 1;

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel label="Prayer Times" color="var(--text-faint)"/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px 8px' }}>
        {times.map((p, i) => {
          const isCurrent = i === currentIdx;
          const isNext    = i === nextIdx;
          return (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 7px', borderRadius: 5,
              background: isCurrent ? p.color + '18' : isNext ? 'var(--bg-2)' : 'transparent',
              border: isCurrent ? `1px solid ${p.color}44` : isNext ? '1px solid var(--border)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 10, color: isCurrent ? p.color : isNext ? 'var(--text-dim)' : 'var(--text-faint)', fontWeight: isCurrent ? 600 : 400 }}>
                {p.name}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: isCurrent ? p.color : 'var(--text-faint)', fontWeight: isCurrent ? 700 : 400 }}>
                {p.time}
                {isNext && <span style={{ fontSize: 8, color: 'var(--ready)', marginLeft: 3 }}>next</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Phase rows (left panel) ──────────────────────────────────────────────────

function PhaseRow({ phase, projectId, onOpen, onRun }: { phase: GZPhase; projectId: string; onOpen: (p: string) => void; onRun?: () => void }) {
  const pct = phase.tasksTotal > 0 ? Math.round((phase.tasksDone / phase.tasksTotal) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)44' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc(phase.status), flexShrink: 0,
        boxShadow: phase.status === 'active' ? `0 0 5px ${sc(phase.status)}99` : 'none' }}/>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpen(phase.path)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', flexShrink: 0 }}>{projectId}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            P{phase.phaseNum} — {phase.phaseName}
          </span>
        </div>
        {phase.nextTask && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {phase.nextTask}</div>
        )}
      </div>
      {phase.tasksTotal > 0 && (
        <div style={{ width: 32, height: 2, borderRadius: 1, background: 'var(--bg-3)', flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: sc(phase.status), borderRadius: 1 }}/>
        </div>
      )}
      {onRun && (
        <button onClick={onRun} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${sc(phase.status)}`, background: 'transparent', cursor: 'pointer', fontSize: 9, color: sc(phase.status), display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, fontFamily: 'inherit' }}>
          <Play size={7}/> Run
        </button>
      )}
    </div>
  );
}

// ─── Daily plan renderer ──────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  morning:   '#3fb950',
  afternoon: '#58a6ff',
  'if time': '#8b949e',
  evening:   '#e3b341',
  night:     '#8b5cf6',
};

function sectionColor(heading: string): string {
  const lower = heading.toLowerCase();
  for (const [key, color] of Object.entries(SECTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return 'var(--text-dim)';
}

interface ParsedItem {
  type: 'h1' | 'h2' | 'h3' | 'numbered' | 'bullet' | 'task-done' | 'task-open' | 'table' | 'text' | 'spacer';
  text: string;
  num?: number;
  rawLineIndex?: number;
}

function parsePlan(raw: string): ParsedItem[] {
  const lines = raw.split('\n');
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') { bodyStart = i + 1; break; }
    }
  }
  const items: ParsedItem[] = [];
  for (let li = bodyStart; li < lines.length; li++) {
    const t = lines[li].trim();
    if (!t) { if (items.at(-1)?.type !== 'spacer') items.push({ type: 'spacer', text: '', rawLineIndex: li }); continue; }
    if (t.startsWith('# '))   { items.push({ type: 'h1',   text: t.slice(2),  rawLineIndex: li }); continue; }
    if (t.startsWith('## '))  { items.push({ type: 'h2',   text: t.slice(3),  rawLineIndex: li }); continue; }
    if (t.startsWith('### ')) { items.push({ type: 'h3',   text: t.slice(4),  rawLineIndex: li }); continue; }
    const num = /^(\d+)\.\s+(.+)/.exec(t);
    if (num) { items.push({ type: 'numbered', text: num[2], num: Number(num[1]), rawLineIndex: li }); continue; }
    if (/^- \[x\]/i.test(t)) { items.push({ type: 'task-done', text: t.replace(/^- \[x\]\s*/i, ''), rawLineIndex: li }); continue; }
    if (/^- \[ \]/.test(t))  { items.push({ type: 'task-open', text: t.replace(/^- \[ \]\s*/, ''),  rawLineIndex: li }); continue; }
    if (t.startsWith('|'))   { items.push({ type: 'table',  text: t, rawLineIndex: li }); continue; }
    if (t.startsWith('- '))  { items.push({ type: 'bullet', text: t.slice(2), rawLineIndex: li }); continue; }
    items.push({ type: 'text', text: t, rawLineIndex: li });
  }
  return items;
}

function renderInline(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-str)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-2);padding:1px 4px;border-radius:3px;font-size:10px;color:var(--accent)">$1</code>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span style="color:var(--accent)">$1</span>');
}

function extractProjectTag(text: string): { tag: string | null; rest: string } {
  const m = /^\*?\*?\[([^\]]+)\]\*?\*?\s*(.*)/.exec(text);
  if (m) return { tag: m[1], rest: m[2] };
  return { tag: null, rest: text };
}

function DailyPlanView({ raw, planPath, projects, onOpenFile, onRunCLI, onToggleTask }: {
  raw: string; planPath: string; projects: GZProject[]; onOpenFile: (p: string) => void; onRunCLI: (cmd: string, args?: string[]) => void;
  onToggleTask: (lineIdx: number, newDone: boolean) => Promise<void>;
}) {
  const items = parsePlan(raw);

  const phaseMap = new Map<string, GZPhase & { projectId: string }>();
  for (const p of projects) {
    for (const ph of p.phases) {
      phaseMap.set(`${p.id}:${ph.phaseNum}`, { ...ph, projectId: p.id });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => {
        switch (item.type) {
          case 'spacer': return <div key={i} style={{ height: 6 }}/>;

          case 'h1': return (
            <div key={i} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-str)', marginBottom: 4, marginTop: 6 }}>{item.text}</div>
          );

          case 'h2': {
            const color = sectionColor(item.text);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.text}</span>
                <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}44, transparent)` }}/>
              </div>
            );
          }

          case 'h3': return (
            <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginTop: 10, marginBottom: 3 }}>{item.text}</div>
          );

          case 'numbered': {
            const { tag, rest } = extractProjectTag(item.text);
            const phMatch = /P(\d+)\s*[—–-]\s*(.+?)(?:\s*—|$)/.exec(rest);
            let runPhase: (GZPhase & { projectId: string }) | undefined;
            if (tag && phMatch) runPhase = phaseMap.get(`${tag}:${Number(phMatch[1])}`);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)44' }}>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-faint)', flexShrink: 0, minWidth: 18, paddingTop: 2 }}>{item.num}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {tag && (
                    <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)', color: 'var(--accent)', marginRight: 6 }}>{tag}</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-str)' }} dangerouslySetInnerHTML={{ __html: renderInline(rest) }}/>
                </div>
                {runPhase && (
                  <button onClick={() => onRunCLI('run', ['--project', runPhase!.projectId])} style={{
                    padding: '2px 6px', borderRadius: 3, border: `1px solid ${sc(runPhase.status)}`, background: 'transparent',
                    cursor: 'pointer', fontSize: 9, color: sc(runPhase.status), flexShrink: 0, fontFamily: 'inherit',
                  }}>
                    {runPhase.status === 'active' ? '● live' : '▶ run'}
                  </button>
                )}
              </div>
            );
          }

          case 'task-done': return (
            <button key={i} onClick={() => item.rawLineIndex !== undefined && void onToggleTask(item.rawLineIndex, false)}
              style={{ display: 'flex', gap: 6, padding: '3px 6px', fontSize: 12, color: 'var(--text-faint)', textDecoration: 'line-through', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', borderRadius: 5 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hi)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: 'var(--done)', flexShrink: 0 }}>✓</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }}/>
            </button>
          );

          case 'task-open': return (
            <button key={i} onClick={() => item.rawLineIndex !== undefined && void onToggleTask(item.rawLineIndex, true)}
              style={{ display: 'flex', gap: 6, padding: '3px 6px', fontSize: 12, color: 'var(--text-dim)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', borderRadius: 5 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-hi)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>○</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }}/>
            </button>
          );

          case 'bullet': return (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0', fontSize: 12, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>·</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }}/>
            </div>
          );

          case 'table': return (
            <div key={i} style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', padding: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.text}
            </div>
          );

          default: return item.text ? (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', padding: '1px 0' }} dangerouslySetInnerHTML={{ __html: renderInline(item.text) }}/>
          ) : null;
        }
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TodayView({ projects, onOpenFile, onRunCLI, onOpenEmail }: Props) {
  const [plan, setPlan]           = useState<DailyPlan | null>(null);
  const [inbox, setInbox]         = useState<InboxItem[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [emailSummary, setEmailSummary] = useState<{ unread: number; drafts: number } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [settings, setSettings]   = useState<{ lat: number; lng: number } | null>(null);
  const [direction, setDirection]       = useState('');
  const [savedDirections, setSavedDirections] = useState<string[]>([]);
  const [sending, setSending]           = useState(false);
  const [generating, setGenerating]     = useState(false);
  const dirRef = useRef<HTMLTextAreaElement>(null);

  const todayKey = new Date().toISOString().split('T')[0];
  const planPath = `00 - Dashboard/Daily/${todayKey}.md`;

  const DIRECTION_PATH = '00 - Dashboard/.plan-direction.md';

  const loadDirection = () => {
    fetch(`/api/onyx/vault-file?path=${encodeURIComponent(DIRECTION_PATH)}`)
      .then(r => r.ok ? r.json() as Promise<{ content?: string }> : null)
      .then(d => {
        if (!d?.content) { setSavedDirections([]); return; }
        const lines = d.content.split('\n').map(l => l.trim()).filter(Boolean);
        setSavedDirections(lines);
      })
      .catch(() => setSavedDirections([]));
  };

  useEffect(() => {
    fetch('/api/onyx/today')
      .then(r => r.json())
      .then((d: { plan: DailyPlan; inbox: InboxItem[] }) => { setPlan(d.plan); setInbox(d.inbox); })
      .catch(console.error);
    fetch('/api/onyx/settings')
      .then(r => r.json())
      .then((d: { lat?: number; lng?: number }) => setSettings({ lat: d.lat ?? 51.5074, lng: d.lng ?? -0.1278 }))
      .catch(() => setSettings({ lat: 51.5074, lng: -0.1278 }));
    fetch('/api/mailcow/summary', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { unread?: number; drafts?: number } | null) => {
        if (!d || typeof d.unread !== 'number' || typeof d.drafts !== 'number') return;
        setEmailSummary({ unread: d.unread, drafts: d.drafts });
      })
      .catch(() => undefined);
    loadDirection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTask = async (lineIdx: number, newDone: boolean) => {
    if (!plan?.raw) return;
    const prev = plan.raw;
    const lines = plan.raw.split('\n');
    lines[lineIdx] = newDone
      ? lines[lineIdx].replace(/^(\s*)- \[ \]/, '$1- [x]')
      : lines[lineIdx].replace(/^(\s*)- \[x\]/i, '$1- [ ]');
    const newContent = lines.join('\n');
    setPlan({ ...plan, raw: newContent }); // optimistic
    try {
      const res = await fetch(`/api/onyx/vault-file?path=${encodeURIComponent(planPath)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPlan({ ...plan, raw: prev }); // rollback
      toast('Failed to save — check vault connection', 'error');
    }
  };

  const generatePlan = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/onyx/generate-day-plan', { method: 'POST' });
      const data = await res.json() as { content?: string; path?: string; date?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed');
      // Refresh the plan from vault
      const r2 = await fetch('/api/onyx/today');
      const d2 = await r2.json() as { plan: DailyPlan; inbox: InboxItem[] };
      setPlan(d2.plan);
      toast(`Plan saved → 00 - Dashboard/Daily/${data.date ?? todayKey}.md`, 'success');
    } catch (err) {
      toast(`Plan generation failed: ${(err as Error).message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const sendDirection = async () => {
    if (!direction.trim()) return;
    setSending(true);
    try {
      const newLines = [...savedDirections, direction.trim()];
      const res = await fetch('/api/onyx/vault-file?path=' + encodeURIComponent('00 - Dashboard/.plan-direction.md'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newLines.join('\n') + '\n' }),
      });
      if (!res.ok) throw new Error();
      toast('Direction saved — will be used on next plan run', 'success');
      setDirection('');
      loadDirection();
    } catch {
      toast('Failed to save direction', 'error');
    }
    setSending(false);
  };

  const removeDirection = async (idx: number) => {
    const remaining = savedDirections.filter((_, i) => i !== idx);
    setSavedDirections(remaining);
    try {
      await fetch('/api/onyx/vault-file?path=' + encodeURIComponent('00 - Dashboard/.plan-direction.md'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: remaining.length > 0 ? remaining.join('\n') + '\n' : '' }),
      });
    } catch {
      loadDirection(); // rollback on error
    }
  };

  const allPhases = projects.flatMap(p => p.phases.map(ph => ({ ...ph, projectId: p.id })));
  const active  = allPhases.filter(p => p.status === 'active');
  const blocked = allPhases.filter(p => p.status === 'blocked');
  const ready   = allPhases.filter(p => p.status === 'ready');

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="onyx-today" style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* ── Left: Live FSM ── */}
      <div className="onyx-today-left" style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', padding: '14px 12px' }}>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { n: active.length,  label: 'Active',  c: 'var(--active)' },
            { n: blocked.length, label: 'Blocked', c: 'var(--blocked)' },
            { n: ready.length,   label: 'Ready',   c: 'var(--ready)' },
          ].map(({ n, label, c }) => (
            <div key={label} style={{ flex: 1, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-1)', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: c, fontFamily: 'monospace' }}>{n}</div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Prayer times */}
        {settings && <PrayerTimesWidget lat={settings.lat} lng={settings.lng}/>}

        {/* Active phases */}
        {active.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel label="Running" color="var(--active)"/>
            {active.map(ph => <PhaseRow key={ph.path} phase={ph} projectId={ph.projectId} onOpen={onOpenFile}/>)}
          </div>
        )}

        {/* Blocked */}
        {blocked.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel label="Blocked" color="var(--blocked)"/>
            {blocked.map(ph => (
              <div key={ph.path}>
                <PhaseRow phase={ph} projectId={ph.projectId} onOpen={onOpenFile}/>
                {ph.lockedBy && (
                  <div style={{ fontSize: 9, color: 'var(--blocked)', padding: '2px 0 3px 13px', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <AlertCircle size={8}/> {ph.lockedBy}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inbox — above ready */}
        {inbox.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setInboxOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', marginBottom: 5 }}>
              {inboxOpen ? <ChevronDown size={9} color="var(--text-faint)"/> : <ChevronRight size={9} color="var(--text-faint)"/>}
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inbox ({inbox.length})</span>
            </button>
            {inboxOpen && (
              <div style={{ borderRadius: 5, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {inbox.slice(0, 4).map((item, i) => (
                  <div key={i} style={{ padding: '6px 9px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {item.text.slice(0, 100)}{item.text.length > 100 ? '…' : ''}
                  </div>
                ))}
                <div onClick={() => onOpenFile('00 - Dashboard/Inbox.md')} style={{ padding: '5px 9px', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Inbox size={9}/> Open inbox
                </div>
              </div>
            )}
          </div>
        )}

        {/* Email (Mailcow) */}
        {emailSummary && (emailSummary.unread > 0 || emailSummary.drafts > 0) && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setEmailOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', marginBottom: 5 }}>
              {emailOpen ? <ChevronDown size={9} color="var(--text-faint)"/> : <ChevronRight size={9} color="var(--text-faint)"/>}
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email (Unread {emailSummary.unread} · Drafts {emailSummary.drafts})
              </span>
            </button>
            {emailOpen && (
              <div style={{ borderRadius: 5, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div onClick={() => onOpenEmail('inbox')} style={{ padding: '6px 9px', cursor: 'pointer', fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={9}/> Open email inbox
                </div>
                <div onClick={() => onOpenEmail('drafts')} style={{ padding: '6px 9px', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileEdit size={9}/> Open drafts
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ready */}
        {ready.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel label="Ready to Run" color="var(--ready)"/>
            {ready.slice(0, 8).map(ph => (
              <PhaseRow key={ph.path} phase={ph} projectId={ph.projectId} onOpen={onOpenFile}
                onRun={() => onRunCLI('run', ['--project', ph.projectId])}/>
            ))}
            {ready.length > 8 && (
              <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingTop: 3 }}>+{ready.length - 8} more</div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Daily Plan ── */}
      <div className="onyx-today-right" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)' }}>Daily Plan</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{today}</div>
          </div>
          <div style={{ flex: 1 }}/>
          <button onClick={() => void generatePlan()} disabled={generating} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--planning)', background: generating ? 'rgba(152,118,248,0.1)' : 'transparent', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 10, color: 'var(--planning)', fontFamily: 'inherit' }}>
            {generating ? 'Generating…' : 'Replan'}
          </button>
          <button onClick={() => onOpenFile(`00 - Dashboard/Daily/${todayKey}.md`)} style={{ padding: '3px 9px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'inherit' }}>
            Open in vault
          </button>
        </div>

        {/* Direction bar */}
        <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <textarea
              ref={dirRef}
              value={direction}
              onChange={e => setDirection(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendDirection(); } }}
              placeholder="Direction override for next plan generation — e.g. focus on KrakenBot today, skip meetings"
              rows={1}
              style={{ flex: 1, padding: '5px 9px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-str)', fontSize: 11, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.4 }}
            />
            <button onClick={() => void sendDirection()} disabled={sending || !direction.trim()} style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent',
              cursor: sending || !direction.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: direction.trim() ? 'var(--accent)' : 'var(--text-faint)',
            }}>
              <Send size={11}/>
            </button>
          </div>
          <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-faint)', display: 'flex', gap: 10 }}>
            <span>Press Enter to save · used once on next Replan · deleted after</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'monospace' }}>→ 00 - Dashboard/.plan-direction.md</span>
          </div>
          {savedDirections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
              {savedDirections.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px 2px 9px', borderRadius: 10,
                  background: 'rgba(68,147,248,0.08)', border: '1px solid rgba(68,147,248,0.25)',
                  fontSize: 10, color: 'var(--accent)', maxWidth: 280,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.length > 60 ? d.slice(0, 60) + '…' : d}
                  </span>
                  <button onClick={() => void removeDirection(i)} title="Remove" style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--text-faint)', padding: '0 1px', lineHeight: 1, fontSize: 11, flexShrink: 0,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--blocked)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {!plan ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>Loading…</div>
          ) : !plan.exists ? (
            <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-faint)', fontSize: 12 }}>
              No daily plan for today.<br/>
              <span style={{ fontFamily: 'monospace', fontSize: 10 }}>00 - Dashboard/Daily/{todayKey}.md</span>
              <br/><br/>
              <button onClick={() => void generatePlan()} disabled={generating} style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid var(--planning)', background: generating ? 'rgba(152,118,248,0.1)' : 'transparent', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 11, color: 'var(--planning)', fontFamily: 'inherit' }}>
                {generating ? 'Generating…' : 'Generate Plan'}
              </button>
            </div>
          ) : (
            <DailyPlanView raw={plan.raw} planPath={planPath} projects={projects} onOpenFile={onOpenFile} onRunCLI={onRunCLI} onToggleTask={toggleTask}/>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
      <div style={{ width: 3, height: 10, borderRadius: 1, background: color }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}
