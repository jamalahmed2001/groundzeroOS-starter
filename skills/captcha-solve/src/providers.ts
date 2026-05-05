// Captcha solver providers. 2Captcha implemented; human/anticaptcha/capmonster stubbed with shape.

import type { CaptchaKind } from './detect.js';

export interface SolveInput {
  kind: CaptchaKind;
  sitekey: string;
  pageurl: string;
  /** reCAPTCHA v3 page action */
  action?: string;
  /** reCAPTCHA v3 minimum score (0..1) */
  minScore?: number;
  /** Required for Arkose FunCaptcha */
  surl?: string;
  /** Turnstile sometimes needs a cdata or action param */
  cdata?: string;
  /** Browser cookies/useragent to pass through for accuracy */
  userAgent?: string;
  cookies?: string;
}

export interface SolveResult {
  provider: string;
  token: string;
  request_id?: string;
  /** Seconds elapsed in solve */
  elapsed_s: number;
  cost_estimate_usd?: number;
}

export interface Provider {
  name: string;
  solve(input: SolveInput, config: Record<string, string>, onStatus?: (msg: string) => void): Promise<SolveResult>;
}

// ----- 2Captcha (most common solver; ~$0.003 per reCAPTCHA, ~$0.02 per Turnstile) -----

const TWOCAPTCHA_IN = 'https://2captcha.com/in.php';
const TWOCAPTCHA_RES = 'https://2captcha.com/res.php';

const twoCaptcha: Provider = {
  name: '2captcha',
  async solve(input, cfg, onStatus) {
    const key = cfg.API_KEY;
    if (!key) throw new Error('2captcha: API_KEY missing');
    const method = mapMethod(input.kind);
    if (!method) throw new Error(`2captcha: unsupported kind ${input.kind}`);

    // 1. Submit
    const submitParams = new URLSearchParams({
      key, json: '1', method, pageurl: input.pageurl,
    });
    // method-specific params
    switch (method) {
      case 'userrecaptcha':
        submitParams.set('googlekey', input.sitekey);
        if (input.kind === 'recaptcha-v3') {
          submitParams.set('version', 'v3');
          if (input.action) submitParams.set('action', input.action);
          if (input.minScore) submitParams.set('min_score', String(input.minScore));
        }
        break;
      case 'hcaptcha':
        submitParams.set('sitekey', input.sitekey);
        break;
      case 'turnstile':
        submitParams.set('sitekey', input.sitekey);
        if (input.cdata) submitParams.set('data', input.cdata);
        if (input.action) submitParams.set('action', input.action);
        break;
      case 'funcaptcha':
        submitParams.set('publickey', input.sitekey);
        if (input.surl) submitParams.set('surl', input.surl);
        break;
    }
    if (input.userAgent) submitParams.set('userAgent', input.userAgent);

    const submitRes = await fetch(`${TWOCAPTCHA_IN}?${submitParams.toString()}`);
    const submitJson = await submitRes.json() as { status: number; request: string; error_text?: string };
    if (submitJson.status !== 1) throw new Error(`2captcha submit failed: ${submitJson.request} ${submitJson.error_text ?? ''}`);
    const captchaId = submitJson.request;
    onStatus?.(`submitted (id=${captchaId}), polling…`);

    // 2. Poll for result — 2Captcha typically takes 15-60s for reCAPTCHA, 20-90s for Turnstile
    const started = Date.now();
    const deadline = started + 5 * 60 * 1000; // 5 min max
    await new Promise(r => setTimeout(r, 15000)); // initial wait before first poll
    while (Date.now() < deadline) {
      const pollRes = await fetch(`${TWOCAPTCHA_RES}?${new URLSearchParams({ key, action: 'get', id: captchaId, json: '1' }).toString()}`);
      const pollJson = await pollRes.json() as { status: number; request: string };
      if (pollJson.status === 1) {
        const elapsed_s = (Date.now() - started) / 1000;
        onStatus?.(`solved in ${elapsed_s.toFixed(1)}s`);
        return {
          provider: '2captcha',
          token: pollJson.request,
          request_id: captchaId,
          elapsed_s,
          cost_estimate_usd: estimateCost(input.kind),
        };
      }
      if (pollJson.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2captcha poll error: ${pollJson.request}`);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('2captcha: solve timed out after 5 min');
  },
};

function mapMethod(kind: CaptchaKind): string | null {
  switch (kind) {
    case 'recaptcha-v2':
    case 'recaptcha-v3': return 'userrecaptcha';
    case 'hcaptcha': return 'hcaptcha';
    case 'turnstile': return 'turnstile';
    case 'arkose-funcaptcha': return 'funcaptcha';
    default: return null;
  }
}

function estimateCost(kind: CaptchaKind): number {
  switch (kind) {
    case 'recaptcha-v2': return 0.003;
    case 'recaptcha-v3': return 0.003;
    case 'hcaptcha': return 0.003;
    case 'turnstile': return 0.02;
    case 'arkose-funcaptcha': return 0.03;
    default: return 0;
  }
}

// ----- Human HITL fallback — desktop notification + blocking wait -----

const human: Provider = {
  name: 'human',
  async solve(input, cfg, onStatus) {
    const started = Date.now();
    // The idea: open the page in the user's CDP Chrome, pause, wait for them to solve manually.
    // Since we can't intercept the token from outside their click, we just return a sentinel and
    // expect the caller to check page state themselves (i.e. retry the original action).
    onStatus?.(`please solve the captcha manually at ${input.pageurl} in your Chrome — then press Enter`);
    // Blocking wait: read one line from stdin
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    void cfg;
    return {
      provider: 'human',
      token: 'HUMAN_SOLVED',  // sentinel — caller should re-check page state, not use this token
      elapsed_s: (Date.now() - started) / 1000,
      cost_estimate_usd: 0,
    };
  },
};

export const PROVIDERS: Record<string, Provider> = {
  '2captcha': twoCaptcha,
  'human': human,
};
