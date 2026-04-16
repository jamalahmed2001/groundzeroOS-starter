'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Inbox, FileEdit, RefreshCw, AlertCircle, Zap, Info, VolumeX, Filter, PenLine, Copy, Check, ChevronDown, ChevronUp, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = 'urgent' | 'action' | 'fyi' | 'noise';

type TriagedEmail = {
  id: string;
  account: string;
  mailbox: string;
  uid: number;
  date: string;
  subject: string;
  from: string;
  to: string;
  seen: boolean;
  snippet?: string;
  priority: Priority;
  project: string | null;
  actionLabel: string;
  summary: string;
};

type EmailBody = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  text: string;
  html: string | null;
};

// ── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<Priority, { label: string; color: string; bg: string; Icon: React.ElementType; borderColor: string }> = {
  urgent: { label: 'Urgent',  color: '#f87171', bg: 'rgba(248,113,113,0.08)', Icon: AlertCircle, borderColor: '#f87171' },
  action: { label: 'Action',  color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  Icon: Zap,         borderColor: '#fb923c' },
  fyi:    { label: 'FYI',     color: '#60a5fa', bg: 'rgba(96,165,250,0.06)',  Icon: Info,        borderColor: '#60a5fa' },
  noise:  { label: 'Noise',   color: '#6b7280', bg: 'rgba(107,114,128,0.05)', Icon: VolumeX,     borderColor: '#374151' },
};

const PRIORITY_ORDER: Priority[] = ['urgent', 'action', 'fyi', 'noise'];

// ── Draft modal ────────────────────────────────────────────────────────────────

function DraftModal({ email, body, onClose }: { email: TriagedEmail; body: EmailBody | null; onClose: () => void }) {
  const [context, setContext] = useState('');
  const [draft, setDraft]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const generate = async () => {
    if (!body && !email.snippet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mailcow/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: email.subject,
          from: email.from,
          body: body?.text ?? email.snippet ?? '',
          project: email.project,
          context: context.trim() || undefined,
        }),
      });
      const d = await res.json() as { draft?: string; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? 'Failed');
      setDraft(d.draft ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400 }}/>
      <div style={{
        position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',
        width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'rgba(10,14,22,0.98)', backdropFilter: 'blur(32px)',
        border: '1px solid rgba(77,156,248,0.25)', borderRadius: 12, zIndex: 401,
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <PenLine size={13} style={{ color: 'var(--accent)' }}/>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', flex: 1 }}>Draft Reply</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Re: {email.subject}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)' }}><X size={14}/></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Context input */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Your intent (optional)</div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. Agree to the proposal, ask for timeline. Or decline politely because budget..."
              rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.4 }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={() => void generate()}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(77,156,248,0.4)',
              background: loading ? 'transparent' : 'rgba(77,156,248,0.1)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 500,
              alignSelf: 'flex-start',
            }}
          >
            {loading ? 'Generating…' : draft ? 'Regenerate' : 'Generate Draft'}
          </button>

          {error && (
            <div style={{ fontSize: 11, color: '#f87171', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)' }}>
              {error}
            </div>
          )}

          {/* Draft output */}
          {draft && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, flex: 1 }}>Generated Draft</div>
                <button onClick={() => void copy()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: copied ? 'var(--ready)' : 'var(--text-dim)', fontFamily: 'inherit' }}>
                  {copied ? <Check size={10}/> : <Copy size={10}/>}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={12}
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, caretColor: 'var(--accent)' }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Email detail panel ─────────────────────────────────────────────────────────

function EmailDetail({ email, onDraft, onClose }: { email: TriagedEmail; onDraft: () => void; onClose: () => void }) {
  const [body, setBody]     = useState<EmailBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/mailcow/body?account=${encodeURIComponent(email.account)}&mailbox=${encodeURIComponent(email.mailbox)}&uid=${email.uid}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setBody(d as EmailBody);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [email.account, email.mailbox, email.uid]);

  const pc = PRIORITY_CFG[email.priority];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--glass-b)', background: 'rgba(8,12,20,0.96)' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', marginBottom: 4, lineHeight: 1.4 }}>{email.subject || '(no subject)'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>From: {email.from}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
              {new Date(email.date).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', flexShrink: 0, padding: 4 }}><X size={13}/></button>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: pc.bg, color: pc.color, border: `1px solid ${pc.borderColor}44`, fontWeight: 600 }}>
            {pc.label}
          </span>
          {email.project && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(77,156,248,0.08)', color: 'var(--accent)', border: '1px solid rgba(77,156,248,0.2)', fontWeight: 500 }}>
              {email.project}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', flex: 1 }}>{email.actionLabel}</span>
          <button
            onClick={onDraft}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(77,156,248,0.3)', background: 'rgba(77,156,248,0.08)', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 500 }}
          >
            <PenLine size={11}/> Draft reply
          </button>
        </div>

        {/* AI summary */}
        {email.summary && email.summary !== email.snippet && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, padding: '6px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-b)' }}>
            {email.summary}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
        {loading && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Loading email…</div>}
        {error && <div style={{ fontSize: 11, color: '#f87171' }}>Failed to load body: {error}</div>}
        {!loading && !error && body && (
          <pre style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0 }}>
            {body.text || '(no plain text content)'}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Main EmailView ─────────────────────────────────────────────────────────────

export default function EmailView({ initialBox = 'inbox' }: { initialBox?: 'inbox' | 'drafts' }) {
  const [box, setBox]                       = useState<'inbox' | 'drafts'>(initialBox);
  const [items, setItems]                   = useState<TriagedEmail[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterAccount, setFilterAccount]   = useState<string>('all');
  const [filterProject, setFilterProject]   = useState<string>('all');
  const [filterUnread, setFilterUnread]     = useState(false);
  const [selectedEmail, setSelectedEmail]   = useState<TriagedEmail | null>(null);
  const [draftEmail, setDraftEmail]         = useState<TriagedEmail | null>(null);
  const [draftBody, setDraftBody]           = useState<EmailBody | null>(null);
  const lastBoxRef = useRef(box);

  const load = useCallback(async (b = box) => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (b === 'inbox') {
        url = '/api/mailcow/triage?limit=30';
      } else {
        url = '/api/mailcow/list?box=drafts&limit=20';
      }
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json() as { items?: TriagedEmail[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed');
      // For drafts, add default triage fields if missing
      const raw = (data.items ?? []).map(e => ({
        ...e,
        priority: e.priority ?? ('fyi' as Priority),
        project: e.project ?? null,
        actionLabel: e.actionLabel ?? 'Draft',
        summary: e.summary ?? e.snippet ?? e.subject,
      }));
      setItems(raw);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [box]);

  useEffect(() => {
    if (lastBoxRef.current !== box) {
      lastBoxRef.current = box;
      setSelectedEmail(null);
    }
    void load(box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);

  // Derived filter options
  const accounts = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.account)))], [items]);
  const projects  = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.project).filter(Boolean) as string[]))], [items]);

  const priorityCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const p of PRIORITY_ORDER) c[p] = items.filter(i => i.priority === p).length;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter(i => filterPriority === 'all' || i.priority === filterPriority)
      .filter(i => filterAccount === 'all' || i.account === filterAccount)
      .filter(i => filterProject === 'all' || i.project === filterProject)
      .filter(i => !filterUnread || !i.seen)
      .sort((a, b) => {
        const po = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        if (po !== 0) return po;
        return a.date < b.date ? 1 : -1;
      });
  }, [items, filterPriority, filterAccount, filterProject, filterUnread]);

  const openDraft = (email: TriagedEmail, body: EmailBody | null) => {
    setDraftEmail(email);
    setDraftBody(body);
  };

  const hasFilters = filterPriority !== 'all' || filterAccount !== 'all' || filterProject !== 'all' || filterUnread;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--glass-b)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <Mail size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }}/>

        {/* Box tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['inbox', 'drafts'] as const).map(b => (
            <button key={b} onClick={() => setBox(b)} style={{
              padding: '4px 10px', borderRadius: 5,
              border: `1px solid ${box === b ? 'var(--accent)' : 'var(--glass-b)'}`,
              background: box === b ? 'rgba(77,156,248,0.1)' : 'transparent',
              cursor: 'pointer', fontSize: 11,
              color: box === b ? 'var(--accent)' : 'var(--text-dim)',
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
            }}>
              {b === 'inbox' ? <Inbox size={11}/> : <FileEdit size={11}/>}
              {b === 'inbox' ? 'Inbox' : 'Drafts'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}/>

        {/* Unread toggle */}
        <button onClick={() => setFilterUnread(u => !u)} style={{
          padding: '3px 8px', borderRadius: 4,
          border: `1px solid ${filterUnread ? 'var(--accent)' : 'var(--glass-b)'}`,
          background: filterUnread ? 'rgba(77,156,248,0.1)' : 'transparent',
          cursor: 'pointer', fontSize: 10, color: filterUnread ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'inherit',
        }}>
          Unread only
        </button>

        {/* Account filter */}
        {accounts.length > 2 && (
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{
            padding: '3px 6px', borderRadius: 4, border: '1px solid var(--glass-b)',
            background: 'var(--bg-2)', color: 'var(--text-dim)', fontSize: 10, outline: 'none',
          }}>
            {accounts.map(a => <option key={a} value={a}>{a === 'all' ? 'All accounts' : a}</option>)}
          </select>
        )}

        {/* Project filter */}
        {projects.length > 2 && (
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{
            padding: '3px 6px', borderRadius: 4, border: '1px solid var(--glass-b)',
            background: 'var(--bg-2)', color: 'var(--text-dim)', fontSize: 10, outline: 'none',
          }}>
            {projects.map(p => <option key={p} value={p}>{p === 'all' ? 'All projects' : p}</option>)}
          </select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <button onClick={() => { setFilterPriority('all'); setFilterAccount('all'); setFilterProject('all'); setFilterUnread(false); }}
            style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Filter size={9}/> Clear
          </button>
        )}

        <button onClick={() => void load(box)} disabled={loading} style={{
          padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)',
          background: 'transparent', cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 10, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
        }}>
          <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Refresh
        </button>
      </div>

      {/* ── Priority filter pills ────────────────────────────────────────────── */}
      {box === 'inbox' && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0, flexWrap: 'wrap' }}>
          {([['all', 'All'] as const, ...PRIORITY_ORDER.map(p => [p, PRIORITY_CFG[p].label] as const)]).map(([p, label]) => {
            const count = priorityCounts[p] ?? 0;
            const active = filterPriority === p;
            const cfg = p !== 'all' ? PRIORITY_CFG[p] : null;
            return (
              <button key={p} onClick={() => setFilterPriority(p as Priority | 'all')} style={{
                padding: '3px 9px', borderRadius: 20,
                border: `1px solid ${active ? (cfg?.borderColor ?? 'var(--accent)') : 'var(--glass-b)'}`,
                background: active ? (cfg?.bg ?? 'rgba(77,156,248,0.08)') : 'transparent',
                cursor: 'pointer', fontSize: 11,
                color: active ? (cfg?.color ?? 'var(--accent)') : 'var(--text-faint)',
                display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}>
                {cfg && <cfg.Icon size={10}/>}
                {label}
                {count > 0 && (
                  <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.8 }}>({count})</span>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', alignSelf: 'center' }}>
            {filtered.length} of {items.length}
          </span>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Email list */}
        <div style={{ width: selectedEmail ? 340 : '100%', flexShrink: 0, overflow: 'auto', borderRight: selectedEmail ? '1px solid var(--glass-b)' : 'none' }}>
          {error && (
            <div style={{ margin: 14, padding: 12, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, background: 'rgba(248,113,113,0.05)', color: '#f87171', fontSize: 12 }}>
              {error}
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-faint)' }}>
                Set MAILCOW_IMAP_HOST + MAILCOW_IMAP_ACCOUNTS in .env.local to connect.
              </div>
            </div>
          )}

          {!error && loading && items.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>
              {box === 'inbox' ? 'Fetching and triaging email…' : 'Loading drafts…'}
            </div>
          )}

          {!error && !loading && filtered.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>
              {hasFilters ? 'No emails match current filters.' : 'No messages found.'}
            </div>
          )}

          {!error && filtered.map(email => {
            const pc = PRIORITY_CFG[email.priority];
            const isSelected = selectedEmail?.id === email.id;

            return (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(isSelected ? null : email)}
                style={{
                  padding: '10px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--glass-b)',
                  borderLeft: `3px solid ${isSelected ? pc.borderColor : 'transparent'}`,
                  background: isSelected ? 'rgba(77,156,248,0.04)' : 'transparent',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Row 1: priority badge + subject + date */}
                <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 3 }}>
                  <pc.Icon size={11} style={{ color: pc.color, flexShrink: 0, position: 'relative', top: 1 }}/>
                  <div style={{
                    flex: 1, fontSize: 12, fontWeight: email.seen ? 400 : 700,
                    color: email.seen ? 'var(--text-dim)' : 'var(--text-str)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {email.subject || '(no subject)'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(email.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Row 2: from + action label */}
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginLeft: 18 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.from}
                  </div>
                  {email.project && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(77,156,248,0.08)', color: 'var(--accent)', border: '1px solid rgba(77,156,248,0.15)', flexShrink: 0 }}>
                      {email.project}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: pc.color, flexShrink: 0, fontWeight: 500 }}>{email.actionLabel}</span>
                </div>

                {/* Row 3: AI summary */}
                {email.summary && (
                  <div style={{ marginTop: 3, marginLeft: 18, fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {email.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Email detail panel */}
        {selectedEmail && (
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <EmailDetail
              email={selectedEmail}
              onDraft={() => openDraft(selectedEmail, draftBody)}
              onClose={() => setSelectedEmail(null)}
            />
          </div>
        )}
      </div>

      {/* Draft modal */}
      {draftEmail && (
        <DraftModal
          email={draftEmail}
          body={draftBody}
          onClose={() => { setDraftEmail(null); setDraftBody(null); }}
        />
      )}
    </div>
  );
}
