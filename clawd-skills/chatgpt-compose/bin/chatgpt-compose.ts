#!/usr/bin/env bun
// chatgpt-compose — drop-in alternative to nano-compose.ts (nano-banana/FAL).
// Same CLI shape, but routes through ChatGPT's web UI under your Plus/Pro
// subscription (no API cost, no FAL credits) via the browser-automate daemon.
//
// Usage:
//   bun chatgpt-compose.ts \
//     --output OUT.png \
//     --prompt "<edit instruction or generation prompt>" \
//     [--aspect-ratio 16:9] \
//     [--start-path /g/g-p-XXXX/project] \
//     [--timeout-ms 300000] \
//     [IMG1 IMG2 ... up to 20]   # zero refs = text-to-image primary generation
//
// Env:
//   CHATGPT_START_PATH     Default --start-path (e.g. your Project URL)
//   BROWSER_AUTOMATE_BIN   Override the browser-automate binary path
//
// Output (stdout): { ok: true, output, bytes, imageUrl, chatUrl, durationMs }

import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

const BA_BIN =
  process.env.BROWSER_AUTOMATE_BIN ??
  join(homedir(), 'clawd', 'skills', 'browser-automate', 'bin', 'browser-automate');

interface BAResult {
  ok: boolean;
  recipe?: string;
  data?: { provider: string; output: string; bytes: number; imageUrl: string; chatUrl: string };
  error?: string;
  durationMs?: number;
  screenshots?: string[];
}

function fail(msg: string, code = 1): never {
  console.error(`[chatgpt-compose] ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let output = '';
let prompt = '';
let aspectRatio = '';
let startPath = process.env.CHATGPT_START_PATH ?? '';
let timeoutMs = 0;
const images: string[] = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--output') output = argv[++i];
  else if (a === '--prompt') prompt = argv[++i];
  else if (a === '--aspect-ratio') aspectRatio = argv[++i];
  else if (a === '--start-path') startPath = argv[++i];
  else if (a === '--timeout-ms') timeoutMs = Number(argv[++i]);
  else if (a === '-h' || a === '--help') {
    console.log(
      'Usage: bun chatgpt-compose.ts --output OUT.png --prompt "..." [--aspect-ratio 16:9] [--start-path /g/...] [IMG1 IMG2 ...]',
    );
    console.log('Zero refs = text-to-image (primary character/location generation).');
    process.exit(0);
  } else images.push(a);
}

if (!output || !prompt) {
  fail('missing required args (--output and --prompt). See --help.');
}
if (images.length > 20) {
  fail(`ChatGPT caps at 20 attachments per message; got ${images.length}.`);
}
for (const p of images) {
  if (!existsSync(p)) fail(`reference image not found: ${p}`);
}
if (images.length === 0) {
  console.error('[chatgpt-compose] zero-ref mode (text-to-image, no references)');
}

const args: Record<string, unknown> = { images, prompt, output };
if (aspectRatio) args.aspectRatio = aspectRatio;
if (startPath) args.startPath = startPath;
if (timeoutMs) args.imageTimeoutMs = timeoutMs;

const baArgs = [
  'run',
  'chatgpt',
  '--args-json',
  JSON.stringify(args),
  '--timeout-ms',
  String(timeoutMs || 600000),
];

console.error(
  `[chatgpt-compose] ${images.length === 0 ? 'generating from text' : `composing ${images.length} ref(s)`}${aspectRatio ? ` @${aspectRatio}` : ''} → ${output}`,
);

const child = spawn(BA_BIN, baArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
const chunks: Buffer[] = [];
child.stdout.on('data', (c: Buffer) => chunks.push(c));
child.on('error', (err) => fail(`failed to spawn browser-automate: ${err.message}`));
child.on('close', () => {
  const txt = Buffer.concat(chunks).toString('utf8').trim();
  if (!txt) fail('browser-automate produced no stdout');
  // Last JSON line is the result envelope.
  const lines = txt.split('\n');
  let result: BAResult | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { result = JSON.parse(line) as BAResult; break; } catch { /* try earlier */ }
  }
  if (!result) fail(`browser-automate returned non-JSON:\n${txt.slice(0, 500)}`);
  if (!result.ok) {
    const screens = result.screenshots?.length ? `\nscreenshot: ${result.screenshots[0]}` : '';
    fail(`recipe failed: ${result.error ?? 'unknown'}${screens}`, 2);
  }
  if (!result.data) fail('recipe ok but returned no data');
  console.log(
    JSON.stringify(
      { ok: true, ...result.data, durationMs: result.durationMs ?? null },
    ),
  );
  console.error(`[OK] ${result.data.output}`);
});
