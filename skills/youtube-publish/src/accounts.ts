// Account management for youtube-publish.
// Credentials live at ~/.credentials/youtube-<ref>.env
// Each file declares BACKEND=api or BACKEND=browser plus the matching fields.

import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type Backend = 'api' | 'browser';

export interface AccountFile {
  ref: string;
  path: string;
  backend: Backend;
  fields: Record<string, string>;
}

export const CRED_DIR = path.join(homedir(), '.credentials');
export const PLATFORM = 'youtube';

export function credPath(ref: string): string {
  return path.join(CRED_DIR, `${PLATFORM}-${ref}.env`);
}

function parseEnvBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    if (line.trim().startsWith('#') || !line.trim()) continue;
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function serialize(fields: Record<string, string>): string {
  const lines = [`# ${PLATFORM}-publish account credentials`, ''];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}

export async function loadAccount(ref: string): Promise<AccountFile> {
  const p = credPath(ref);
  const raw = await readFile(p, 'utf8');
  const fields = parseEnvBody(raw);
  const backend = (fields.BACKEND?.toLowerCase() === 'browser' ? 'browser' : 'api') as Backend;
  return { ref, path: p, backend, fields };
}

export async function listAccounts(): Promise<AccountFile[]> {
  try { await mkdir(CRED_DIR, { recursive: true }); } catch {}
  const entries = await readdir(CRED_DIR).catch(() => []);
  const out: AccountFile[] = [];
  const prefix = `${PLATFORM}-`;
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.env')) continue;
    const ref = name.slice(prefix.length, -'.env'.length);
    try { out.push(await loadAccount(ref)); } catch { /* unreadable, skip */ }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function addAccount(ref: string, backend: Backend, fields: Record<string, string>): Promise<AccountFile> {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(ref)) {
    throw new Error(`account ref must be lowercase letters/numbers/_/- (got "${ref}")`);
  }
  const p = credPath(ref);
  try { await stat(p); throw new Error(`account "${ref}" already exists at ${p} — use 'account remove' first or 'account edit'`); }
  catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  await mkdir(CRED_DIR, { recursive: true });
  const payload = { BACKEND: backend, ...fields };
  await writeFile(p, serialize(payload), { mode: 0o600 });
  return { ref, path: p, backend, fields: payload };
}

export async function removeAccount(ref: string): Promise<void> {
  await unlink(credPath(ref));
}

export function requiredFieldsFor(backend: Backend): string[] {
  if (backend === 'api') {
    return ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];
  }
  return ['YOUTUBE_CHANNEL_URL'];
}

export function validateFields(backend: Backend, fields: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const k of requiredFieldsFor(backend)) if (!fields[k]) missing.push(k);
  return missing;
}
