#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchFeeds } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'url':        { type: 'string', multiple: true },
      'urls-file':  { type: 'string' },
      'output':     { type: 'string' },
      'timeout-ms': { type: 'string' },
      'help':       { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | string[] | boolean | undefined> };

  if (values.help) {
    process.stdout.write([
      'rss-fetch — fetch RSS/Atom feeds and normalise to JSON',
      '',
      '  --url <url> (repeatable)   — one or more feed URLs',
      '  --urls-file <path>         — JSON array of URLs (alt to --url)',
      '  --output <path>            — write items to file (otherwise inline)',
      '  --timeout-ms <n>           — per-feed timeout (default 15000)',
    ].join('\n') + '\n');
    process.exit(0);
  }

  let urls: string[] = [];
  if (Array.isArray(values.url)) urls = values.url as string[];
  else if (typeof values.url === 'string') urls = [values.url];

  if (values['urls-file']) {
    try {
      const raw = await readFile(values['urls-file'] as string, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((u) => typeof u === 'string')) {
        emitErrAndExit('config', '--urls-file must be a JSON array of strings');
      }
      urls = urls.concat(parsed as string[]);
    } catch (err) {
      emitErrAndExit('config', `Cannot read --urls-file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (urls.length === 0) emitErrAndExit('config', 'at least one --url or --urls-file required');

  const timeoutMs = values['timeout-ms'] ? Number(values['timeout-ms']) : undefined;
  if (timeoutMs !== undefined && (Number.isNaN(timeoutMs) || timeoutMs <= 0)) {
    emitErrAndExit('config', '--timeout-ms must be a positive number');
  }

  try {
    const result = await fetchFeeds(urls, { timeoutMs });
    if (values.output) {
      await mkdir(path.dirname(path.resolve(values.output as string)), { recursive: true });
      await writeFile(values.output as string, JSON.stringify(result.items, null, 2));
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      feeds: urls.length,
      count: result.items.length,
      errors: result.errors,
      output: values.output ?? null,
      items: values.output ? undefined : result.items,
    }) + '\n');
  } catch (err) {
    emitErrAndExit('unknown', err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
