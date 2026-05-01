---
name: chatgpt-compose
description: Drop-in alternative to nano-banana/FAL compose — drives the ChatGPT web UI under your Plus/Pro subscription to do multi-ref image composition, single-image edits, and brand bakes. Same CLI shape as nano-compose, no API cost, no FAL credits. Off-label use of browser-automate (ChatGPT has aggressive bot detection — see fragility notes).
metadata:
  clawdbot:
    emoji: "🖼️"
    requires: ["bun", "browser-automate skill", "browser-automate daemon"]
    credentials: "none at the skill level — sign in to chatgpt.com in your daily Chrome (or the daemon-seeded profile) and the daemon inherits the session"
---

# chatgpt-compose

Replaces nano-compose for callers that want to use a paid ChatGPT subscription instead of FAL/nano-banana credits. Same flag shape, different backend. Pick per-shot:

```bash
# FAL credits path
bun <home>/clawd/skills/nano-banana-compose/bin/nano-compose.ts \
  --output OUT.png --prompt "..." REF1.png REF2.png

# subscription path (ChatGPT web UI, no credits)
bun <home>/clawd/skills/chatgpt-compose/bin/chatgpt-compose.ts \
  --output OUT.png --prompt "..." REF1.png REF2.png
```

ChatGPT caps **20 attachments per message** — so this comfortably handles large ensemble keyframes (6+ character refs + a location).

## When to use this vs nano-compose

| Use case | Recommended backend | Why |
|---|---|---|
| Primary character / location generation (0 refs, text→image) — **content-safe prompts** | **chatgpt** ✅ | Replaces flux-pro/imagen4 for these; subscription-paid, no per-image cost. |
| Primary gen — **prompts with content-policy edges** (cannabis, weapons, etc.) | **flux-pro/imagen4 (NOT chatgpt)** ❌ | DALL-E silently substitutes the prompt with a "safe" alternative instead of refusing. The substituted image gets saved to disk under your character's filename, silently corrupting the locked ref. Use a backend that refuses-on-policy rather than substitutes. |
| Single-ref restage / pose change (1 ref) | **chatgpt** ✅ | Character identity preserved, scene composed cleanly, ~70s end-to-end |
| Brand bake (logo placement, merch mockup, ≤2 refs) | **chatgpt** ✅ | DALL-E reproduces logos via image ref reasonably well; cheaper than burning FAL credits |
| QC auto-correction (single targeted fix) | **chatgpt** ✅ | Cheap, fast, avoids burning FAL credits on small changes |
| 2-character keyframe (2 char + 1 loc refs) | **either backend works** ✅ | Identity, accessories, coat colour all preserved by both. nano edges chatgpt on **background plate fidelity**; chatgpt frames closer character-portraits. |
| Ensemble keyframe (5–7 refs) | **nano-banana** ✅ | Side-by-side tests: nano kept more characters with stronger location-plate fidelity. chatgpt drifted more on abstract characters and rendered generic backgrounds. Both drifted on the most abstract refs. |
| Any text rendering on the image | **neither** — overlay via ffmpeg post | Both DALL-E and nano-banana garble text |

The species-conflation result for ensemble shots matches nano-compose's own SKILL.md known failure mode — DALL-E exhibits it more aggressively. nano-banana/edit's `image_urls` array conditioning gives stronger per-ref identity weight than DALL-E's text-context-with-attachments approach.

## One-time setup

### 1. Install browser-automate (if not already)

```bash
cd <home>/clawd/skills/browser-automate && pnpm install && pnpm run build
```

### 2. Sign in to ChatGPT in your daily Chrome

Open `https://chatgpt.com/` in your normal Chrome, sign in, complete any 2FA, dismiss the welcome modal. The browser-automate daemon seeds from this profile on first start.

### 3. (Recommended) Create a Project for chat hygiene

In ChatGPT's left sidebar → **+ New project** → name it e.g. `compose-bakes`. Open the project, copy the URL — it'll look like `https://chatgpt.com/g/g-p-XXXXXXXX/project`. Set:

```bash
export CHATGPT_START_PATH="/g/g-p-XXXXXXXX/project"
```

(Or pass `--start-path` per call.) Every compose invocation will land on the project, so all generated chats stay scoped there instead of cluttering your main sidebar.

### 4. Start the daemon

```bash
<home>/clawd/skills/browser-automate/bin/browser-automate daemon start
```

This launches a debuggable Chrome that inherits your daily profile (cookies, session). Stays running across calls — leave it up. Stop with `daemon stop`.

## Usage

### Zero-ref primary generation (text-to-image, no references)

For primary character/location refs from a bible description. No positional args.

```bash
bun <home>/clawd/skills/chatgpt-compose/bin/chatgpt-compose.ts \
  --output ./locations/rooftop-night-locked.png \
  --aspect-ratio 16:9 \
  --prompt "Rooftop balcony, late night. Warm string lights, low velvet seating, distant city skyline below in muted amber haze. Painterly children's-book illustration style. No characters, no text."
```

### Single brand bake (1 ref, logo placement)

```bash
bun <home>/clawd/skills/chatgpt-compose/bin/chatgpt-compose.ts \
  --output ./char-with-logo.png \
  --prompt "Emboss the crown logo from the reference onto the medallion. Keep EVERYTHING else identical." \
  ./char-presigil.png ./brand-logo.png
```

### Ensemble scene keyframe (7 refs)

```bash
bun <home>/clawd/skills/chatgpt-compose/bin/chatgpt-compose.ts \
  --output ./p1-s03-keyframe.jpg \
  --prompt "Compose all six characters together at the location from the last reference. Close three-quarter framing on the foreground pair, others in soft focus." \
  --aspect-ratio 16:9 \
  ./char-1.png ./char-2.png ./char-3.png ./char-4.png ./char-5.png ./char-6.png ./loc.png
```

### Targeted QC correction

```bash
bun <home>/clawd/skills/chatgpt-compose/bin/chatgpt-compose.ts \
  --output ./fixed.png \
  --prompt "Add a small gold pendant to the character's neck. Don't change anything else." \
  ./qc-failed-frame.png
```

## Flags

| Flag | Purpose |
|---|---|
| `--output <path>` | Where to save the generated image (required) |
| `--prompt "<text>"` | Edit / composition instruction (required) |
| `--aspect-ratio <ratio>` | e.g. `16:9`, `1:1`, `9:16` — appended to prompt as natural language |
| `--start-path <path>` | URL fragment to land on, e.g. `/g/g-p-XXX/project`. Defaults to `$CHATGPT_START_PATH` or `/`. |
| `--timeout-ms <n>` | Image generation timeout (default 300000 = 5 min) |
| `IMG1 IMG2 …` | Reference image paths (positional, 0–20). **Zero refs = text-to-image generation.** |

## Output (stdout JSON)

```json
{
  "ok": true,
  "provider": "chatgpt-browser",
  "output": "./out.png",
  "bytes": 1820144,
  "imageUrl": "https://files.oaiusercontent.com/...",
  "chatUrl": "https://chatgpt.com/c/...",
  "durationMs": 87421
}
```

The `chatUrl` lets you reopen the generation in your browser to inspect, regenerate, or iterate manually.

## Prompt discipline

DALL-E benefits from the same rules as nano-banana:

1. **Reference inputs by position** — "the character from the first reference" / "the location from the last reference"
2. **Pin the unchanged parts explicitly** — "Keep EVERYTHING else identical — same {features}. Only {the edit}." prevents re-imagining
3. **For brand bakes, attach the logo PNG as a ref** — reproduces logos faithfully from image input, not text
4. **For BG continuity in close-ups** — explicit framing direction ("close three-quarter portrait, soft-focus secondary character at frame edge")

## Fragility — read before debugging

This skill goes off-label on `browser-automate`'s own warning: ChatGPT sits behind Cloudflare with active fingerprinting. Mitigations baked in:

- **CDP-attach via daemon, not Playwright-launched profile** — uses your real Chrome with real fingerprint and real session. Same pattern as `spotify-creators`.
- **Composer typed via `keyboard.type`, not `.fill()`** — ChatGPT's input is a ProseMirror contenteditable; `.fill()` no-ops on those.
- **Network capture for the image URL** — DOM scraping the assistant `<img>` is fragile because the turn re-renders during streaming. The recipe listens on `page.on('response')` for `files.oaiusercontent.com` / `oaidalleapi*.blob.core.windows.net` URLs.
- **Refusal detection** — if the chat surfaces "content policy" / "can't help with that" text, the recipe fails fast instead of waiting 5 min.

### When it breaks

- **Cloudflare challenge** → `browser-automate run chatgpt --headful --args-json '...'`, solve once manually, retry. Session persists in daemon Chrome.
- **`no <input type=file> found`** → ChatGPT moved the paperclip menu. Inspect the page; update `SELECTORS.fileInput` in `<home>/clawd/skills/browser-automate/src/recipes/chatgpt.ts`.
- **`composer not found`** → same — update `SELECTORS.composer`.
- **`send button never enabled`** → upload silently failed (oversize file, weird format, rate limit). Check error screenshot at `/tmp/browser-automate/chatgpt/<ts>/error-*.png`.
- **`no generated image detected within Xms`** → either the prompt was refused without a content-policy banner, or DALL-E URL pattern moved. Open the `chatUrl` from a successful prior run to inspect current image hosting domain, then update `isGeneratedImageUrl()`.
- **DALL-E quality regression vs nano-banana** → expected at higher ref counts. Fall back to nano-compose for that shot.

### Account safety

- One-account, one-session use only. Don't parallelise across the same login.
- ChatGPT enforces TWO rate limits, both relevant:
  - **Image generation**: Plus ~50/3hr, Pro higher. Trips silently — the assistant returns text instead of an image.
  - **Conversation creation**: creating ~6+ new chats inside ~10 min triggers a "Too many requests / temporarily limited access" modal that blocks all conversation actions. The recipe detects this up-front and fails fast.
- If you trip the conversation rate limit, **wait 5–10 min**. The session itself is fine; only new-chat creation is throttled.
- For batch workflows (e.g. generating a full character roster), strongly prefer **one chat with sequential prompts** over **N new chats**. Reduces both rate-limit risk and sidebar pollution. (The recipe currently creates a new chat per call — TODO: add `--continue-chat <id>` mode.)

## Related

- `browser-automate` — engine + login + daemon
- `nano-banana-compose` — original nano-compose, canonical compose-discipline rules
- `spotify-creators` — same CDP-attach pattern reference
