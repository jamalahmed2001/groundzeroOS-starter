'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Edit3, Eye, Save, Loader } from 'lucide-react';
import { statusColor } from '@/lib/colors';

interface Props {
  path: string;
  onClose: () => void;
  onWikilinkClick?: (target: string) => void;
}

interface FileData { raw: string; frontmatter: Record<string, unknown> }

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(
  md: string,
  opts: { onWikilink?: (target: string) => void; onTaskToggle?: (lineNum: number, done: boolean) => void }
): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline renderer: bold, italic, code, wikilinks
  const renderInline = (text: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let rest = text;
    let idx = 0;

    const patterns: { re: RegExp; render: (m: RegExpExecArray) => React.ReactNode }[] = [
      {
        re: /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]/g,
        render: m => {
          const target = m[1].trim();
          return (
            <span key={`wiki-${idx++}`}
              onClick={() => opts.onWikilink?.(target)}
              style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >{target}</span>
          );
        },
      },
      {
        re: /`([^`]+)`/g,
        render: m => <code key={`c-${idx++}`} style={{ background: 'rgba(77,156,248,0.1)', color: 'var(--accent-hi)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em', fontFamily: 'monospace' }}>{m[1]}</code>,
      },
      {
        re: /\*\*(.+?)\*\*/g,
        render: m => <strong key={`b-${idx++}`} style={{ color: 'var(--text-str)', fontWeight: 600 }}>{m[1]}</strong>,
      },
      {
        re: /\*(.+?)\*/g,
        render: m => <em key={`i-${idx++}`}>{m[1]}</em>,
      },
    ];

    // Combine all patterns into one pass
    const combined = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]|`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    combined.lastIndex = 0;
    while ((m = combined.exec(rest)) !== null) {
      if (m.index > last) parts.push(escape(rest.slice(last, m.index)));
      if (m[1] !== undefined) { // wikilink
        const target = m[1].trim();
        parts.push(
          <span key={`wiki-${idx++}`} onClick={() => opts.onWikilink?.(target)} style={{ color: 'var(--accent)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >{target}</span>
        );
      } else if (m[2] !== undefined) { // inline code
        parts.push(<code key={`c-${idx++}`} style={{ background: 'rgba(77,156,248,0.08)', color: 'var(--accent-hi)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em', fontFamily: 'monospace' }}>{m[2]}</code>);
      } else if (m[3] !== undefined) { // bold
        parts.push(<strong key={`b-${idx++}`} style={{ color: 'var(--text-str)', fontWeight: 600 }}>{m[3]}</strong>);
      } else if (m[4] !== undefined) { // italic
        parts.push(<em key={`em-${idx++}`}>{m[4]}</em>);
      }
      last = m.index + m[0].length;
      void patterns; // suppress unused warning
    }
    if (last < rest.length) parts.push(escape(rest.slice(last)));
    return <>{parts}</>;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const key = `ln-${i}`;

    // ── Fenced code block ──
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <div key={key} style={{ margin: '10px 0', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--glass-b)' }}>
          {lang && <div style={{ padding: '4px 10px', background: 'rgba(77,156,248,0.07)', fontSize: 9, fontFamily: 'monospace', color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{lang}</div>}
          <pre style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.35)', margin: 0, overflowX: 'auto', fontSize: 11, lineHeight: 1.65, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // ── Callout > [!TYPE] ──
    if (line.startsWith('> [!')) {
      const typeM = line.match(/^> \[!(\w+)\]/);
      const calloutType = typeM?.[1]?.toLowerCase() ?? 'note';
      const calloutColor = { note: 'var(--accent)', warning: '#f5a623', danger: 'var(--blocked)', tip: 'var(--ready)', info: 'var(--accent)' }[calloutType] ?? 'var(--accent)';
      const calloutLines: string[] = [line.replace(/^> \[!\w+\]\s*/, '')];
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) {
        calloutLines.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <div key={key} style={{ margin: '10px 0', borderLeft: `3px solid ${calloutColor}`, paddingLeft: 12, borderRadius: '0 var(--r-sm) var(--r-sm) 0', background: `${calloutColor}0d` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: calloutColor, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{calloutType}</div>
          {calloutLines.filter(Boolean).map((cl, ci) => (
            <div key={ci} style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.65 }}>{renderInline(cl, `cal-${key}-${ci}`)}</div>
          ))}
        </div>
      );
      continue;
    }

    // ── Blockquote ──
    if (line.startsWith('> ')) {
      nodes.push(
        <div key={key} style={{ borderLeft: '2px solid var(--glass-b-hi)', paddingLeft: 10, margin: '4px 0', color: 'var(--text-dim)', fontSize: 12 }}>
          {renderInline(line.slice(2), key)}
        </div>
      );
      i++;
      continue;
    }

    // ── Headings ──
    const h3m = line.match(/^### (.+)/);
    const h2m = line.match(/^## (.+)/);
    const h1m = line.match(/^# (.+)/);
    if (h1m) { nodes.push(<h1 key={key} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-str)', margin: '18px 0 8px', lineHeight: 1.3 }}>{renderInline(h1m[1], key)}</h1>); i++; continue; }
    if (h2m) { nodes.push(<h2 key={key} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-str)', margin: '14px 0 6px', lineHeight: 1.3 }}>{renderInline(h2m[1], key)}</h2>); i++; continue; }
    if (h3m) { nodes.push(<h3 key={key} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-str)', margin: '12px 0 5px', lineHeight: 1.3 }}>{renderInline(h3m[1], key)}</h3>); i++; continue; }

    // ── HR ──
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key} style={{ border: 'none', borderTop: '1px solid var(--glass-b)', margin: '14px 0' }}/>);
      i++; continue;
    }

    // ── Task items ──
    const taskDone = line.match(/^\s*-\s*\[x\]\s+(.*)/i);
    const taskOpen = line.match(/^\s*-\s*\[ \]\s+(.*)/);
    if (taskDone) {
      nodes.push(
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '2px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--done)', marginTop: 1, flexShrink: 0 }}>✓</span>
          <span style={{ color: 'var(--text-dim)', textDecoration: 'line-through', opacity: 0.6, lineHeight: 1.6 }}>{renderInline(taskDone[1], key)}</span>
        </div>
      );
      i++; continue;
    }
    if (taskOpen) {
      const lineIdx = i;
      nodes.push(
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '2px 0', fontSize: 12, cursor: 'pointer' }}
          onClick={() => opts.onTaskToggle?.(lineIdx, false)}>
          <span style={{ color: 'var(--text-faint)', marginTop: 1, flexShrink: 0, fontSize: 11 }}>○</span>
          <span style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{renderInline(taskOpen[1], key)}</span>
        </div>
      );
      i++; continue;
    }

    // ── Bullet list ──
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (bullet) {
      nodes.push(
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '1px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--text-faint)', marginTop: 3, flexShrink: 0, fontSize: 8 }}>●</span>
          <span style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{renderInline(bullet[1], key)}</span>
        </div>
      );
      i++; continue;
    }

    // ── Numbered list ──
    const numList = line.match(/^\s*\d+\.\s+(.*)/);
    if (numList) {
      const num = line.match(/^\s*(\d+)\./)?.[1];
      nodes.push(
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '1px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--text-faint)', marginTop: 0, flexShrink: 0, fontFamily: 'monospace', fontSize: 10, minWidth: 16, textAlign: 'right' }}>{num}.</span>
          <span style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{renderInline(numList[1], key)}</span>
        </div>
      );
      i++; continue;
    }

    // ── Blank line ──
    if (!line.trim()) {
      nodes.push(<div key={key} style={{ height: 6 }}/>);
      i++; continue;
    }

    // ── Paragraph ──
    nodes.push(
      <p key={key} style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.7, margin: '2px 0' }}>
        {renderInline(line, key)}
      </p>
    );
    i++;
  }

  return nodes;
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export default function Drawer({ path, onClose, onWikilinkClick }: Props) {
  const [data, setData]       = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    setLoading(true); setData(null); setEditMode(false); setSaved(false);
    fetch(`/api/gz/vault-file?path=${encodeURIComponent(path)}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then((d: FileData & { resolvedPath?: string }) => {
        setData(d);
        setEditContent(d.raw ?? '');
      })
      .catch(() => { setData(null); })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => { load(); }, [load]);

  // Tab insertion in textarea
  const handleTextareaKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart, end = el.selectionEnd;
      const v = el.value;
      setEditContent(v.slice(0, s) + '  ' + v.slice(end));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleSave(); }
    if (e.key === 'Escape') setEditMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/gz/vault-file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => { setSaved(false); load(); }, 1200);
    } catch {
      alert('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleTaskToggle = useCallback(async (lineIdx: number, done: boolean) => {
    if (!data) return;
    const fmMatch = data.raw.match(/^---[\s\S]*?---\n?/);
    const fmLineCount = fmMatch ? fmMatch[0].split('\n').length - 1 : 0;
    const absLineIdx = fmLineCount + lineIdx;
    const rawAll = data.raw.split('\n');
    if (rawAll[absLineIdx]) {
      if (done) {
        rawAll[absLineIdx] = rawAll[absLineIdx].replace(/^(\s*-\s*)\[x\]/i, '$1[ ]');
      } else {
        rawAll[absLineIdx] = rawAll[absLineIdx].replace(/^(\s*-\s*)\[ \]/, '$1[x]');
      }
    }
    const newRaw = rawAll.join('\n');
    await fetch(`/api/gz/vault-file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newRaw }),
    });
    load();
  }, [data, path, load]);

  const filename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
  const tags: string[] = Array.isArray(data?.frontmatter?.tags) ? (data!.frontmatter.tags as string[]) : [];
  const body = (data?.raw ?? '').replace(/^---[\s\S]*?---\n?/, '');
  const fmEntries = Object.entries(data?.frontmatter ?? {}).filter(([k]) => k !== 'tags');

  const lineCount = editContent.split('\n').length;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, animation: 'fade-in 0.12s ease' }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: 'rgba(10,14,22,0.94)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderLeft: '1px solid var(--glass-b-hi)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        animation: 'slide-in 0.2s cubic-bezier(0.22,0.61,0.36,1)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 50, borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text-str)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>

          {/* Edit / Preview toggle */}
          <button onClick={() => { setEditMode(m => !m); if (!editMode) setTimeout(() => textareaRef.current?.focus(), 40); }}
            style={{ border: '1px solid var(--glass-b-hi)', background: editMode ? 'rgba(77,156,248,0.1)' : 'transparent', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: editMode ? 'var(--accent)' : 'var(--text-faint)', display: 'flex', padding: '4px 8px', gap: 5, alignItems: 'center', fontSize: 10 }}>
            {editMode ? <><Eye size={11}/> Preview</> : <><Edit3 size={11}/> Edit</>}
          </button>

          {editMode && (
            <button onClick={() => void handleSave()} disabled={saving}
              style={{ border: '1px solid rgba(46,200,102,0.3)', background: saved ? 'rgba(61,224,114,0.12)' : 'transparent', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', color: saved ? 'var(--done)' : 'var(--ready)', display: 'flex', padding: '4px 10px', gap: 5, alignItems: 'center', fontSize: 10 }}>
              {saving ? <Loader size={11} className="spin"/> : <Save size={11}/>}
              {saved ? 'Saved' : saving ? 'Saving…' : '⌘S'}
            </button>
          )}

          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 4 }}>
            <X size={14}/>
          </button>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, padding: '8px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--glass-b)', flexShrink: 0 }}>
            {tags.map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 20, color: statusColor(t), background: statusColor(t) + '18', border: `1px solid ${statusColor(t)}28` }}>{t}</span>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: editMode ? 0 : '14px 16px', position: 'relative', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12, padding: '20px 16px' }}>
              <Loader size={13} className="spin"/> Loading…
            </div>
          ) : !data ? (
            <div style={{ color: 'var(--blocked)', fontSize: 12, padding: '16px' }}>File not found.</div>
          ) : editMode ? (
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={handleTextareaKey}
                spellCheck={false}
                style={{
                  flex: 1, padding: '16px', border: 'none',
                  background: 'transparent',
                  color: 'var(--text-str)', fontSize: 12, fontFamily: '"SF Mono", "Fira Code", "Fira Mono", monospace',
                  resize: 'none', outline: 'none', lineHeight: 1.7,
                  caretColor: 'var(--accent)',
                }}
              />
              <div style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', pointerEvents: 'none' }}>
                {lineCount} lines
              </div>
            </div>
          ) : (
            <>
              {/* Frontmatter metadata */}
              {fmEntries.length > 0 && (
                <div style={{ background: 'rgba(77,156,248,0.04)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 14, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', border: '1px solid var(--glass-b)' }}>
                  {fmEntries.map(([k, v]) => (
                    <div key={k}><span style={{ color: 'var(--text-faint)' }}>{k}: </span><span>{String(v)}</span></div>
                  ))}
                </div>
              )}

              {/* Rendered markdown */}
              <div style={{ lineHeight: 1.7 }}>
                {renderMarkdown(body, {
                  onWikilink: target => onWikilinkClick
                    ? onWikilinkClick(target)
                    : void fetch(`/api/gz/vault-file?path=${encodeURIComponent(target + '.md')}`),
                  onTaskToggle: handleTaskToggle,
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--glass-b)', flexShrink: 0, fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {path}
        </div>
      </div>
    </>
  );
}
