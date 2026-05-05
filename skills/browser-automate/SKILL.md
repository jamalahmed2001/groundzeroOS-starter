---
name: browser-automate
description: Generic Playwright-based browser automation for sites that have no API. Pluggable recipe system — each site is a JS/TS module. First-party recipes included (suno); custom recipes loaded from --recipe-file. Persistent per-recipe login profile, first-run headful auth, subsequent headless runs.
metadata:
  clawdbot:
    emoji: "🕸️"
    requires: ["node", "chromium (auto-installed)"]
    credentials: "none at the skill level — each recipe handles its own login via `browser-automate login <recipe>`"
---

# Browser Automate

General-purpose Playwright wrapper. When a site doesn't expose an API you can reach, drive its real UI under your real account. One skill, many recipes.

## When to use

- A service you pay for has no API but you need to script interactions (Suno Pro, Udio, Midjourney web, Runway, etc.).
- A website has data or features behind a login and you want an automation under your own session.
- Third-party API wrappers are unofficial, flaky, or add per-call cost you already pay for via subscription.

## Not when

- An official API exists — use it. This skill is fragile by design (UI changes break recipes).
- The site has strong bot detection (Cloudflare Turnstile, Datadome, Arkose). Recipes will break; upgrade to `playwright-extra` + `puppeteer-extra-plugin-stealth` or move to residential proxies, both of which are outside this skill's scope.
- High-volume scraping. This is one-account, one-session work. Scaling beyond that risks your account.

## Install

```bash
cd ~/clawd/skills/browser-automate
pnpm install
pnpm run build
npx playwright install chromium   # first run only, ~110 MB
```

## Subcommands

### `list` — show built-in recipes

```bash
browser-automate list
```

### `login <recipe>` — one-time manual sign-in

Opens a visible Chromium at the recipe's `loginUrl`. Complete sign-in manually (including any 2FA), then close the window. The session is persisted in `~/.cache/browser-automate/profiles/<recipe>/` and reused on subsequent `run` calls.

```bash
browser-automate login suno
```

### `run <recipe>` — execute headlessly

```bash
browser-automate run suno --args-json '{"prompt":"warm piano, 60 bpm","outputDir":"/tmp/out","count":2}'
```

Or with repeated `--arg` flags:

```bash
browser-automate run suno \
  --arg prompt="warm piano, 60 bpm" \
  --arg outputDir=/tmp/out \
  --arg count=2
```

Or from a file:

```bash
browser-automate run suno --args-file ./my-args.json
```

### External recipe file

```bash
browser-automate run --recipe-file ./my-site-recipe.js --args-json '{"foo":"bar"}'
```

## Flags

| Flag | Purpose |
|---|---|
| `--args-file <path>` | JSON file with recipe args |
| `--args-json <str>` | Inline JSON string |
| `--arg key=value` | Repeatable; scalar args (numbers/booleans auto-parsed) |
| `--recipe-file <path>` | Load an external recipe module |
| `--headful` | Show browser (for debugging) |
| `--timeout-ms <n>` | Overall timeout (default 600000 = 10 min) |

## Output

Single JSON object on stdout:

```json
{
  "ok": true,
  "recipe": "suno",
  "data": { "provider": "suno-browser", "tracks": [ ... ] },
  "durationMs": 94312
}
```

Progress logs stream on stderr. On failure, a full-page screenshot is saved at `/tmp/browser-automate/<recipe>/<timestamp>/error-*.png` and its path appears in the `screenshots` array of the result.

## Writing a recipe

A recipe is a TS/JS module exporting a `Recipe` object:

```ts
import type { Recipe } from '@skills/browser-automate/src/types.js';

export default {
  name: 'my-site',
  description: 'Do the thing on my-site.com',

  loginUrl: 'https://my-site.com/login',

  async isLoggedIn(ctx) {
    await ctx.page.goto('https://my-site.com/account');
    return !ctx.page.url().includes('/login');
  },

  async run(ctx, args) {
    await ctx.page.goto('https://my-site.com/create');
    await ctx.page.fill('input[name="title"]', args.title);
    await ctx.page.click('button[type=submit]');
    await ctx.page.waitForSelector('.result-item');

    const results = await ctx.page.$$eval('.result-item', (els) =>
      els.map((el) => el.textContent?.trim() ?? ''),
    );

    return { results };
  },
} satisfies Recipe;
```

Then:

```bash
browser-automate login --recipe-file ./my-recipe.ts  # sign in once
browser-automate run --recipe-file ./my-recipe.ts --args-json '{"title":"hello"}'
```

### Recipe context API

Recipes receive a `RecipeContext`:

- `ctx.page` — Playwright `Page` object (full API available)
- `ctx.context` — the `BrowserContext` (for cookies, request interception, multiple tabs)
- `ctx.log(msg)` — write progress to stderr
- `ctx.downloadUrl(url, destPath)` — download via the authenticated browser context (cookies attached)
- `ctx.workDir` — per-run temp directory for screenshots / intermediates

### Selector resilience tips

- **Prefer roles and labels over CSS**: `page.getByRole('button', { name: 'Create' })` survives more redesigns than `button.btn-primary-xl`.
- **Capture from the network**, not the DOM, when possible — listen on `page.on('response', ...)` for API responses the site makes internally. Those endpoints are more stable than visual selectors.
- **Fall through a list**: try several selectors for the same element, as the Suno recipe does.
- **Fail loudly with screenshots** — let the engine's error-screenshot handle diagnosis, don't swallow exceptions.

### Stealth considerations

This skill uses base Playwright with `--disable-blink-features=AutomationControlled` and a realistic UA. That's enough for casually-automated sites. For sites with aggressive bot detection:

1. `pnpm add playwright-extra puppeteer-extra-plugin-stealth` in the skill dir.
2. Swap the `chromium.launchPersistentContext` call in `src/engine.ts` for the stealth-wrapped variant.
3. Optionally add a residential proxy via the `proxy` launch option.

Do this only when you need it — stealth adds startup cost and occasional instability.

## Built-in recipes

| Recipe | What it does | Args |
|---|---|---|
| `suno` | Generate music on Suno by filling Create form and capturing audio URLs from network | `prompt`, `style?`, `title?`, `instrumental?`, `count?`, `outputDir` |

## Troubleshooting

**"not logged in for recipe X"** → run `browser-automate login X` to create the session, then retry.

**Recipe timed out** → site is slow or UI changed. Retry with `--headful` to watch what happens.

**Cloudflare challenge** → you're IP-blocked or captcha'd. Try `--headful` to solve once manually (the session persists), then rerun headless.

**Suno recipe specifically**:
- Selectors will drift — check `src/recipes/suno.ts` SELECTORS block.
- Suno returns track metadata via `/api/feed/` endpoints — the recipe captures from network, so minor UI shuffle rarely breaks audio capture.
- If you see `no audio URLs detected`, check the error screenshot. The prompt may have been refused (try rewording) or the UI may have moved the submit button.
