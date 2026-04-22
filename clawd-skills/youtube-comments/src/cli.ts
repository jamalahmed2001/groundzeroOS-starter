#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchComments, postReply, type ReadConfig, type OAuthConfig } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  const code = (err as { code?: number | string })?.code;
  if (code === 401 || code === 403 || code === 'UNAUTHENTICATED') return 'auth';
  if (code === 429) return 'rate_limit';
  if (typeof code === 'number' && code >= 500) return 'upstream';
  if (code === 400 || code === 422) return 'policy';
  // YouTube often throws quotaExceeded as 403 with reason embedded in message
  if (err instanceof Error && /quota/i.test(err.message)) return 'quota';
  return 'unknown';
}

async function loadEnv(accountRef?: string): Promise<Record<string, string>> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (!accountRef) return env;

  const credPath = path.join(process.env.HOME ?? '~', '.credentials', `youtube-${accountRef}.env`);
  try {
    const raw = await readFile(credPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    emitErrAndExit('config', `Missing credentials file: ${credPath}`);
  }
  return env;
}

function readConfigFrom(env: Record<string, string>): ReadConfig {
  // Prefer a dedicated read-only key; fall back to OAuth clientId when an API key isn't set
  const key = env.YOUTUBE_API_KEY;
  if (!key) emitErrAndExit('config', 'Missing YOUTUBE_API_KEY for comment fetch');
  return { apiKey: key };
}

function oauthConfigFrom(env: Record<string, string>): OAuthConfig {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    emitErrAndExit('config', 'Missing YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN for reply post');
  }
  return { clientId: YOUTUBE_CLIENT_ID, clientSecret: YOUTUBE_CLIENT_SECRET, refreshToken: YOUTUBE_REFRESH_TOKEN };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'account-ref': { type: 'string' },
      // fetch mode
      'video-id':    { type: 'string' },
      'max':         { type: 'string' },
      'since':       { type: 'string' },
      'output':      { type: 'string' },
      // post-reply mode
      'post-reply':  { type: 'boolean', default: false },
      'comment-id':  { type: 'string' },
      'text':        { type: 'string' },
      'help':        { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  if (values.help) {
    process.stdout.write([
      'youtube-comments — fetch comments or post a reply',
      '',
      'Fetch: --account-ref <ref> --video-id <id> [--max 100] [--since ISO] [--output file.json]',
      'Post : --account-ref <ref> --post-reply --comment-id <id> --text "…"',
    ].join('\n') + '\n');
    process.exit(0);
  }

  const env = await loadEnv(values['account-ref'] as string | undefined);

  try {
    if (values['post-reply']) {
      if (!values['comment-id']) emitErrAndExit('config', '--comment-id required with --post-reply');
      if (!values.text)          emitErrAndExit('config', '--text required with --post-reply');
      const cfg = oauthConfigFrom(env);
      const reply = await postReply(cfg, {
        commentId: values['comment-id'] as string,
        text:      values.text as string,
      });
      process.stdout.write(JSON.stringify({
        ok: true, op: 'post-reply',
        reply_id: reply.id,
        parent_id: values['comment-id'],
        text: reply.text,
      }) + '\n');
      return;
    }

    if (!values['video-id']) emitErrAndExit('config', '--video-id required for fetch mode');
    const cfg = readConfigFrom(env);
    const max = values.max ? Number(values.max) : 100;
    if (Number.isNaN(max) || max <= 0) emitErrAndExit('config', '--max must be a positive number');

    const comments = await fetchComments(cfg, {
      videoId: values['video-id'] as string,
      max,
      sinceIso: values.since as string | undefined,
    });

    if (values.output) {
      await mkdir(path.dirname(path.resolve(values.output as string)), { recursive: true });
      await writeFile(values.output as string, JSON.stringify(comments, null, 2));
    }
    process.stdout.write(JSON.stringify({
      ok: true, op: 'fetch',
      video_id: values['video-id'],
      count: comments.length,
      output: values.output ?? null,
      comments: values.output ? undefined : comments,
    }) + '\n');
  } catch (err) {
    const kind = classifyErr(err);
    const message = err instanceof Error ? err.message : String(err);
    emitErrAndExit(kind, message);
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
