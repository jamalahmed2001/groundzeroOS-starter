#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadVideo, type ClientConfig, type UploadInput } from './client.js';
import {
  listAccounts, loadAccount, addAccount, removeAccount, credPath,
  validateFields, requiredFieldsFor,
  type Backend,
} from './accounts.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  const code = (err as { code?: number | string })?.code;
  if (code === 401 || code === 403 || code === 'UNAUTHENTICATED') return 'auth';
  if (code === 402 || code === 403) return 'quota';
  if (code === 400 || code === 422) return 'policy';
  if (code === 429) return 'rate_limit';
  if (typeof code === 'number' && code >= 500) return 'upstream';
  return 'unknown';
}

/**
 * Load credentials in priority order:
 *   1. --account-ref <ref>  → ~/.credentials/youtube-<ref>.env
 *   2. process.env         (YOUTUBE_CLIENT_ID etc)
 */
async function loadConfig(accountRef?: string): Promise<ClientConfig> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  if (accountRef) {
    const credPath = path.join(
      process.env.HOME ?? '~',
      '.credentials',
      `youtube-${accountRef}.env`,
    );
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

  const clientId = env.YOUTUBE_CLIENT_ID;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    emitErrAndExit('config', 'Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN');
  }
  return {
    clientId, clientSecret, refreshToken,
    channelId: env.YOUTUBE_CHANNEL_ID,
  };
}

async function cmdAccount(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || sub === '-h') {
    process.stdout.write([
      'youtube-publish account <action>',
      '',
      'Actions:',
      '  list                          Show all configured YouTube accounts',
      '  show <ref>                    Show details for one account',
      '  add <ref> --backend api|browser [--field KEY=VAL ...]',
      '                                Register a new account. Pass --backend and fields.',
      '                                API fields: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,',
      '                                            YOUTUBE_REFRESH_TOKEN, YOUTUBE_CHANNEL_ID (optional)',
      '                                Browser fields: YOUTUBE_CHANNEL_URL, YOUTUBE_CHANNEL_ID,',
      '                                                YOUTUBE_HANDLE',
      '  remove <ref>                  Delete an account credential file',
      '',
      'Credentials live at ~/.credentials/youtube-<ref>.env (mode 600).',
      '',
    ].join('\n'));
    return;
  }
  if (sub === 'list') {
    const accounts = await listAccounts();
    if (accounts.length === 0) {
      process.stdout.write(JSON.stringify({ ok: true, accounts: [] }, null, 2) + '\n');
      process.stdout.write('# No accounts configured. Add one with:\n#   youtube-publish account add <ref> --backend api\n');
      return;
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      count: accounts.length,
      accounts: accounts.map(a => ({
        ref: a.ref,
        backend: a.backend,
        channel_id: a.fields.YOUTUBE_CHANNEL_ID || null,
        channel_url: a.fields.YOUTUBE_CHANNEL_URL || null,
        handle: a.fields.YOUTUBE_HANDLE || null,
        has_refresh_token: a.backend === 'api' ? !!a.fields.YOUTUBE_REFRESH_TOKEN : null,
      })),
    }, null, 2) + '\n');
    return;
  }
  if (sub === 'show') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required: youtube-publish account show <ref>');
    try {
      const a = await loadAccount(ref);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.fields)) {
        masked[k] = /SECRET|TOKEN|KEY/.test(k) ? (v ? v.slice(0, 4) + '…' + v.slice(-4) + ` (${v.length} chars)` : '(empty)') : v;
      }
      process.stdout.write(JSON.stringify({ ok: true, ref: a.ref, path: a.path, backend: a.backend, fields: masked }, null, 2) + '\n');
    } catch (err) {
      emitErrAndExit('config', `account "${ref}" not found: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  if (sub === 'remove') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required: youtube-publish account remove <ref>');
    await removeAccount(ref).catch((e) => emitErrAndExit('config', `failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, removed: ref, path: credPath(ref) }) + '\n');
    return;
  }
  if (sub === 'add') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required: youtube-publish account add <ref> --backend api|browser [--field KEY=VAL ...]');
    // Parse remaining flags
    let backend: Backend | null = null;
    const fields: Record<string, string> = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--backend') backend = args[++i] as Backend;
      else if (args[i] === '--field') {
        const [k, ...rest] = (args[++i] || '').split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      } else if (args[i].startsWith('--field=')) {
        const [k, ...rest] = args[i].slice('--field='.length).split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      }
    }
    if (!backend || (backend !== 'api' && backend !== 'browser')) emitErrAndExit('config', '--backend api|browser required');
    const missing = validateFields(backend, fields);
    if (missing.length > 0) {
      emitErrAndExit('config', `missing required fields for backend=${backend}: ${missing.join(', ')}. Required: ${requiredFieldsFor(backend).join(', ')}`);
    }
    const created = await addAccount(ref, backend, fields).catch((e) => { emitErrAndExit('config', `failed: ${e?.message ?? e}`); });
    process.stdout.write(JSON.stringify({
      ok: true,
      added: created.ref,
      path: created.path,
      backend: created.backend,
      hint: backend === 'api'
        ? 'Test with: youtube-publish --account-ref ' + ref + ' --video ./test.mp4 --title Test --privacy private'
        : 'Ensure the daemon Chrome (CDP port 9222) is signed in to this YouTube channel, then test with --account-ref ' + ref,
    }, null, 2) + '\n');
    return;
  }
  emitErrAndExit('config', `unknown account action "${sub}" — run 'youtube-publish account help'`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Route `account ...` subcommands before the main upload parser
  if (argv[0] === 'account') return cmdAccount(argv.slice(1));

  const { values } = parseArgs({
    options: {
      'account-ref':      { type: 'string' },
      'video':            { type: 'string' },
      'title':            { type: 'string' },
      'description':      { type: 'string' },
      'description-file': { type: 'string' },
      'tags':             { type: 'string' },   // comma-separated
      'category-id':      { type: 'string', default: '22' },
      'privacy':          { type: 'string', default: 'private' },
      'publish-at':       { type: 'string' },   // ISO timestamp
      'thumbnail':        { type: 'string' },
      'made-for-kids':    { type: 'boolean', default: false },
      'help':             { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  if (values.help) {
    process.stdout.write([
      'youtube-publish — upload to YouTube (multi-account).',
      '',
      'Account management:',
      '  youtube-publish account list',
      '  youtube-publish account show <ref>',
      '  youtube-publish account add <ref> --backend api|browser --field KEY=VAL [--field ...]',
      '  youtube-publish account remove <ref>',
      '',
      'Upload:',
      '  youtube-publish --account-ref <ref> --video <path> --title "<text>" [--description "<text>"]',
      '                  [--description-file <path>] [--tags "tag1,tag2"] [--category-id 22]',
      '                  [--privacy public|private|unlisted] [--publish-at <iso>] [--thumbnail <path>]',
      '                  [--made-for-kids]',
      '',
      'Example:',
      '  youtube-publish --account-ref cartoon-remakes --video ./ep1.mp4 --title "Episode 1"',
      '                  --description-file notes.md --privacy unlisted --publish-at 2026-04-22T05:00:00Z',
      '',
    ].join('\n'));
    process.exit(0);
  }

  if (!values.video) emitErrAndExit('config', '--video <path> required');
  if (!values.title) emitErrAndExit('config', '--title <string> required');

  const privacy = values.privacy as UploadInput['privacyStatus'];
  if (privacy && !['public', 'private', 'unlisted'].includes(privacy)) {
    emitErrAndExit('config', `--privacy must be public|private|unlisted, got ${privacy}`);
  }

  let description = values.description as string | undefined;
  if (values['description-file']) {
    description = await readFile(values['description-file'] as string, 'utf8');
  }

  const tags = values.tags ? (values.tags as string).split(',').map(t => t.trim()).filter(Boolean) : undefined;

  const cfg = await loadConfig(values['account-ref'] as string | undefined);

  const input: UploadInput = {
    videoPath: values.video as string,
    title: values.title as string,
    description,
    tags,
    categoryId: values['category-id'] as string,
    privacyStatus: privacy,
    publishAt: values['publish-at'] as string | undefined,
    thumbnailPath: values.thumbnail as string | undefined,
    madeForKids: Boolean(values['made-for-kids']),
  };

  try {
    const result = await uploadVideo(cfg, input);
    process.stdout.write(JSON.stringify({
      ok: true,
      platform: 'youtube',
      video_id: result.videoId,
      url: result.url,
      channel_id: result.channelId,
      title: input.title,
      privacy: input.privacyStatus ?? 'private',
      scheduled: input.publishAt ?? null,
    }) + '\n');
  } catch (err) {
    const kind = classifyErr(err);
    const message = err instanceof Error ? err.message : String(err);
    emitErrAndExit(kind, message);
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
