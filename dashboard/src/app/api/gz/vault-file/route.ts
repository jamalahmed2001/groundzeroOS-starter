import { NextResponse } from 'next/server';
import { getVaultRoot, readVaultFile, writeVaultFile } from '@/lib/vault';
import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

export const dynamic = 'force-dynamic';

// Resolve a wikilink target (bare name like "My Project - Knowledge") to a vault-relative path
function resolveWikilink(vaultRoot: string, target: string): string | null {
  const name = target.endsWith('.md') ? target : target + '.md';

  // Try exact relative path first
  if (fs.existsSync(path.resolve(vaultRoot, name))) return name;

  // Search vault for a matching filename
  try {
    const matches = glob.sync(`**/${name.replace(/[[\]{}()]/g, '\\$&')}`, {
      cwd: vaultRoot,
      ignore: ['**/.trash/**', '**/.git/**', '**/node_modules/**'],
      caseSensitiveMatch: false,
    });
    if (matches.length > 0) return matches[0]!;
  } catch { /* fallback */ }

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  const vaultRoot = getVaultRoot();

  // If direct path doesn't exist, try resolving as a wikilink target
  const abs = path.resolve(vaultRoot, relPath);
  if (!fs.existsSync(abs)) {
    const resolved = resolveWikilink(vaultRoot, relPath);
    if (resolved) {
      relPath = resolved;
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const result = readVaultFile(vaultRoot, relPath);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...result, resolvedPath: relPath });
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  const { content } = await req.json() as { content: string };
  const vaultRoot = getVaultRoot();
  const ok = writeVaultFile(vaultRoot, relPath, content);
  if (!ok) return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
