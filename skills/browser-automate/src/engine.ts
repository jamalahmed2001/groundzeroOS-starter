import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdir, writeFile, access } from 'fs/promises';
import { constants as fsC } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Recipe, RecipeContext, RecipeResult, RecipeRunOptions } from './types.js';

/**
 * Per-recipe persistent Chromium profile lives here. One dir per recipe name so
 * logins don't collide and concurrent runs can be scoped.
 *
 * Override with BROWSER_AUTOMATE_PROFILE_ROOT env var.
 */
function profileRoot(): string {
  return process.env.BROWSER_AUTOMATE_PROFILE_ROOT ?? join(homedir(), '.cache', 'browser-automate', 'profiles');
}

export function profileDirFor(recipeName: string): string {
  return join(profileRoot(), recipeName);
}

async function resolveChromeBinary(): Promise<string | undefined> {
  // Priority: explicit override > system Chrome > Playwright bundled (default).
  const override = process.env.BROWSER_AUTOMATE_CHROME;
  if (override) return override;
  const candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  for (const p of candidates) {
    try {
      await access(p, fsC.X_OK);
      return p;
    } catch {
      /* next */
    }
  }
  return undefined;
}

async function createContext(recipeName: string, headless: boolean): Promise<BrowserContext> {
  const userDataDir = profileDirFor(recipeName);
  await mkdir(userDataDir, { recursive: true });

  const executablePath = await resolveChromeBinary();

  // persistent context keeps cookies/localStorage/IndexedDB across runs.
  // When using system Chrome (executablePath set), do NOT override userAgent —
  // Chrome's natural UA must match so Clerk/Cloudflare session bindings stick.
  return chromium.launchPersistentContext(userDataDir, {
    headless,
    executablePath,  // undefined → Playwright's bundled chromium-headless-shell
    viewport: { width: 1366, height: 820 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
}

import type { Browser } from 'playwright';

async function attachViaCDP(): Promise<{ context: BrowserContext; browser: Browser } | null> {
  // Explicit override always wins.
  let cdpUrl = process.env.BROWSER_AUTOMATE_CDP_URL;

  // Auto-detect: if our daemon is running, use it.
  if (!cdpUrl) {
    try {
      const { daemonStatus } = await import('./daemon.js');
      const s = await daemonStatus();
      if (s.running) cdpUrl = s.cdpUrl;
    } catch { /* daemon check failed — fall through */ }
  }

  if (!cdpUrl) return null;
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error(`CDP attach: Chrome has no browser contexts at ${cdpUrl}`);
  return { context: contexts[0], browser };
}

export async function runRecipe<A, R>(
  recipe: Recipe<A, R>,
  args: A,
  opts: RecipeRunOptions,
): Promise<RecipeResult<R>> {
  const started = Date.now();
  const workDir = join('/tmp', 'browser-automate', recipe.name, String(Date.now()));
  await mkdir(workDir, { recursive: true });

  // CDP-attach mode: BROWSER_AUTOMATE_CDP_URL points at a user-launched Chrome
  // (e.g. `google-chrome --remote-debugging-port=9222`). Uses the user's real,
  // already-logged-in session — no profile persistence needed on our side.
  const cdpAttach = await attachViaCDP();
  const usingCDP = cdpAttach !== null;

  const headless = !(opts.loginMode || opts.headful);
  const context: BrowserContext = cdpAttach?.context ?? (await createContext(recipe.name, headless));
  const cdpBrowser = cdpAttach?.browser;
  const page: Page = context.pages()[0] ?? (await context.newPage());

  page.setDefaultTimeout(Math.min(60000, opts.timeoutMs));
  page.setDefaultNavigationTimeout(Math.min(60000, opts.timeoutMs));

  const log = (msg: string) => {
    process.stderr.write(`[${recipe.name}] ${msg}\n`);
  };

  const downloadUrl = async (url: string, destPath: string): Promise<number> => {
    // Download through the authenticated context so cookies / auth headers are included.
    const resp = await context.request.get(url, { timeout: 120000 });
    if (!resp.ok()) throw new Error(`download failed: HTTP ${resp.status()} for ${url}`);
    const buf = await resp.body();
    await mkdir(join(destPath, '..'), { recursive: true }).catch(() => {});
    await writeFile(destPath, buf);
    return buf.length;
  };

  const ctx: RecipeContext = { page, context, log, downloadUrl, workDir };

  const screenshots: string[] = [];

  try {
    if (opts.loginMode && usingCDP) {
      throw new Error('login mode is not supported with CDP attach — log in directly in your browser and run `run` instead');
    }
    if (opts.loginMode) {
      if (!recipe.loginUrl) throw new Error(`recipe '${recipe.name}' has no loginUrl and cannot run login mode`);
      const url = typeof recipe.loginUrl === 'function' ? recipe.loginUrl(args) : recipe.loginUrl;
      log(`opening ${url} for manual login — complete sign-in in the browser window, then close it`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait until user closes the browser window, or 15 minutes elapse as a hard stop.
      const loginDeadline = 15 * 60 * 1000;
      let closedByUser = false;
      let loginTimer: NodeJS.Timeout | undefined;
      await new Promise<void>((resolve) => {
        context.on('close', () => { closedByUser = true; resolve(); });
        loginTimer = setTimeout(resolve, loginDeadline);
      });
      if (loginTimer) clearTimeout(loginTimer);

      // If the user did not close the window themselves, close it ourselves so cookies flush.
      if (!closedByUser) {
        log('login timeout reached; closing context to persist session state');
        await context.close().catch(() => {});
      }

      log(closedByUser ? 'login window closed by user; session persisted' : 'login window closed by timeout; session MAY NOT be fully saved');
      return {
        ok: true,
        recipe: recipe.name,
        data: { loggedIn: true, closedBy: closedByUser ? 'user' : 'timeout' } as unknown as R,
        durationMs: Date.now() - started,
      };
    }

    if (recipe.isLoggedIn) {
      const loggedIn = await recipe.isLoggedIn(ctx);
      if (!loggedIn) {
        throw new Error(
          `not logged in for recipe '${recipe.name}' — run \`browser-automate login ${recipe.name}\` first`,
        );
      }
    }

    // Overall timeout guard — only applies to non-login runs.
    let outerTimer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      outerTimer = setTimeout(
        () => reject(new Error(`recipe '${recipe.name}' timed out after ${opts.timeoutMs}ms`)),
        opts.timeoutMs,
      );
    });

    try {
      const data = await Promise.race([recipe.run(ctx, args, opts), timeoutPromise]);
      return { ok: true, recipe: recipe.name, data, durationMs: Date.now() - started };
    } finally {
      if (outerTimer) clearTimeout(outerTimer);
    }
  } catch (err) {
    // On failure, capture a screenshot for diagnosis.
    try {
      const shotPath = join(workDir, `error-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      screenshots.push(shotPath);
      log(`screenshot on error: ${shotPath}`);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      recipe: recipe.name,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      screenshots,
    };
  } finally {
    if (!usingCDP) {
      try { await context.close(); } catch { /* ignore */ }
    } else if (cdpBrowser) {
      // Disconnect the WebSocket to let the Node event loop exit.
      // browser.close() on a connectOverCDP browser only disconnects — it does
      // NOT kill the user's Chrome.
      try { await cdpBrowser.close(); } catch { /* ignore */ }
    }
  }
}
