#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { searchPubMed, type SearchOptions } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  const code = (err as { code?: number })?.code;
  if (code === 429) return 'rate_limit';
  if (code === 401 || code === 403) return 'auth';
  if (typeof code === 'number' && code >= 500) return 'upstream';
  if (typeof code === 'number' && code >= 400) return 'policy';
  if (err instanceof Error && /AbortError|timeout/i.test(err.name + err.message)) return 'timeout';
  return 'unknown';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'query':         { type: 'string', multiple: true },
      'queries-file':  { type: 'string' },
      'max':           { type: 'string' },
      'api-key':       { type: 'string' },
      'output':        { type: 'string' },
      'help':          { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | string[] | boolean | undefined> };

  if (values.help) {
    process.stdout.write([
      'pubmed-search — search PubMed E-utilities, return abstracts',
      '',
      '  --query "<term>" (repeatable)   — one or more search terms',
      '  --queries-file <path>          — JSON array of query strings (alt to --query)',
      '  --max <n>                       — per-query result cap (default 10)',
      '  --api-key <key>                 — optional NCBI API key (rate limit 10/s)',
      '  --output <path>                 — write results to file (otherwise inline)',
    ].join('\n') + '\n');
    process.exit(0);
  }

  let queries: string[] = [];
  if (Array.isArray(values.query)) queries = values.query as string[];
  else if (typeof values.query === 'string') queries = [values.query];

  if (values['queries-file']) {
    try {
      const raw = await readFile(values['queries-file'] as string, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((q) => typeof q === 'string')) {
        emitErrAndExit('config', '--queries-file must be a JSON array of strings');
      }
      queries = queries.concat(parsed as string[]);
    } catch (err) {
      emitErrAndExit('config', `Cannot read --queries-file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (queries.length === 0) emitErrAndExit('config', 'at least one --query or --queries-file required');

  const opts: SearchOptions = {
    apiKey:       (values['api-key'] as string | undefined) ?? process.env.PUBMED_API_KEY,
    maxPerQuery:  values.max ? Number(values.max) : undefined,
  };
  if (opts.maxPerQuery !== undefined && (Number.isNaN(opts.maxPerQuery) || opts.maxPerQuery <= 0)) {
    emitErrAndExit('config', '--max must be a positive number');
  }

  try {
    const articles = await searchPubMed(queries, opts);
    if (values.output) {
      await mkdir(path.dirname(path.resolve(values.output as string)), { recursive: true });
      await writeFile(values.output as string, JSON.stringify(articles, null, 2));
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      queries: queries.length,
      count: articles.length,
      output: values.output ?? null,
      articles: values.output ? undefined : articles,
    }) + '\n');
  } catch (err) {
    emitErrAndExit(classifyErr(err), err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
