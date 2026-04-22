// Account management for fal.ai keys. Same shape as youtube-publish/tiktok-publish.
// Credentials at ~/.credentials/fal-<ref>.env with FAL_KEY=<key>.

import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface AccountFile {
  ref: string;
  path: string;
  fields: Record<string, string>;
}

export const CRED_DIR = path.join(homedir(), '.credentials');
export const PLATFORM = 'fal';

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
  const lines = [`# ${PLATFORM} API credentials`, ''];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}

export async function loadAccount(ref: string): Promise<AccountFile> {
  const p = credPath(ref);
  const raw = await readFile(p, 'utf8');
  return { ref, path: p, fields: parseEnvBody(raw) };
}

export async function listAccounts(): Promise<AccountFile[]> {
  try { await mkdir(CRED_DIR, { recursive: true }); } catch {}
  const entries = await readdir(CRED_DIR).catch(() => []);
  const out: AccountFile[] = [];
  const prefix = `${PLATFORM}-`;
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.env')) continue;
    const ref = name.slice(prefix.length, -'.env'.length);
    try { out.push(await loadAccount(ref)); } catch { }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function addAccount(ref: string, fields: Record<string, string>): Promise<AccountFile> {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(ref)) {
    throw new Error(`account ref must be lowercase letters/numbers/_/- (got "${ref}")`);
  }
  const p = credPath(ref);
  try { await stat(p); throw new Error(`account "${ref}" already exists at ${p}`); }
  catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  await mkdir(CRED_DIR, { recursive: true });
  await writeFile(p, serialize(fields), { mode: 0o600 });
  return { ref, path: p, fields };
}

export async function removeAccount(ref: string): Promise<void> {
  await unlink(credPath(ref));
}

/** Resolve a fal API key from --account-ref, $FAL_KEY env, or ~/.credentials/fal.env. */
export async function resolveKey(ref: string | undefined): Promise<string> {
  if (ref) {
    const a = await loadAccount(ref);
    const k = a.fields.FAL_KEY;
    if (!k) throw new Error(`account "${ref}" missing FAL_KEY`);
    return k;
  }
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  // Fallback: ~/.credentials/fal.env (default account)
  try {
    const raw = await readFile(path.join(CRED_DIR, `${PLATFORM}.env`), 'utf8');
    const fields = parseEnvBody(raw);
    if (fields.FAL_KEY) return fields.FAL_KEY;
  } catch { }
  throw new Error('no fal key — pass --account-ref <ref>, set FAL_KEY in env, or create ~/.credentials/fal.env');
}
