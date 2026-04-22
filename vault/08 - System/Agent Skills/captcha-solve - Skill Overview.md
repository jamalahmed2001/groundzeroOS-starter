---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: captcha-solve
source_skill_path: ~/clawd/skills/captcha-solve/SKILL.md
updated: 2026-04-20
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# captcha-solve

> Generic captcha detector + solver. Supports reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, Arkose FunCaptcha. **Detect first — many "blocks" aren't captchas at all.**

## When a directive should call this

- A browser-automation recipe hits a Cloudflare interstitial
- A form flow is gated behind hCaptcha / reCAPTCHA
- An account signup / login requires captcha solve
- A skill starts returning 401/403 with captcha-looking language

## When NOT to call this

- The block isn't a captcha (run `detect` first — zero cost)
- The service's TOS prohibits automated solving — escalate to human instead
- Rate limits / quota blocks — wait, don't solve

## How to call it

```bash
# 1. ALWAYS detect first
captcha-solve detect --url https://target.com/flow
# → { kinds: [...], sitekeys: [...], cloudflare_challenge: bool, suggestion: "..." }

# 2. Solve if detected
captcha-solve solve --url https://target.com/flow  # auto-picks kind from detect
# → { ok, provider, token, elapsed_s, cost_estimate_usd }

# Account mgmt
captcha-solve account add default --provider 2captcha --field API_KEY=<key>
captcha-solve account list
captcha-solve account remove default

# HITL fallback — opens page in your Chrome, waits for manual solve
captcha-solve solve --url https://blocked.com/ --provider human
```

## Providers

| Provider | Cost | Strengths | Notes |
|---|---|---|---|
| `2captcha` | ~$0.003 reCAPTCHA, ~$0.02 Turnstile | All major types, reliable | Needs API_KEY |
| `anticaptcha` / `capmonster` | similar | Stubbed — add on demand | — |
| `human` | free | When a bot solver won't cut it | HITL — blocks on stdin |

## Credentials

`~/.credentials/captcha-<ref>.env` (mode 600). `PROVIDER=2captcha`, `API_KEY=<key>`. `default` ref is used if no `--account-ref`.

## Detection outputs

```json
{
  "ok": true, "url": "...", "final_url": "...",
  "kinds": ["turnstile"],                 // may be multiple
  "sitekeys": [{"kind": "turnstile", "sitekey": "0x4AAA…", "iframe_src": "..."}],
  "cloudflare_challenge": false,
  "title": "Page Title",
  "suggestion": "...",                    // human-readable next step
  "raw_iframes": [{"src": "...", "visible": true}, ...]
}
```

If `kinds: ["none"]`, the page has no detectable captcha. Don't waste solver credits — the block is elsewhere (rate-limit, account flag, session stale, backend change).

## Solve outputs

```json
{
  "ok": true, "url": "...",
  "kind": "turnstile", "sitekey": "...",
  "provider": "2captcha",
  "token": "<solved-g-recaptcha-response-or-cf-token>",
  "elapsed_s": 27.4,
  "cost_estimate_usd": 0.02
}
```

**The skill does NOT auto-inject the token** — that's caller-workflow-specific. Pipe the token into whatever form field / header / body param the original flow expects.

## Error classification

- `no_captcha_detected` — detect found nothing; escalate differently (see [[captcha-guardian]])
- `2captcha submit failed` — 2Captcha key invalid, out of funds, or wrong method
- `unsupported kind` — the detected captcha type has no solver path in this skill yet
- `timed out` — 5 min max on 2Captcha polling

## Used by

- **captcha-guardian** directive — the canonical decision tree when any skill reports a block.
- Callable directly from any directive whose skill invocation fails with a captcha-looking error.

## See also

- [[captcha-guardian]] directive (structured escalation)
- [[browser-automate - Skill Overview|browser-automate]] — CDP primitives this skill rides on
- [[Conventions/Browser Automation for Services Without APIs.md|Browser Automation convention]]
