# captcha-solve

Generic captcha detector + solver. Supports reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile,
Arkose FunCaptcha. Multi-provider (2Captcha primary, HITL `human` fallback), multi-account.

## Install

```bash
cd ~/clawd/skills/captcha-solve
npm install && npm run build
```

## Credentials

`~/.credentials/captcha-<ref>.env` with `PROVIDER=<name>` and `API_KEY=<key>`. Create via:

```bash
captcha-solve account add default --provider 2captcha --field API_KEY=<your-2captcha-key>
captcha-solve account list
```

Providers supported:
- **2captcha** — cheap, reliable (~$0.003 for reCAPTCHA, ~$0.02 for Turnstile). https://2captcha.com
- **anticaptcha / capmonster** — stubbed, add as needed
- **human** — HITL: opens the page in your daemon Chrome, waits for you to click solve, returns a sentinel

## Usage

```bash
# STEP 1 — detect. Always run first. Many "blocked" situations aren't captchas.
captcha-solve detect --url https://some-site.com/login

# STEP 2 — if detect finds a captcha, solve it.
captcha-solve solve --url https://some-site.com/login
# auto-detects kind + sitekey; solves via default account

# Or explicit:
captcha-solve solve --url https://site.com/ \
  --kind turnstile --sitekey 0x4AAAAAAABC... \
  --account-ref default --provider 2captcha

# HITL (manual solve, e.g. when account-flag needs a human click):
captcha-solve solve --url https://suno.com/create --provider human
```

The skill returns the solved token in stdout JSON. **Injection back into the page is caller's
responsibility** — many solver flows require the token to be posted to a specific form/endpoint
in the target context, which only the calling workflow knows.

## Output

```json
{
  "ok": true,
  "url": "https://site.com/",
  "kind": "turnstile",
  "sitekey": "0x4AAA…",
  "provider": "2captcha",
  "token": "<solved-token>",
  "elapsed_s": 27.4,
  "cost_estimate_usd": 0.02
}
```

## When to reach for this skill

1. A skill's API call starts returning 401/403 + captcha-looking language
2. A browser-automation recipe hits a Cloudflare interstitial ("Just a moment…")
3. A signup / login flow is gated behind hCaptcha
4. Rate-limit responses mention "verify you're human"

Run `detect` first. If `kinds: ["none"]`, the block isn't a captcha — it's rate limit, account
flag, session stale, or backend change. Don't burn 2Captcha credits on nothing.

## When NOT to use this

- Suno's `Token validation failed` 422 → confirmed NOT a captcha. It's account-level (quota /
  flag / session). Wait it out or contact Suno support.
- Any endpoint where you already have a valid session cookie and just need to refresh it —
  try `page.reload()` first.
- Services with strict TOS against captcha bypass (LinkedIn, Instagram org accounts, etc.) —
  this skill works technically but may get your account banned. Use HITL provider only.

## Supported captcha kinds

| Kind | Detection signal | Solver support |
|---|---|---|
| `recaptcha-v2` | `.g-recaptcha` element / sitekey iframe | 2Captcha ✓ |
| `recaptcha-v3` | `api.js?render=<sitekey>` script tag | 2Captcha ✓ (needs `--action` + optional `--min-score`) |
| `hcaptcha` | `.h-captcha` / `hcaptcha.com` iframe | 2Captcha ✓ |
| `turnstile` | `.cf-turnstile` / `challenges.cloudflare.com` iframe | 2Captcha ✓ |
| `cloudflare-iuam` | Top-level "Just a moment…" interstitial | Hard — often better to wait / fresh session |
| `arkose-funcaptcha` | `funcaptcha.com` iframe | 2Captcha ✓ |

## Integration pattern

Call pattern from a larger skill (e.g. suno, tiktok-publish) that hit a blocker:

```bash
# 1. A skill's call failed; first check if a captcha is involved
DETECT=$(captcha-solve detect --url "$BLOCKED_URL")
KIND=$(echo "$DETECT" | jq -r '.kinds[0]')

if [ "$KIND" != "none" ]; then
  # 2. Solve it
  TOKEN=$(captcha-solve solve --url "$BLOCKED_URL" --kind "$KIND" --output-json /tmp/solve.json | jq -r '.token')
  # 3. Feed token back into your original call (via form field injection, header, etc.)
else
  # Block is not a captcha — escalate (rate-limit, account-flag, session stale)
  echo "No captcha — not solvable here. See captcha-guardian directive for escalation."
  exit 1
fi
```

See [[captcha-guardian]] directive for the structured escalation logic.
