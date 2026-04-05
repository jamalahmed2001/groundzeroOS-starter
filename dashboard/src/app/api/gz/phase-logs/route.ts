import { NextResponse } from 'next/server';
import { getVaultRoot, readVaultFile } from '@/lib/vault';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });

  const vaultRoot = getVaultRoot();
  const absPath = path.resolve(vaultRoot, relPath);
  if (!absPath.startsWith(path.resolve(vaultRoot))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const file = readVaultFile(vaultRoot, relPath);
  if (!file) return NextResponse.json({ exists: false, content: null });

  const phaseNum = file.frontmatter['phase_number'] ?? 0;
  const phaseName = String(file.frontmatter['phase_name'] ?? '');
  const phasesDir = path.dirname(absPath);
  const bundleDir = path.dirname(phasesDir);
  const logsDir = path.join(bundleDir, 'Logs');
  const logPath = phaseName
    ? path.join(logsDir, `L${phaseNum} - ${phaseName}.md`)
    : path.join(logsDir, `L${phaseNum}.md`);

  if (!fs.existsSync(logPath)) {
    return NextResponse.json({ exists: false, content: null, logPath: path.relative(vaultRoot, logPath) });
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const stat = fs.statSync(logPath);
  return NextResponse.json({ exists: true, content, modifiedAt: stat.mtimeMs });
}
