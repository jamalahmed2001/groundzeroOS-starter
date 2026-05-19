---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: browser-automate
source_skill_path: ~/clawd/skills/browser-automate/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# browser-automate

> Generic Playwright-based browser automation engine for services without public APIs. Pluggable recipe system — each site is one TS/JS module. Daemon mode keeps one debuggable Chrome alive under the user's real session.

## When a directive should call this

- A service you pay for (Suno, DistroKid, Spotify for Creators, Udio, Midjourney) has no usable public API, and the workflow needs to run under your own account
- One-account-one-session automation — not scale scraping

## When NOT to call this

- The service has an official API → use it (Cloudflare, Google APIs, Stripe, etc.)
- The site has aggressive bot detection (Cloudflare Turnstile, Datadome) → this doesn't bypass those; escalate to stealth + residential proxies (out of scope)
- High-volume scraping — will get the account banned

## How to call it

```bash
# One-time: seed daemon profile from daily Chrome; sign in to target services in there.
browser-automate daemon start

# Then: run any recipe; auto-attaches to daemon Chrome via CDP.
browser-automate run suno --args-json '{"prompt":"...","outputDir":"/tmp/out"}'

# External recipe file
browser-automate run --recipe-file ./my-recipe.mjs --args-json '{"key":"value"}'
```

Subcommands: `list` · `daemon start|stop|status` · `login <recipe>` · `run <recipe>`

## Output

Single JSON object on stdout with `{ ok, recipe, data?, error?, durationMs, screenshots? }`. On failure, a full-page screenshot saved under `/tmp/browser-automate/<recipe>/<timestamp>/error-*.png`.

## Recipes currently shipped

- `suno` (also exposed via the `suno` skill)
- External recipes via `--recipe-file`

## Key design notes

- **CDP attach, not persistent-profile Playwright.** Clerk-style auth rejects persistent-profile sessions across launches — the daemon-attach model solves this by reusing a long-lived Chrome instance.
- **Profile seeded from `~/.config/google-chrome/Default`** on first `daemon start`. Subsequent starts keep the same profile.
- **`browser.close()` in finally** for CDP mode — only disconnects the WS, does NOT close the user's Chrome.

See `~/clawd/skills/browser-automate/SKILL.md` for full recipe-authoring guide.
