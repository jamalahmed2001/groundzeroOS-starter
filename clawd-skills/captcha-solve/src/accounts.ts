// Multi-account for captcha solver providers.
// ~/.credentials/captcha-<ref>.env  PROVIDER=2captcha|anticaptcha|capmonster   API_KEY=...

import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type Provider = '2captcha' | 'anticaptcha' | 'capmonster' | 'human';

export interface Account {
  ref: string;
  path: string;
  provider: Provider;
  fields: Record<string, string>;
}

export const CRED_DIR = path.join(homedir(), '.credentials');
export const PLATFORM = 'captcha';

export function credPath(ref: string): string {
  return path.join(CRED_DIR, `${PLATFORM}-${ref}.env`);
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    if (line.trim().startsWith('#') || !line.trim()) continue;
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function serialize(fields: Record<string, string>): string {
  const lines = [`# captcha-solve credentials`, ''];
  for (const [k, v] of Object.entries(fields)) if (v != null) lines.push(`${k}=${v}`);
  return lines.join('\n') + '\n';
}

export async function loadAccount(ref: string): Promise<Account> {
  const p = credPath(ref);
  const fields = parseEnv(await readFile(p, 'utf8'));
  const provider = (fields.PROVIDER?.toLowerCase() || '2captcha') as Provider;
  return { ref, path: p, provider, fields };
}

export async function listAccounts(): Promise<Account[]> {
  try { await mkdir(CRED_DIR, { recursive: true }); } catch { /* */ }
  const entries = await readdir(CRED_DIR).catch(() => []);
  const out: Account[] = [];
  const prefix = `${PLATFORM}-`;
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.env')) continue;
    const ref = name.slice(prefix.length, -'.env'.length);
    try { out.push(await loadAccount(ref)); } catch { /* */ }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function addAccount(ref: string, provider: Provider, fields: Record<string, string>): Promise<Account> {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(ref)) throw new Error(`bad ref "${ref}"`);
  const p = credPath(ref);
  try { await stat(p); throw new Error(`account "${ref}" exists at ${p}`); }
  catch (e: unknown) { if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e; }
  await mkdir(CRED_DIR, { recursive: true });
  const payload = { PROVIDER: provider, ...fields };
  await writeFile(p, serialize(payload), { mode: 0o600 });
  return { ref, path: p, provider, fields: payload };
}

export async function removeAccount(ref: string): Promise<void> { await unlink(credPath(ref)); }

export async function resolveAccount(ref: string | undefined): Promise<Account> {
  if (ref) return loadAccount(ref);
  // Fallback default
  try { return await loadAccount('default'); }
  catch { throw new Error('no captcha solver configured — run: captcha-solve account add default --provider 2captcha --field API_KEY=...'); }
}
