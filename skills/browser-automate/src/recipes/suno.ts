import type { Recipe, RecipeContext } from '../types.js';

interface SunoArgs {
  prompt: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  count?: number;
  outputDir: string;
}

interface SunoTrack {
  id: string;
  title: string;
  audioUrl: string;
  filePath: string;
  bytes: number;
  durationSeconds?: number;
}

interface SunoResult {
  provider: 'suno-browser';
  tracks: SunoTrack[];
}

const SUNO_BASE = 'https://suno.com';
const CREATE_URL = `${SUNO_BASE}/create`;

async function ensureOnCreatePage(ctx: RecipeContext): Promise<void> {
  if (!ctx.page.url().startsWith(CREATE_URL)) {
    await ctx.page.goto(CREATE_URL, { waitUntil: 'domcontentloaded' });
  }
  // Give the SPA a moment to hydrate.
  await ctx.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

/**
 * Suno's UI changes often. We target by accessible role/label first, falling back to data-testid and text.
 * Selectors here will need updating when Suno redesigns. When they break, the screenshot-on-failure will
 * show the current layout.
 */
const SELECTORS = {
  // The custom-mode tab / toggle, so we can set style tags and title explicitly.
  customModeToggle: [
    'button:has-text("Custom Mode")',
    '[data-testid="custom-mode-toggle"]',
    'text="Custom"',
  ],
  styleField: [
    'textarea[placeholder*="Style" i]',
    'textarea[aria-label*="Style" i]',
    'input[placeholder*="Style" i]',
  ],
  descriptionField: [
    'textarea[placeholder*="description" i]',
    'textarea[placeholder*="song" i]',
    'textarea[aria-label*="Description" i]',
    'textarea',
  ],
  titleField: [
    'input[placeholder*="Title" i]',
    'input[aria-label*="Title" i]',
  ],
  instrumentalToggle: [
    'button:has-text("Instrumental")',
    'input[type="checkbox"][name*="instrumental" i]',
    '[role="switch"][aria-label*="instrumental" i]',
  ],
  createButton: [
    'button:has-text("Create")',
    'button[type="submit"]:has-text("Generate")',
    '[data-testid="create-button"]',
  ],
  loggedInIndicator: [
    '[data-testid="user-menu"]',
    'button[aria-label*="account" i]',
    'img[alt*="avatar" i]',
  ],
};

async function clickFirstMatch(ctx: RecipeContext, selectors: string[], label: string): Promise<boolean> {
  for (const sel of selectors) {
    const el = await ctx.page.$(sel);
    if (el) {
      await el.click().catch(() => {});
      ctx.log(`clicked ${label} via "${sel}"`);
      return true;
    }
  }
  ctx.log(`could not find ${label} (tried: ${selectors.join(', ')})`);
  return false;
}

async function fillFirstMatch(ctx: RecipeContext, selectors: string[], value: string, label: string): Promise<boolean> {
  for (const sel of selectors) {
    const el = await ctx.page.$(sel);
    if (el) {
      await el.fill('').catch(() => {});
      await el.fill(value);
      ctx.log(`filled ${label} via "${sel}"`);
      return true;
    }
  }
  ctx.log(`could not find ${label} (tried: ${selectors.join(', ')})`);
  return false;
}

export const sunoRecipe: Recipe<SunoArgs, SunoResult> = {
  name: 'suno',
  description: 'Generate music via Suno by driving the web UI (requires prior login).',
  loginUrl: `${SUNO_BASE}/login`,

  argsSchema: {
    prompt: { type: 'string', required: true, description: 'Song description / mood' },
    style: { type: 'string', description: 'Style tags (ambient piano, 60 bpm, etc.)' },
    title: { type: 'string', description: 'Track title' },
    instrumental: { type: 'boolean', description: 'Force instrumental (default true)' },
    count: { type: 'number', description: 'How many tracks to keep (default 2 — Suno generates 2 per submit)' },
    outputDir: { type: 'string', required: true, description: 'Directory to save MP3s' },
  },

  async isLoggedIn(ctx) {
    try {
      await ctx.page.goto(CREATE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      return false;
    }
    // If Suno redirected us to /login, we're not authed.
    if (/\/login/.test(ctx.page.url())) return false;

    // Look for any of the logged-in indicators, waiting a short beat for SPA hydration.
    await ctx.page.waitForTimeout(2000);
    for (const sel of SELECTORS.loggedInIndicator) {
      const el = await ctx.page.$(sel);
      if (el) return true;
    }
    // If we stayed on /create without a redirect, assume logged in.
    return ctx.page.url().startsWith(CREATE_URL);
  },

  async run(ctx, args) {
    const instrumental = args.instrumental ?? true;
    const count = args.count ?? 2;

    await ensureOnCreatePage(ctx);

    // Track audio URLs from XHR responses — the most reliable way to capture Suno's generated tracks
    // without depending on DOM structure.
    const seenAudioUrls = new Set<string>();
    ctx.page.on('response', async (resp) => {
      const url = resp.url();
      if (/\.mp3(\?|$)/i.test(url) || /audiopipe.suno.ai/.test(url) || /cdn1.suno.ai/.test(url)) {
        seenAudioUrls.add(url);
      }
      // Suno's clip metadata endpoint returns JSON with audio_url fields.
      if (/\/api\/feed/.test(url) || /\/api\/clip/.test(url) || /clip-/.test(url)) {
        try {
          const ct = resp.headers()['content-type'] ?? '';
          if (ct.includes('application/json')) {
            const body = (await resp.json().catch(() => null)) as unknown;
            collectAudioUrls(body, seenAudioUrls);
          }
        } catch {
          /* ignore */
        }
      }
    });

    // Enable custom mode if available (so we can set style + title explicitly).
    await clickFirstMatch(ctx, SELECTORS.customModeToggle, 'Custom Mode toggle').catch(() => {});

    // Fill the form.
    await fillFirstMatch(ctx, SELECTORS.descriptionField, args.prompt, 'description/prompt');
    if (args.style) await fillFirstMatch(ctx, SELECTORS.styleField, args.style, 'style tags');
    if (args.title) await fillFirstMatch(ctx, SELECTORS.titleField, args.title, 'title');

    if (instrumental) {
      // Toggle instrumental. Heuristic — the element may already be in the correct state.
      for (const sel of SELECTORS.instrumentalToggle) {
        const el = await ctx.page.$(sel);
        if (el) {
          const role = await el.getAttribute('role').catch(() => null);
          const ariaChecked = await el.getAttribute('aria-checked').catch(() => null);
          if (role === 'switch' && ariaChecked === 'false') await el.click();
          else if (role !== 'switch') await el.click();
          ctx.log(`toggled instrumental via "${sel}"`);
          break;
        }
      }
    }

    // Submit.
    const submitted = await clickFirstMatch(ctx, SELECTORS.createButton, 'Create/Generate button');
    if (!submitted) throw new Error('could not find a Create/Generate button — UI may have changed');

    // Poll for at least N audio URLs — whichever arrives first. Suno takes 30–120s per track usually.
    const deadline = Date.now() + 5 * 60 * 1000; // 5 minutes max
    while (seenAudioUrls.size < count && Date.now() < deadline) {
      await ctx.page.waitForTimeout(3000);
      // Scroll within the right-side feed to nudge lazy-loading if needed.
      await ctx.page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
    }

    if (seenAudioUrls.size === 0) {
      throw new Error('no audio URLs detected after 5 minutes — Suno may have rejected the prompt or UI changed');
    }

    const urls = Array.from(seenAudioUrls).slice(0, count);
    const tracks: SunoTrack[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const filePath = `${args.outputDir}/track-${String(i + 1).padStart(2, '0')}.mp3`;
      const bytes = await ctx.downloadUrl(url, filePath);
      tracks.push({
        id: extractClipId(url) ?? `track-${i + 1}`,
        title: args.title ?? 'Untitled',
        audioUrl: url,
        filePath,
        bytes,
      });
      ctx.log(`saved track ${i + 1} → ${filePath} (${bytes} bytes)`);
    }

    return { provider: 'suno-browser', tracks };
  },
};

function collectAudioUrls(obj: unknown, sink: Set<string>): void {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (/\.mp3(\?|$)/i.test(obj) || /audiopipe.suno.ai/.test(obj) || /cdn1.suno.ai/.test(obj)) sink.add(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectAudioUrls(item, sink);
    return;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) collectAudioUrls(v, sink);
  }
}

function extractClipId(url: string): string | undefined {
  const m = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : undefined;
}
