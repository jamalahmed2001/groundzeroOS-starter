'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { statusColor as sc } from '@/lib/colors';

interface Stats {
  vaultRoot: string;
  projectCount: number;
  phaseCount: number;
  byStatus: Record<string, number>;
  projectsNoPhases: string[];
}

export default function SystemView({ onRunCLI }: { onRunCLI: (cmd: string, args?: string[]) => void }) {
  const [data, setData] = useState<{ stats: Stats; doctorOutput: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/gz/doctor').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-str)' }}>System</span>
        <button onClick={load} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
          <RefreshCw size={12} className={loading ? 'spin' : ''}/>
        </button>
      </div>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Vault stats */}
          <div style={{ border: '1px solid var(--glass-b)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vault</div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Row label="Root" value={data.stats.vaultRoot} mono/>
              <Row label="Projects" value={String(data.stats.projectCount)}/>
              <Row label="Phases" value={String(data.stats.phaseCount)}/>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {Object.entries(data.stats.byStatus).map(([s, n]) => n > 0 && (
                  <span key={s} style={{ fontSize: 10, fontFamily: 'monospace', color: sc(s) }}>{s}: {n}</span>
                ))}
              </div>
            </div>
          </div>

          {/* No-phase projects */}
          {data.stats.projectsNoPhases.length > 0 && (
            <div style={{ border: '1px solid var(--blocked)44', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--blocked)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Projects without phases ({data.stats.projectsNoPhases.length})</div>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.stats.projectsNoPhases.map(id => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>{id}</span>
                    <button onClick={() => onRunCLI('plan', [id])} style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)44', background: 'transparent', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Decompose</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Doctor output */}
          {data.doctorOutput && (
            <div style={{ border: '1px solid var(--glass-b)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
                Doctor
                <button onClick={() => onRunCLI('doctor')} style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)44', background: 'transparent', borderRadius: 4, padding: '1px 7px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Re-run</button>
              </div>
              <pre style={{ padding: '12px 14px', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.7 }}>
                {stripAnsi(data.doctorOutput).slice(0, 8000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-str)', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

// eslint-disable-next-line no-control-regex
function stripAnsi(s: string) { return s.replace(/\x1B\[[0-9;]*[mGKHF]/g, ''); }

// sc imported from @/lib/colors at top of file
