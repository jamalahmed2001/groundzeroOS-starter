import { NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const dynamic = 'force-dynamic';

const GZOS_ROOT = path.resolve(process.cwd(), '..');
const GZOS_BIN  = path.join(GZOS_ROOT, 'dist', 'cli', 'gzos.js');

// Commands that complete quickly — use execSync
const SYNC_CMDS = new Set(['status', 'heal', 'doctor', 'logs', 'capture', 'set-state']);
// Commands that may take minutes (LLM calls, agent spawns) — fire-and-forget
const ASYNC_CMDS = new Set([
  'run', 'init',
  'plan', 'research', 'consolidate', 'import', 'import-linear', 'refresh-context', 'linear-uplink', 'daily-plan',
  // deprecated aliases — kept for backward compat
  'atomise', 'atomize', 'atomise-project', 'plan-phase', 'plan-project', 'execute',
]);

const ALLOWED = new Set([...SYNC_CMDS, ...ASYNC_CMDS, 'reset']);

// In-memory job store (per server instance; good enough for single-user dashboard)
interface Job { pid: number; cmd: string; logFile: string; startedAt: number; done: boolean; exitCode: number | null }
const jobs = new Map<string, Job>();

function nextJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(req: Request) {
  const body = await req.json() as { cmd: string; args?: string[] };
  const { cmd, args = [] } = body;

  if (!ALLOWED.has(cmd)) {
    return NextResponse.json({ error: `Command '${cmd}' not allowed` }, { status: 400 });
  }

  // Sanitise args
  const safeArgs = args.map(a => a.replace(/[;&|`$<>\\"'(){}*?!\n\r]/g, '').trim()).filter(Boolean);

  if (ASYNC_CMDS.has(cmd)) {
    // Fire-and-forget: spawn detached, return jobId for polling
    const jobId = nextJobId();
    const logFile = path.join(os.tmpdir(), `gzos_${jobId}.log`);

    const child = spawn('node', [GZOS_BIN, cmd, ...safeArgs], {
      cwd: GZOS_ROOT,
      env: { ...process.env },
      detached: true,
      stdio: ['ignore', fs.openSync(logFile, 'w'), fs.openSync(logFile, 'a')],
    });

    const pid = child.pid ?? -1;
    child.unref();

    jobs.set(jobId, { pid, cmd, logFile, startedAt: Date.now(), done: false, exitCode: null });

    // Track completion async
    child.on('exit', (code) => {
      const job = jobs.get(jobId);
      if (job) { job.done = true; job.exitCode = code ?? 0; }
    });

    return NextResponse.json({ ok: true, async: true, jobId, pid, logFile });
  }

  // Synchronous — fast commands
  try {
    const output = execSync(`node "${GZOS_BIN}" ${cmd} ${safeArgs.map(a => `"${a}"`).join(' ')}`.trim(), {
      cwd: GZOS_ROOT,
      timeout: 30_000,
      env: { ...process.env },
      encoding: 'utf8',
    });
    return NextResponse.json({ output: stripAnsi(output), exitCode: 0 });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number; message?: string };
    const combined = stripAnsi((e.stdout ?? '') + (e.stderr ?? ''));
    return NextResponse.json({ output: combined || (e.message ?? 'Command failed'), exitCode: e.status ?? 1 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (jobId) {
    // Poll specific job
    const job = jobs.get(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    let tail = '';
    try {
      const content = fs.readFileSync(job.logFile, 'utf8');
      // Return last 4KB of log
      tail = stripAnsi(content.slice(-4096));
    } catch { /* log not yet written */ }
    return NextResponse.json({ jobId, pid: job.pid, cmd: job.cmd, done: job.done, exitCode: job.exitCode, output: tail });
  }

  // List recent jobs
  const list = Array.from(jobs.entries())
    .map(([id, j]) => ({ jobId: id, pid: j.pid, cmd: j.cmd, done: j.done, exitCode: j.exitCode, startedAt: j.startedAt }))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 20);
  return NextResponse.json({ jobs: list });
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}
