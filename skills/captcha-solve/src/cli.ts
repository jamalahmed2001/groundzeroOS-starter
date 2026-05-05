#!/usr/bin/env node
// captcha-solve — detect + solve captchas across known providers.

import { detect } from './detect.js';
import { PROVIDERS } from './providers.js';
import type { CaptchaKind } from './detect.js';
import {
  listAccounts, loadAccount, addAccount, removeAccount, credPath, resolveAccount,
  type Provider,
} from './accounts.js';

function fail(msg: string, code = 1): never {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  process.exit(code);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
      out[key] = next; i++;
    }
  }
  return out;
}

const HELP = `captcha-solve — detect & solve captchas (reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, Arkose FunCaptcha).

Subcommands:
  detect --url <url>
      Navigate to <url> in the daemon Chrome, scan DOM + iframes for known captcha widgets.
      Returns: { url, final_url, kinds, sitekeys, cloudflare_challenge, suggestion }.
      Run this FIRST — many "block" situations aren't captchas at all.

  solve --url <url> [--kind <kind>] [--sitekey <key>] [--account-ref <ref>] [--provider 2captcha|human]
        [--action <v3-page-action>] [--min-score 0.3] [--user-agent "..."] [--output-json <path>]
      Solves a captcha at <url>. If --kind/--sitekey not passed, runs detect first.
      Returns: { ok, provider, token, elapsed_s, cost_estimate_usd }.
      Injection: this skill does not auto-inject the token. Feed it back into your workflow.

  account list / show <ref> / add <ref> --provider 2captcha|human --field API_KEY=... / remove <ref>
      Provider credentials live at ~/.credentials/captcha-<ref>.env.
      A 'default' ref is looked up if --account-ref is omitted.

Providers:
  2captcha (recommended — $0.003/reCAPTCHA, $0.02/Turnstile)
  human    (HITL fallback — opens page in your Chrome, waits for you to solve)

See ~/clawd/skills/captcha-solve/SKILL.md for full docs.
`;

async function cmdAccount(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || sub === '-h') {
    process.stdout.write([
      'captcha-solve account <action>',
      '  list                          All configured solver accounts',
      '  show <ref>                    Details for one',
      '  add <ref> --provider 2captcha|human --field API_KEY=...',
      '  remove <ref>',
      '',
    ].join('\n'));
    return;
  }
  if (sub === 'list') {
    const accounts = await listAccounts();
    process.stdout.write(JSON.stringify({
      ok: true, count: accounts.length,
      accounts: accounts.map(a => ({ ref: a.ref, provider: a.provider, has_key: !!a.fields.API_KEY })),
    }, null, 2) + '\n');
    return;
  }
  if (sub === 'show') {
    const ref = args[1]; if (!ref) fail('ref required');
    try {
      const a = await loadAccount(ref);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.fields)) {
        masked[k] = /KEY|SECRET|TOKEN/.test(k) ? (v ? v.slice(0, 4) + '…' + v.slice(-4) : '(empty)') : v;
      }
      process.stdout.write(JSON.stringify({ ok: true, ref: a.ref, path: a.path, provider: a.provider, fields: masked }, null, 2) + '\n');
    } catch (err) { fail(`account "${ref}" not found: ${err instanceof Error ? err.message : String(err)}`); }
    return;
  }
  if (sub === 'remove') {
    const ref = args[1]; if (!ref) fail('ref required');
    await removeAccount(ref).catch(e => fail(`failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, removed: ref, path: credPath(ref) }) + '\n');
    return;
  }
  if (sub === 'add') {
    const ref = args[1]; if (!ref) fail('ref required');
    let provider: Provider | null = null;
    const fields: Record<string, string> = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--provider') provider = args[++i] as Provider;
      else if (args[i] === '--field') {
        const [k, ...rest] = (args[++i] || '').split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      } else if (args[i].startsWith('--field=')) {
        const [k, ...rest] = args[i].slice('--field='.length).split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      }
    }
    if (!provider) fail('--provider required');
    if (provider !== 'human' && !fields.API_KEY) fail('--field API_KEY=<key> required (unless provider=human)');
    const created = await addAccount(ref, provider, fields).catch(e => fail(`failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, added: created.ref, provider, path: created.path }, null, 2) + '\n');
    return;
  }
  fail(`unknown action "${sub}"`);
}

async function cmdDetect(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.url !== 'string') fail('--url <url> required');
  const report = await detect(args.url);
  process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + '\n');
}

async function cmdSolve(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.url !== 'string') fail('--url <url> required');
  let kind = typeof args.kind === 'string' ? (args.kind as CaptchaKind) : undefined;
  let sitekey = typeof args.sitekey === 'string' ? args.sitekey : undefined;

  // Auto-detect if caller didn't provide kind+sitekey
  if (!kind || !sitekey) {
    process.stderr.write('[captcha-solve] auto-detecting…\n');
    const r = await detect(args.url);
    if (!kind) kind = r.kinds.find(k => k !== 'none') as CaptchaKind | undefined;
    if (!sitekey && r.sitekeys.length > 0) sitekey = r.sitekeys[0].sitekey;
    if (!kind || kind === 'none') {
      process.stdout.write(JSON.stringify({
        ok: false, error: 'no_captcha_detected',
        detect: r,
        hint: 'Nothing to solve. The block is likely rate-limit/account/session, not a captcha.',
      }, null, 2) + '\n');
      process.exit(2);
    }
    if (!sitekey && kind !== 'cloudflare-iuam') fail(`detected ${kind} but no sitekey; pass --sitekey manually`);
  }

  const providerName = typeof args.provider === 'string' ? args.provider : undefined;
  const account = await resolveAccount(typeof args['account-ref'] === 'string' ? args['account-ref'] : undefined);
  const providerKey = providerName ?? account.provider;
  const provider = PROVIDERS[providerKey];
  if (!provider) fail(`unknown provider "${providerKey}"`);

  const result = await provider.solve({
    kind: kind as CaptchaKind,
    sitekey: sitekey!,
    pageurl: args.url,
    action: typeof args.action === 'string' ? args.action : undefined,
    minScore: typeof args['min-score'] === 'string' ? Number(args['min-score']) : undefined,
    userAgent: typeof args['user-agent'] === 'string' ? args['user-agent'] : undefined,
  }, account.fields, (msg) => process.stderr.write(`[captcha-solve/${providerKey}] ${msg}\n`))
    .catch(e => fail(e?.message ?? String(e)));

  const out = {
    ok: true,
    url: args.url,
    kind, sitekey,
    ...result,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (typeof args['output-json'] === 'string') {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(args['output-json'], JSON.stringify(out, null, 2));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv.slice(1));
  switch (sub) {
    case 'account': return cmdAccount(argv.slice(1));
    case 'detect':  return cmdDetect(args);
    case 'solve':   return cmdSolve(args);
    default: fail(`unknown subcommand "${sub}"`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
