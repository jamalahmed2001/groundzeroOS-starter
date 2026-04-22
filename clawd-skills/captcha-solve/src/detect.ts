// Captcha detection via browser-automate CDP-attached Chrome.
// Scans a page's DOM + network for known captcha widgets, returns a structured report.

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BA_BIN = process.env.BROWSER_AUTOMATE_BIN
  ?? join(homedir(), 'clawd', 'skills', 'browser-automate', 'bin', 'browser-automate');

export type CaptchaKind =
  | 'recaptcha-v2' | 'recaptcha-v3'
  | 'hcaptcha'
  | 'turnstile'           // Cloudflare Turnstile
  | 'cloudflare-iuam'     // Cloudflare interstitial ("Just a moment")
  | 'arkose-funcaptcha'
  | 'image-text'          // legacy image-and-textbox captcha
  | 'generic-iframe'      // unknown captcha-looking iframe
  | 'none';

export interface DetectReport {
  url: string;
  final_url?: string;
  kinds: CaptchaKind[];
  sitekeys: Array<{ kind: CaptchaKind; sitekey: string; iframe_src?: string }>;
  title: string;
  cloudflare_challenge: boolean;   // true if the top-level page IS the CF interstitial
  suggestion: string;
  raw_iframes: Array<{ src: string; visible: boolean }>;
}

function runBa<T = unknown>(args: string[]): Promise<{ ok: boolean; data?: T; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(BA_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop() || '{}');
        resolve(parsed);
      } catch {
        resolve({ ok: false, error: `exit=${code} ${stderr.slice(0, 400)}` });
      }
    });
  });
}

export async function detect(url: string): Promise<DetectReport> {
  const recipeFile = join('/tmp', `captcha-detect-${Date.now()}.mjs`);
  const src = `
export default {
  name: 'captcha-detect',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages[0] ?? await ctx.context.newPage();
    await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const scan = await page.evaluate(() => {
      const kinds = new Set();
      const sitekeys = [];
      const rawIframes = [];
      let cloudflareChallenge = false;

      // Top-level Cloudflare interstitial
      if (/Just a moment|Checking your browser|Enable JavaScript and cookies/i.test(document.title)
          || document.querySelector('#challenge-form, #challenge-stage, .cf-browser-verification')) {
        kinds.add('cloudflare-iuam');
        cloudflareChallenge = true;
      }

      // Turnstile (can be on any page, not just CF interstitial)
      document.querySelectorAll('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]').forEach((el) => {
        kinds.add('turnstile');
        const sitekey = el.getAttribute?.('data-sitekey') ||
          new URL(el.src ?? '', location.href).searchParams.get('k');
        if (sitekey) sitekeys.push({ kind: 'turnstile', sitekey, iframe_src: el.src ?? null });
      });

      // reCAPTCHA v2 (visible checkbox)
      document.querySelectorAll('.g-recaptcha, iframe[src*="google.com/recaptcha/api2/anchor"]').forEach((el) => {
        kinds.add('recaptcha-v2');
        const sitekey = el.getAttribute?.('data-sitekey') ||
          new URL(el.src ?? '', location.href).searchParams.get('k');
        if (sitekey) sitekeys.push({ kind: 'recaptcha-v2', sitekey, iframe_src: el.src ?? null });
      });

      // reCAPTCHA v3 (invisible — look for the script + execution calls)
      if (document.querySelector('script[src*="recaptcha/api.js?render="]')) {
        kinds.add('recaptcha-v3');
        const scr = document.querySelector('script[src*="recaptcha/api.js?render="]');
        const src = scr?.src ?? '';
        const m = src.match(/[?&]render=([^&]+)/);
        if (m) sitekeys.push({ kind: 'recaptcha-v3', sitekey: m[1] });
      }

      // hCaptcha
      document.querySelectorAll('.h-captcha, iframe[src*="hcaptcha.com/captcha"]').forEach((el) => {
        kinds.add('hcaptcha');
        const sitekey = el.getAttribute?.('data-sitekey') ||
          new URL(el.src ?? '', location.href).searchParams.get('sitekey');
        if (sitekey) sitekeys.push({ kind: 'hcaptcha', sitekey, iframe_src: el.src ?? null });
      });

      // Arkose FunCaptcha
      document.querySelectorAll('iframe[src*="funcaptcha.com"]').forEach((el) => {
        kinds.add('arkose-funcaptcha');
        sitekeys.push({ kind: 'arkose-funcaptcha', sitekey: new URL(el.src, location.href).searchParams.get('pkey') ?? '?', iframe_src: el.src });
      });

      // Catch-all: any iframe whose src looks challenge-ish that we didn't match above
      document.querySelectorAll('iframe').forEach((el) => {
        const src = el.src ?? '';
        rawIframes.push({ src, visible: el.offsetWidth > 0 && el.offsetHeight > 0 });
        if (/captcha|challenge|verify|turnstile|recaptcha|hcaptcha/i.test(src) && kinds.size === 0) {
          kinds.add('generic-iframe');
        }
      });

      return {
        title: document.title,
        final_url: location.href,
        kinds: [...kinds],
        sitekeys,
        cloudflare_challenge: cloudflareChallenge,
        raw_iframes: rawIframes,
      };
    });

    return scan;
  },
};
`;
  await writeFile(recipeFile, src, 'utf8');
  const res = await runBa<{
    title: string; final_url: string; kinds: CaptchaKind[];
    sitekeys: Array<{ kind: CaptchaKind; sitekey: string; iframe_src?: string }>;
    cloudflare_challenge: boolean;
    raw_iframes: Array<{ src: string; visible: boolean }>;
  }>(['run', '--recipe-file', recipeFile, '--timeout-ms', '60000']);

  if (!res.ok || !res.data) {
    return {
      url, kinds: ['none'], sitekeys: [], title: '', cloudflare_challenge: false,
      suggestion: `detect failed: ${res.error ?? 'unknown'}`,
      raw_iframes: [],
    };
  }
  const d = res.data;
  const kinds = d.kinds.length > 0 ? d.kinds : (['none'] as CaptchaKind[]);
  let suggestion: string;
  if (d.cloudflare_challenge) suggestion = 'Cloudflare interstitial — try a fresh session or wait it out; 2Captcha supports `turnstile`.';
  else if (kinds.includes('turnstile')) suggestion = 'Cloudflare Turnstile — 2Captcha solves these. Use: captcha-solve solve --url ... --kind turnstile.';
  else if (kinds.includes('hcaptcha')) suggestion = 'hCaptcha — any major solver supports this. Solve via: captcha-solve solve --url ... --kind hcaptcha.';
  else if (kinds.includes('recaptcha-v2')) suggestion = 'reCAPTCHA v2 — solvable. Use: captcha-solve solve --url ... --kind recaptcha-v2.';
  else if (kinds.includes('recaptcha-v3')) suggestion = 'reCAPTCHA v3 is score-based (invisible). Solvable via 2Captcha but requires a page action. See SKILL.md.';
  else if (kinds[0] === 'none') suggestion = 'No captcha detected on the current page. Block is likely rate-limit / account-flag / session-stale — not a captcha.';
  else suggestion = `Detected: ${kinds.join(', ')}. Try captcha-solve solve with --kind <one of those>.`;

  return {
    url,
    final_url: d.final_url,
    kinds,
    sitekeys: d.sitekeys,
    title: d.title,
    cloudflare_challenge: d.cloudflare_challenge,
    suggestion,
    raw_iframes: d.raw_iframes,
  };
}
