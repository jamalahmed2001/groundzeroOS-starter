'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail, RefreshCw, AlertCircle, Zap, Info, VolumeX, PenLine, Copy, Check,
  X, ChevronDown, ChevronRight, Inbox, Globe, User, Folder, WifiOff,
  Send, Save, Sparkles,
} from 'lucide-react';

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

type FolderInfo = { name: string; display: string };
type AccountInfo = { user: string; label: string; domain: string; folders: FolderInfo[]; unread: number; connected: boolean };
type DomainInfo  = { domain: string; accounts: AccountInfo[]; totalUnread: number };

// Selection — what the sidebar is pointing at
type Selection =
  | { type: 'all' }
  | { type: 'domain';  domain: string }
  | { type: 'account'; domain: string; account: string }
  | { type: 'folder';  domain: string; account: string; folder: string; folderDisplay: string };

// ── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<Priority, { label: string; color: string; bg: string; Icon: React.ElementType; borderColor: string }> = {
  urgent: { label: 'Urgent', color: '#f87171', bg: 'rgba(248,113,113,0.08)', Icon: AlertCircle, borderColor: '#f87171' },
  action: { label: 'Action', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  Icon: Zap,         borderColor: '#fb923c' },
  fyi:    { label: 'FYI',    color: '#60a5fa', bg: 'rgba(96,165,250,0.06)',  Icon: Info,        borderColor: '#60a5fa' },
  noise:  { label: 'Noise',  color: '#6b7280', bg: 'rgba(107,114,128,0.05)', Icon: VolumeX,     borderColor: '#374151' },
};

const PRIORITY_ORDER: Priority[] = ['urgent', 'action', 'fyi', 'noise'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFrom(raw: string): { name: string; address: string } {
  const m = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2], address: m[2] };
  return { name: raw, address: raw };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ── Draft modal — 3-stage flow: generate → preview+edit → confirm (save|send) ──

type DraftStage = 'compose' | 'preview' | 'confirmSend' | 'sending' | 'sent';

function DraftModal({ email, body, onClose }: { email: TriagedEmail; body: EmailBody | null; onClose: () => void }) {
  const [stage, setStage]       = useState<DraftStage>('compose');
  const [context, setContext]   = useState('');
  const [draft, setDraft]       = useState('');
  const [subject, setSubject]   = useState(`Re: ${email.subject.replace(/^re:\s*/i, '')}`);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // Derive recipient from the "from" of the original email (proper reply)
  const parsedFrom  = parseFrom(email.from);
  const toAddress   = parsedFrom.address;

  const generate = async () => {
    setLoading(true); setError(null);
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
      setStage('preview');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDraft = async () => {
    setLoading(true); setError(null); setSaveResult(null);
    try {
      const res = await fetch('/api/mailcow/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: email.account,
          to: toAddress,
          subject,
          body: draft,
        }),
      });
      const d = await res.json() as { ok?: boolean; uid?: number; mailbox?: string; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? 'Failed');
      setSaveResult(`Saved to ${d.mailbox ?? 'Drafts'}${d.uid ? ` (uid ${d.uid})` : ''}`);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const sendReply = async () => {
    setStage('sending'); setError(null);
    try {
      const res = await fetch('/api/mailcow/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: email.account,
          to: toAddress,
          subject,
          body: draft,
        }),
      });
      const d = await res.json() as { ok?: boolean; messageId?: string; response?: string; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? 'Failed');
      setStage('sent');
    } catch (e) {
      setError((e as Error).message);
      setStage('preview');
    }
  };

  return (
    <>
      <div onClick={stage === 'sending' ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400 }}/>
      <div style={{ position: 'fixed', top: '7%', left: '50%', transform: 'translateX(-50%)', width: 620, maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,14,22,0.98)', backdropFilter: 'blur(32px)', border: '1px solid rgba(77,156,248,0.25)', borderRadius: 12, zIndex: 401, boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <PenLine size={13} style={{ color: 'var(--accent)' }}/>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', flex: 1 }}>
            {stage === 'sent' ? 'Sent' : stage === 'sending' ? 'Sending…' : stage === 'confirmSend' ? 'Confirm send' : 'Reply'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            {parsedFrom.name} &lt;{toAddress}&gt;
          </span>
          <button onClick={onClose} disabled={stage === 'sending'} style={{ border: 'none', background: 'transparent', cursor: stage === 'sending' ? 'not-allowed' : 'pointer', color: 'var(--text-faint)' }}>
            <X size={14}/>
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stage indicator */}
          <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            <span style={{ color: stage === 'compose' ? 'var(--accent)' : 'var(--text-faint)' }}>1. Compose</span>
            <span>›</span>
            <span style={{ color: stage === 'preview' ? 'var(--accent)' : 'var(--text-faint)' }}>2. Preview</span>
            <span>›</span>
            <span style={{ color: stage === 'confirmSend' || stage === 'sending' || stage === 'sent' ? 'var(--accent)' : 'var(--text-faint)' }}>3. Confirm</span>
          </div>

          {/* Stage: compose */}
          {stage === 'compose' && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Your intent (optional)</div>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. Agree to the proposal, ask for timeline. Decline politely…"
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.4 }}
                />
              </div>
              <button
                onClick={() => void generate()}
                disabled={loading}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(77,156,248,0.4)', background: loading ? 'transparent' : 'rgba(77,156,248,0.1)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 500, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Sparkles size={12}/>
                {loading ? 'Generating…' : 'Generate Draft'}
              </button>
            </>
          )}

          {/* Stage: preview (editable) */}
          {stage === 'preview' && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>To</div>
                <input
                  value={toAddress}
                  readOnly
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-dim)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Subject</div>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, flex: 1 }}>Body</div>
                  <button onClick={() => void copy()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: copied ? 'var(--ready)' : 'var(--text-dim)', fontFamily: 'inherit' }}>
                    {copied ? <Check size={10}/> : <Copy size={10}/>}{copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => { setDraft(''); setStage('compose'); }} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'inherit' }}>
                    Regenerate
                  </button>
                </div>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={14}
                  style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-str)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, caretColor: 'var(--accent)' }}
                />
              </div>
              {saveResult && (
                <div style={{ fontSize: 11, color: 'var(--ready)', padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.05)' }}>
                  ✓ {saveResult}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                <button
                  onClick={() => void saveDraft()}
                  disabled={loading || !draft.trim()}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'transparent', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'inherit', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Save size={12}/> {loading ? 'Saving…' : 'Save as Draft'}
                </button>
                <button
                  onClick={() => setStage('confirmSend')}
                  disabled={loading || !draft.trim() || !toAddress}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(77,156,248,0.5)', background: 'rgba(77,156,248,0.1)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
                >
                  <Send size={12}/> Send…
                </button>
              </div>
            </>
          )}

          {/* Stage: confirm-send */}
          {stage === 'confirmSend' && (
            <>
              <div style={{ padding: 14, borderRadius: 8, border: '1px solid rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-str)', marginBottom: 10, fontWeight: 600 }}>
                  Send this reply?
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text-faint)' }}>From:</strong> {email.account}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text-faint)' }}>To:</strong> {toAddress}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
                  <strong style={{ color: 'var(--text-faint)' }}>Subject:</strong> {subject}
                </div>
                <pre style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0, maxHeight: 280, overflow: 'auto', padding: 10, borderRadius: 5, background: 'rgba(0,0,0,0.2)' }}>
                  {draft}
                </pre>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStage('preview')}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'inherit' }}
                >
                  ← Back to edit
                </button>
                <button
                  onClick={() => void sendReply()}
                  style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(77,156,248,0.5)', background: 'rgba(77,156,248,0.15)', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
                >
                  <Send size={12}/> Yes, send now
                </button>
              </div>
            </>
          )}

          {/* Stage: sending */}
          {stage === 'sending' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px', justifyContent: 'center', color: 'var(--accent)', fontSize: 12 }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }}/>
              Sending via {email.account}…
            </div>
          )}

          {/* Stage: sent */}
          {stage === 'sent' && (
            <div style={{ padding: 18, borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)', textAlign: 'center' }}>
              <Check size={28} style={{ color: 'var(--ready)', marginBottom: 8 }}/>
              <div style={{ fontSize: 13, color: 'var(--text-str)', fontWeight: 600, marginBottom: 4 }}>Reply sent</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>To {toAddress}</div>
              <button onClick={onClose} style={{ marginTop: 14, padding: '6px 16px', borderRadius: 6, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'inherit' }}>
                Close
              </button>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 11, color: '#f87171', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Email detail panel ─────────────────────────────────────────────────────────

function EmailDetail({ email, onDraft, onClose }: { email: TriagedEmail; onDraft: () => void; onClose: () => void }) {
  const [body, setBody]       = useState<EmailBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const from = parseFrom(email.from);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/mailcow/body?account=${encodeURIComponent(email.account)}&mailbox=${encodeURIComponent(email.mailbox)}&uid=${email.uid}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setBody(d as EmailBody); })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [email.account, email.mailbox, email.uid]);

  const pc = PRIORITY_CFG[email.priority];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--glass-b)', background: 'rgba(8,12,20,0.96)' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-str)', marginBottom: 4, lineHeight: 1.4 }}>{email.subject || '(no subject)'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{from.name !== from.address ? `${from.name} · ${from.address}` : from.address}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
              {new Date(email.date).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              <span style={{ marginLeft: 8, opacity: 0.6 }}>{email.account}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', flexShrink: 0, padding: 4 }}><X size={13}/></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: pc.bg, color: pc.color, border: `1px solid ${pc.borderColor}44`, fontWeight: 600 }}>{pc.label}</span>
          {email.project && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(77,156,248,0.08)', color: 'var(--accent)', border: '1px solid rgba(77,156,248,0.2)', fontWeight: 500 }}>{email.project}</span>}
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', flex: 1 }}>{email.actionLabel}</span>
          <button onClick={onDraft} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(77,156,248,0.3)', background: 'rgba(77,156,248,0.08)', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontFamily: 'inherit', fontWeight: 500 }}>
            <PenLine size={11}/> Draft reply
          </button>
        </div>
        {email.summary && email.summary !== email.snippet && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, padding: '6px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-b)' }}>
            {email.summary}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
        {loading && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Loading…</div>}
        {error && <div style={{ fontSize: 11, color: '#f87171' }}>Failed to load: {error}</div>}
        {!loading && !error && body && (
          <pre style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0 }}>
            {body.text || '(no plain text content)'}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  domains,
  loading,
  selection,
  onSelect,
  onRefresh,
}: {
  domains: DomainInfo[];
  loading: boolean;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onRefresh: () => void;
}) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // If every account is disconnected, the whole server is down — don't colour
  // every row red, the top-level banner already communicates this.
  const allDown = useMemo(() => {
    if (domains.length === 0) return false;
    const total = domains.reduce((n, d) => n + d.accounts.length, 0);
    if (total === 0) return false;
    return !domains.some(d => d.accounts.some(a => a.connected));
  }, [domains]);

  // Auto-expand everything on first load
  const initialised = useRef(false);
  useEffect(() => {
    if (!initialised.current && domains.length > 0) {
      initialised.current = true;
      setExpandedDomains(new Set(domains.map(d => d.domain)));
      setExpandedAccounts(new Set(domains.flatMap(d => d.accounts.map(a => a.user))));
    }
  }, [domains]);

  const toggleDomain = (domain: string) => setExpandedDomains(s => { const n = new Set(s); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });
  const toggleAccount = (user: string) => setExpandedAccounts(s => { const n = new Set(s); n.has(user) ? n.delete(user) : n.add(user); return n; });

  const isSelected = (s: Selection) => JSON.stringify(selection) === JSON.stringify(s);

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
    cursor: 'pointer', borderRadius: 5, fontSize: 11,
    background: active ? 'rgba(77,156,248,0.12)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-dim)',
    border: active ? '1px solid rgba(77,156,248,0.2)' : '1px solid transparent',
    userSelect: 'none',
    transition: 'background 0.1s',
  });

  return (
    <div style={{ width: 188, flexShrink: 0, borderRight: '1px solid var(--glass-b)', display: 'flex', flexDirection: 'column', background: 'rgba(6,9,16,0.6)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 10px 6px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
        <Mail size={12} style={{ color: 'var(--text-faint)' }}/>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Accounts</span>
        <button onClick={onRefresh} title="Refresh accounts" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, display: 'flex' }}>
          <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 6px' }}>
        {/* All accounts */}
        <div style={itemStyle(isSelected({ type: 'all' }))} onClick={() => onSelect({ type: 'all' })}>
          <Inbox size={11}/> All accounts
        </div>

        {loading && domains.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)', padding: '8px 10px' }}>Connecting…</div>
        )}

        {domains.map(dom => {
          const domSel: Selection = { type: 'domain', domain: dom.domain };
          const expanded = expandedDomains.has(dom.domain);
          return (
            <div key={dom.domain} style={{ marginTop: 8 }}>
              {/* Domain header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', cursor: 'pointer', borderRadius: 4, userSelect: 'none' }}
                onClick={() => { toggleDomain(dom.domain); onSelect(domSel); }}
              >
                {expanded ? <ChevronDown size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }}/> : <ChevronRight size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }}/>}
                <Globe size={10} style={{ color: isSelected(domSel) ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }}/>
                <span style={{ fontSize: 10, fontWeight: 700, color: isSelected(domSel) ? 'var(--accent)' : 'var(--text-faint)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {dom.domain}
                </span>
                {dom.totalUnread > 0 && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(77,156,248,0.2)', color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace' }}>
                    {dom.totalUnread}
                  </span>
                )}
              </div>

              {/* Accounts under domain */}
              {expanded && dom.accounts.map(acct => {
                const acctSel: Selection = { type: 'account', domain: dom.domain, account: acct.label };
                const acctExpanded = expandedAccounts.has(acct.user);
                return (
                  <div key={acct.user} style={{ marginLeft: 10 }}>
                    {/* Account row */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', cursor: 'pointer', borderRadius: 4, userSelect: 'none' }}
                      onClick={() => { toggleAccount(acct.user); onSelect(acctSel); }}
                    >
                      {acctExpanded ? <ChevronDown size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }}/> : <ChevronRight size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }}/>}
                      {acct.connected
                        ? <User size={10} style={{ color: isSelected(acctSel) ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}/>
                        : <WifiOff size={10} style={{ color: allDown ? 'var(--text-faint)' : '#f87171', flexShrink: 0 }}/>
                      }
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: isSelected(acctSel)
                          ? 'var(--accent)'
                          : acct.connected
                            ? 'var(--text-str)'
                            : (allDown ? 'var(--text-faint)' : '#f87171'),
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {acct.label}
                      </span>
                      {acct.unread > 0 && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(77,156,248,0.2)', color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace' }}>
                          {acct.unread}
                        </span>
                      )}
                    </div>

                    {/* Folders under account */}
                    {acctExpanded && acct.connected && acct.folders.map(f => {
                      const folSel: Selection = { type: 'folder', domain: dom.domain, account: acct.label, folder: f.name, folderDisplay: f.display };
                      return (
                        <div key={f.name}
                          style={{ ...itemStyle(isSelected(folSel)), marginLeft: 14, marginBottom: 1, padding: '3px 8px' }}
                          onClick={() => onSelect(folSel)}
                        >
                          <Folder size={9} style={{ flexShrink: 0 }}/>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.display}</span>
                          {f.name === 'INBOX' && acct.unread > 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 9, padding: '0px 4px', borderRadius: 6, background: 'rgba(77,156,248,0.15)', color: 'var(--accent)', fontFamily: 'monospace' }}>
                              {acct.unread}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {acctExpanded && !acct.connected && !allDown && (
                      <div style={{ marginLeft: 24, fontSize: 10, color: '#f87171', padding: '3px 8px', opacity: 0.7 }}>Connection failed</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main EmailView ─────────────────────────────────────────────────────────────

export default function EmailView() {
  // Sidebar / account tree
  // localStorage-backed initial state — keeps the UI populated instantly on reload
  const [domains, setDomains] = useState<DomainInfo[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('onyx.email.domains') ?? '[]'); } catch { return []; }
  });
  const [sidebarLoading, setSidebarLoading] = useState(domains.length === 0);

  const [selection, setSelection] = useState<Selection>(() => {
    if (typeof window === 'undefined') return { type: 'all' };
    try {
      const raw = localStorage.getItem('onyx.email.selection');
      if (raw) return JSON.parse(raw) as Selection;
    } catch { /* ignore */ }
    return { type: 'all' };
  });

  // Email list — cached per selection in localStorage
  const [items, setItems] = useState<TriagedEmail[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('onyx.email.items');
      return raw ? (JSON.parse(raw) as TriagedEmail[]) : [];
    } catch { return []; }
  });
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterUnread, setFilterUnread]   = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<TriagedEmail | null>(null);
  const [draftEmail, setDraftEmail]       = useState<TriagedEmail | null>(null);
  const [draftBody, setDraftBody]         = useState<EmailBody | null>(null);

  // Persist selection + items + domains to localStorage on change
  useEffect(() => {
    try { localStorage.setItem('onyx.email.selection', JSON.stringify(selection)); } catch { /* ignore */ }
  }, [selection]);
  useEffect(() => {
    try { localStorage.setItem('onyx.email.domains', JSON.stringify(domains)); } catch { /* ignore */ }
  }, [domains]);
  useEffect(() => {
    try { localStorage.setItem('onyx.email.items', JSON.stringify(items.slice(0, 100))); } catch { /* ignore */ }
  }, [items]);

  // ── Load account tree — stale-while-revalidate ────────────────────────────

  const loadAccounts = useCallback(async (refresh = false) => {
    if (domains.length === 0) setSidebarLoading(true);
    try {
      const res = await fetch(`/api/mailcow/accounts${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const d = await res.json() as { domains?: DomainInfo[]; error?: string };
      if (d.domains) setDomains(d.domains);
    } catch {
      // keep cached domains visible
    } finally {
      setSidebarLoading(false);
    }
  }, [domains.length]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  // ── Build fetch URL from selection ────────────────────────────────────────

  const buildUrl = useCallback((sel: Selection): string => {
    if (sel.type === 'folder') {
      const p = new URLSearchParams({ account: sel.account, folder: sel.folder, limit: '30' });
      return `/api/mailcow/list?${p}`;
    }
    const p = new URLSearchParams({ limit: '30' });
    if (sel.type === 'domain')  p.set('domain',  sel.domain);
    if (sel.type === 'account') p.set('account', sel.account);
    return `/api/mailcow/triage?${p}`;
  }, []);

  // ── Load emails — stale-while-revalidate ──────────────────────────────────
  // 1. Keep showing currently-rendered items while a fresh fetch runs
  // 2. Only clear items on selection change so the user always sees something
  // 3. Show subtle loading indicator during background refresh

  const loadEmails = useCallback(async (sel: Selection, opts: { clear?: boolean } = {}) => {
    if (opts.clear) {
      setItems([]);
      setSelectedEmail(null);
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(sel), { cache: 'no-store' });
      const data = await res.json() as { items?: TriagedEmail[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed');
      const raw = (data.items ?? []).map(e => ({
        ...e,
        priority: e.priority ?? ('fyi' as Priority),
        project: e.project ?? null,
        actionLabel: e.actionLabel ?? '',
        summary: e.summary ?? e.snippet ?? e.subject,
      }));
      setItems(raw);
    } catch (e) {
      setError((e as Error).message);
      // Don't clear items on error — keep whatever we had
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  // On selection change, clear and reload. On mount, refresh without clearing.
  const mountedRef = useRef(false);
  useEffect(() => {
    const isInitialMount = !mountedRef.current;
    mountedRef.current = true;
    void loadEmails(selection, { clear: !isInitialMount });
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ─────────────────────────────────────────────────────────

  const priorityCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const p of PRIORITY_ORDER) c[p] = items.filter(i => i.priority === p).length;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter(i => filterPriority === 'all' || i.priority === filterPriority)
      .filter(i => !filterUnread || !i.seen)
      .sort((a, b) => {
        const po = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        return po !== 0 ? po : (a.date < b.date ? 1 : -1);
      });
  }, [items, filterPriority, filterUnread]);

  // ── Section title ──────────────────────────────────────────────────────────

  const sectionTitle = useMemo(() => {
    if (selection.type === 'all')     return 'All Accounts — Inbox';
    if (selection.type === 'domain')  return `${selection.domain} — Inbox`;
    if (selection.type === 'account') return `${selection.account} — Inbox`;
    if (selection.type === 'folder')  return `${selection.account} — ${selection.folderDisplay}`;
    return 'Inbox';
  }, [selection]);

  // Triage pills only make sense for inbox-like views
  const showPriorityPills = selection.type !== 'folder' || (selection as any).folder === 'INBOX';

  // Server reachability signal — if we have domains but zero accounts connected,
  // the IMAP server is unreachable from this machine
  const serverUnreachable = useMemo(() => {
    if (domains.length === 0) return false;
    const totalAccounts = domains.reduce((n, d) => n + d.accounts.length, 0);
    if (totalAccounts === 0) return false;
    const anyConnected = domains.some(d => d.accounts.some(a => a.connected));
    return !anyConnected;
  }, [domains]);

  const retryAll = useCallback(() => {
    void loadAccounts(true);
    void loadEmails(selection, { clear: false });
  }, [loadAccounts, loadEmails, selection]);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <Sidebar
        domains={domains}
        loading={sidebarLoading}
        selection={selection}
        onSelect={setSelection}
        onRefresh={() => void loadAccounts(true)}
      />

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--glass-b)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-str)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sectionTitle}
          </span>

          {/* Unread toggle */}
          <button onClick={() => setFilterUnread(u => !u)} style={{
            padding: '3px 8px', borderRadius: 4,
            border: `1px solid ${filterUnread ? 'var(--accent)' : 'var(--glass-b)'}`,
            background: filterUnread ? 'rgba(77,156,248,0.1)' : 'transparent',
            cursor: 'pointer', fontSize: 10,
            color: filterUnread ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'inherit',
          }}>
            Unread only
          </button>

          {(filterPriority !== 'all' || filterUnread) && (
            <button onClick={() => { setFilterPriority('all'); setFilterUnread(false); }}
              style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}

          <button onClick={() => void loadEmails(selection)} disabled={loading} style={{
            padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-b)',
            background: 'transparent', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 10, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
          }}>
            <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Refresh
          </button>
        </div>

        {/* Priority filter pills — inbox views only */}
        {showPriorityPills && (
          <div style={{ display: 'flex', gap: 6, padding: '7px 14px', borderBottom: '1px solid var(--glass-b)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
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
                }}>
                  {cfg && <cfg.Icon size={10}/>}
                  {label}
                  {count > 0 && <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.8 }}>({count})</span>}
                </button>
              );
            })}
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{filtered.length} of {items.length}</span>
          </div>
        )}

        {/* Content: email list + detail panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* Email list */}
          <div style={{ width: selectedEmail ? 320 : '100%', flexShrink: 0, overflow: 'auto' }}>

            {serverUnreachable && (
              <div style={{ margin: 14, padding: '12px 14px', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 8, background: 'rgba(251,146,60,0.06)', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <WifiOff size={13} style={{ color: '#fb923c' }}/>
                  <span style={{ color: '#fb923c', fontWeight: 600 }}>Mail server unreachable</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 8 }}>
                  All configured accounts failed to connect. The IMAP port (993) appears to be blocked from this machine — likely a transient firewall / fail2ban issue on <code style={{ fontFamily: 'monospace', fontSize: 10, padding: '0 4px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>mail.example.com</code>. Cached emails are still viewable below.
                </div>
                <button onClick={retryAll} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(251,146,60,0.4)', background: 'rgba(251,146,60,0.08)', cursor: 'pointer', fontSize: 11, color: '#fb923c', fontFamily: 'inherit', fontWeight: 500 }}>
                  Retry connection
                </button>
              </div>
            )}

            {error && !serverUnreachable && (
              <div style={{ margin: 14, padding: 12, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, background: 'rgba(248,113,113,0.05)', color: '#f87171', fontSize: 12 }}>
                {error}
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-faint)' }}>Check MAILCOW_IMAP_ACCOUNTS in .env.local</div>
              </div>
            )}

            {!error && loading && items.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>Fetching and triaging…</div>
            )}

            {!error && !loading && filtered.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>No messages found.</div>
            )}

            {!error && filtered.map(email => {
              const pc = PRIORITY_CFG[email.priority];
              const isSelected = selectedEmail?.id === email.id;
              const from = parseFrom(email.from);
              // Show account badge only in aggregate views
              const showAccount = selection.type === 'all' || selection.type === 'domain';

              return (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(isSelected ? null : email)}
                  style={{
                    padding: '9px 12px', cursor: 'pointer',
                    borderBottom: '1px solid var(--glass-b)',
                    borderLeft: `3px solid ${isSelected ? pc.borderColor : 'transparent'}`,
                    background: isSelected ? 'rgba(77,156,248,0.04)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Row 1: priority icon + subject + date */}
                  <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 2 }}>
                    <pc.Icon size={11} style={{ color: pc.color, flexShrink: 0, position: 'relative', top: 1 }}/>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: email.seen ? 400 : 700, color: email.seen ? 'var(--text-dim)' : 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email.subject || '(no subject)'}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {fmtDate(email.date)}
                    </div>
                  </div>

                  {/* Row 2: sender name + account badge + action label */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 18 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {from.name}
                    </div>
                    {showAccount && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: 'var(--text-faint)', border: '1px solid var(--glass-b)', flexShrink: 0 }}>
                        {email.account}
                      </span>
                    )}
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
                onDraft={() => { setDraftEmail(selectedEmail); setDraftBody(null); }}
                onClose={() => setSelectedEmail(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Draft modal */}
      {draftEmail && (
        <DraftModal email={draftEmail} body={draftBody} onClose={() => { setDraftEmail(null); setDraftBody(null); }}/>
      )}
    </div>
  );
}
