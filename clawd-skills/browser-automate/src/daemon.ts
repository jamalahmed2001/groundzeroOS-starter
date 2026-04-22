import { spawn } from 'child_process';
import { readFile, writeFile, stat, mkdir, access } from 'fs/promises';
import { constants as fsC } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface DaemonConfig {
  port: number;
  userDataDir: string;
  chromeBinary: string;
  pidFile: string;
}

async function resolveChromeBinary(): Promise<string> {
  const override = process.env.BROWSER_AUTOMATE_CHROME;
  if (override) return override;
  const candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  for (const p of candidates) {
    try { await access(p, fsC.X_OK); return p; } catch { /* next */ }
  }
  throw new Error('No Chrome binary found. Install google-chrome or set BROWSER_AUTOMATE_CHROME.');
}

export async function defaultDaemonConfig(): Promise<DaemonConfig> {
  const port = Number(process.env.BROWSER_AUTOMATE_DAEMON_PORT ?? 9222);
  const userDataDir = process.env.BROWSER_AUTOMATE_DAEMON_PROFILE
    ?? join(homedir(), '.cache', 'browser-automate', 'daemon-profile');
  const pidFile = join(homedir(), '.cache', 'browser-automate', 'daemon.pid');
  return { port, userDataDir, chromeBinary: await resolveChromeBinary(), pidFile };
}

export async function daemonStatus(cfg?: DaemonConfig): Promise<{ running: boolean; pid?: number; cdpUrl: string }> {
  const c = cfg ?? (await defaultDaemonConfig());
  const cdpUrl = `http://localhost:${c.port}`;

  // Try the CDP endpoint first — that's ground truth.
  try {
    const resp = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      let pid: number | undefined;
      try { pid = Number((await readFile(c.pidFile, 'utf8')).trim()); } catch { /* no pidfile */ }
      return { running: true, pid, cdpUrl };
    }
  } catch { /* not running */ }

  return { running: false, cdpUrl };
}

export async function daemonStart(cfg?: DaemonConfig): Promise<{ pid: number; cdpUrl: string }> {
  const c = cfg ?? (await defaultDaemonConfig());
  const existing = await daemonStatus(c);
  if (existing.running) return { pid: existing.pid ?? -1, cdpUrl: existing.cdpUrl };

  // Seed the automation profile from the user's daily Chrome profile the FIRST TIME ONLY.
  // This gives us their active logins (Suno, Udio, etc.) without disrupting their daily browser.
  await mkdir(c.userDataDir, { recursive: true });
  const seeded = await isProfileSeeded(c.userDataDir);
  if (!seeded) {
    await seedFromDailyProfile(c.userDataDir);
  }

  const child = spawn(
    c.chromeBinary,
    [
      `--remote-debugging-port=${c.port}`,
      `--user-data-dir=${c.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':0' },
    },
  );
  child.unref();

  await mkdir(join(c.pidFile, '..'), { recursive: true });
  await writeFile(c.pidFile, String(child.pid), 'utf8');

  // Wait for CDP endpoint to come up
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://localhost:${c.port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (resp.ok) return { pid: child.pid ?? -1, cdpUrl: `http://localhost:${c.port}` };
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Daemon launched (pid ${child.pid}) but CDP endpoint never came up on port ${c.port}`);
}

export async function daemonStop(cfg?: DaemonConfig): Promise<{ stopped: boolean; pid?: number }> {
  const c = cfg ?? (await defaultDaemonConfig());
  let pid: number | undefined;
  try {
    pid = Number((await readFile(c.pidFile, 'utf8')).trim());
  } catch { /* no pidfile */ }

  if (!pid) {
    // Fall back to scanning for the matching Chrome process.
    return { stopped: false };
  }

  try {
    process.kill(pid, 'SIGTERM');
    // Give it 3s to exit cleanly, then SIGKILL.
    await new Promise((r) => setTimeout(r, 3000));
    try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
  } catch { /* was already dead */ }

  return { stopped: true, pid };
}

async function isProfileSeeded(userDataDir: string): Promise<boolean> {
  try {
    const s = await stat(join(userDataDir, 'Default', 'Cookies'));
    return s.size > 0;
  } catch {
    return false;
  }
}

async function seedFromDailyProfile(userDataDir: string): Promise<void> {
  const dailyProfile = join(homedir(), '.config', 'google-chrome', 'Default');
  try {
    await stat(dailyProfile);
  } catch {
    return; // no daily profile to seed from — start fresh
  }

  const { spawn: sp } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    const rsync = sp('rsync', [
      '-a',
      '--delete',
      '--exclude=Cache*',
      '--exclude=Code Cache',
      '--exclude=GPUCache',
      '--exclude=Service Worker/CacheStorage',
      '--exclude=Crashpad',
      '--exclude=Crash Reports',
      '--exclude=BrowserMetrics',
      '--exclude=Singleton*',
      `${dailyProfile}/`,
      `${join(userDataDir, 'Default')}/`,
    ], { stdio: 'inherit' });
    rsync.on('close', (code) => code === 0 ? resolve() : reject(new Error(`rsync exited ${code}`)));
    rsync.on('error', reject);
  });

  // Also copy Local State (has the encryption key refs).
  try {
    const { copyFile } = await import('fs/promises');
    await copyFile(join(homedir(), '.config', 'google-chrome', 'Local State'), join(userDataDir, 'Local State'));
  } catch { /* non-fatal */ }
}
