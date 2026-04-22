#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadVideo, fetchStatus, type ClientConfig, type UploadInput, type TikTokPrivacy } from './client.js';
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
  if (code === 401 || code === 403) return 'auth';
  if (code === 'invalid_privacy_level' || code === 'invalid_param') return 'policy';
  if (code === 429) return 'rate_limit';
  if (typeof code === 'number' && code >= 500) return 'upstream';
  return 'unknown';
}

async function loadConfig(accountRef?: string): Promise<ClientConfig> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (accountRef) {
    const credPath = path.join(process.env.HOME ?? '~', '.credentials', `tiktok-${accountRef}.env`);
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
  const accessToken = env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) emitErrAndExit('config', 'Missing TIKTOK_ACCESS_TOKEN');
  return { accessToken };
}

async function cmdAccount(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || sub === '-h') {
    process.stdout.write([
      'tiktok-publish account <action>',
      '',
      'Actions:',
      '  list                          All configured TikTok accounts',
      '  show <ref>                    Details for one account',
      '  add <ref> --backend browser|api [--field KEY=VAL ...]',
      '                                Browser (recommended) fields: TIKTOK_HANDLE, TIKTOK_PROFILE_URL',
      '                                API fields: TIKTOK_ACCESS_TOKEN  (needs approved app)',
      '  remove <ref>                  Delete credentials file',
      '',
      'Credentials live at ~/.credentials/tiktok-<ref>.env (mode 600).',
      '',
      'Browser backend uses CDP-attach to the daemon Chrome. Make sure the Chrome is',
      'signed in to the target TikTok account before running an upload.',
      '',
    ].join('\n'));
    return;
  }
  if (sub === 'list') {
    const accounts = await listAccounts();
    process.stdout.write(JSON.stringify({
      ok: true,
      count: accounts.length,
      accounts: accounts.map(a => ({
        ref: a.ref,
        backend: a.backend,
        handle: a.fields.TIKTOK_HANDLE || null,
        profile_url: a.fields.TIKTOK_PROFILE_URL || null,
        has_access_token: a.backend === 'api' ? !!a.fields.TIKTOK_ACCESS_TOKEN : null,
      })),
    }, null, 2) + '\n');
    return;
  }
  if (sub === 'show') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required');
    try {
      const a = await loadAccount(ref);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.fields)) {
        masked[k] = /TOKEN|SECRET|KEY/.test(k) ? (v ? v.slice(0, 4) + '…' + v.slice(-4) + ` (${v.length} chars)` : '(empty)') : v;
      }
      process.stdout.write(JSON.stringify({ ok: true, ref: a.ref, path: a.path, backend: a.backend, fields: masked }, null, 2) + '\n');
    } catch (err) {
      emitErrAndExit('config', `account "${ref}" not found: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  if (sub === 'remove') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required');
    await removeAccount(ref).catch((e) => emitErrAndExit('config', `failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, removed: ref, path: credPath(ref) }) + '\n');
    return;
  }
  if (sub === 'add') {
    const ref = args[1];
    if (!ref) emitErrAndExit('config', 'ref required');
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
      emitErrAndExit('config', `missing fields for backend=${backend}: ${missing.join(', ')}. Required: ${requiredFieldsFor(backend).join(', ')}`);
    }
    const created = await addAccount(ref, backend, fields).catch((e) => { emitErrAndExit('config', `failed: ${e?.message ?? e}`); });
    process.stdout.write(JSON.stringify({
      ok: true, added: created.ref, path: created.path, backend: created.backend,
      hint: backend === 'browser'
        ? `Ensure daemon Chrome (CDP 9222) is signed in to ${fields.TIKTOK_HANDLE ?? 'the account'} on tiktok.com. Then: tiktok-publish --account-ref ${ref} --video ./v.mp4 --title "…"`
        : `Test with: tiktok-publish --account-ref ${ref} --video ./v.mp4 --title Test`,
    }, null, 2) + '\n');
    return;
  }
  emitErrAndExit('config', `unknown account action "${sub}"`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'account') return cmdAccount(argv.slice(1));

  const { values } = parseArgs({
    options: {
      'account-ref':             { type: 'string' },
      'video':                   { type: 'string' },
      'title':                   { type: 'string' },
      'privacy':                 { type: 'string', default: 'SELF_ONLY' },
      'disable-duet':            { type: 'boolean', default: false },
      'disable-comment':         { type: 'boolean', default: false },
      'disable-stitch':          { type: 'boolean', default: false },
      'cover-timestamp-ms':      { type: 'string' },
      'chunk-size':              { type: 'string' },
      'check-status':            { type: 'string' },      // publish_id — run status query instead
      'help':                    { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  if (values.help) {
    process.stdout.write('See SKILL.md. Quick form:\n');
    process.stdout.write('  tiktok-publish --account-ref maniplus --video ./v.mp4 --title "…"\n');
    process.stdout.write('  tiktok-publish --account-ref maniplus --check-status <publish-id>\n');
    process.exit(0);
  }

  const cfg = await loadConfig(values['account-ref'] as string | undefined);

  // Status-check mode
  if (values['check-status']) {
    try {
      const status = await fetchStatus(cfg, values['check-status'] as string);
      process.stdout.write(JSON.stringify({ ok: true, platform: 'tiktok', status }) + '\n');
      return;
    } catch (err) {
      emitErrAndExit(classifyErr(err), err instanceof Error ? err.message : String(err));
    }
  }

  // Upload mode
  if (!values.video) emitErrAndExit('config', '--video <path> required');
  if (!values.title) emitErrAndExit('config', '--title <string> required');

  const privacy = values.privacy as TikTokPrivacy;
  const validPrivacy: TikTokPrivacy[] = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
  if (!validPrivacy.includes(privacy)) {
    emitErrAndExit('config', `--privacy must be one of ${validPrivacy.join('|')}`);
  }

  const input: UploadInput = {
    videoPath: values.video as string,
    title: values.title as string,
    privacyLevel: privacy,
    disableDuet: Boolean(values['disable-duet']),
    disableComment: Boolean(values['disable-comment']),
    disableStitch: Boolean(values['disable-stitch']),
    videoCoverTimestampMs: values['cover-timestamp-ms'] ? Number(values['cover-timestamp-ms']) : undefined,
    chunkSize: values['chunk-size'] ? Number(values['chunk-size']) : undefined,
  };

  try {
    const result = await uploadVideo(cfg, input);
    process.stdout.write(JSON.stringify({
      ok: true,
      platform: 'tiktok',
      publish_id: result.publishId,
      title: input.title,
      privacy: input.privacyLevel,
      note: 'TikTok processes asynchronously. Use --check-status <publish_id> to poll.',
    }) + '\n');
  } catch (err) {
    emitErrAndExit(classifyErr(err), err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
