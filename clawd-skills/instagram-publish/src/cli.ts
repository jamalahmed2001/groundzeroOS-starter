#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadVideo, type ClientConfig, type UploadInput } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  const code = (err as { code?: number | string })?.code;
  if (code === 401 || code === 403 || code === 190) return 'auth';    // 190 = invalid OAuth token
  if (code === 'policy') return 'policy';
  if (code === 'timeout') return 'timeout';
  if (code === 429 || code === 4 || code === 17) return 'rate_limit'; // 4/17 = app rate limit
  if (typeof code === 'number' && code >= 500) return 'upstream';
  return 'unknown';
}

async function loadConfig(accountRef?: string): Promise<ClientConfig> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (accountRef) {
    const credPath = path.join(process.env.HOME ?? '~', '.credentials', `instagram-${accountRef}.env`);
    try {
      const raw = await readFile(credPath, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch {
      emitErrAndExit('config', `Missing credentials file: ${credPath}`);
    }
  }
  const igUserId = env.INSTAGRAM_IG_USER_ID;
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !accessToken) {
    emitErrAndExit('config', 'Missing INSTAGRAM_IG_USER_ID / INSTAGRAM_ACCESS_TOKEN');
  }
  return { igUserId, accessToken };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'account-ref':        { type: 'string' },
      'video-url':          { type: 'string' },
      'caption':            { type: 'string' },
      'caption-file':       { type: 'string' },
      'cover-url':          { type: 'string' },
      'thumb-offset-ms':    { type: 'string' },
      'share-to-feed':      { type: 'boolean', default: false },
      'poll-interval-ms':   { type: 'string', default: '5000' },
      'poll-timeout-ms':    { type: 'string', default: '300000' },
      'help':               { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  if (values.help) {
    process.stdout.write('See SKILL.md. Quick form:\n');
    process.stdout.write('  instagram-publish --account-ref maniplus --video-url https://... --caption "…"\n');
    process.exit(0);
  }

  if (!values['video-url']) {
    emitErrAndExit('config', '--video-url <url> required (Instagram fetches the video from this URL itself — must be publicly accessible)');
  }

  let caption = values.caption as string | undefined;
  if (values['caption-file']) {
    caption = await readFile(values['caption-file'] as string, 'utf8');
  }

  const cfg = await loadConfig(values['account-ref'] as string | undefined);

  const input: UploadInput = {
    videoUrl: values['video-url'] as string,
    caption,
    coverUrl: values['cover-url'] as string | undefined,
    thumbOffsetMs: values['thumb-offset-ms'] ? Number(values['thumb-offset-ms']) : undefined,
    shareToFeed: Boolean(values['share-to-feed']),
  };

  try {
    const result = await uploadVideo(cfg, input, {
      pollIntervalMs: Number(values['poll-interval-ms']),
      timeoutMs: Number(values['poll-timeout-ms']),
    });
    process.stdout.write(JSON.stringify({
      ok: true,
      platform: 'instagram',
      container_id: result.containerId,
      media_id: result.mediaId,
      url: result.url,
    }) + '\n');
  } catch (err) {
    emitErrAndExit(classifyErr(err), err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
