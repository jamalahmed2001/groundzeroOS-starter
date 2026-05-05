/**
 * spotify-creators — Spotify for Creators API layer.
 *
 * Spotify has no public upload API for podcasts. This skill drives the
 * creators.spotify.com UI via the browser-automate daemon (CDP attach),
 * under the user's signed-in account.
 *
 * Verbs:
 *   episode-upload  — upload a new episode (MP3 + metadata + optional art)
 *   episode-list    — list existing episodes for a show
 *   show-list       — list shows the user owns/manages
 *
 * Planned:
 *   episode-delete, episode-update
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';

const BA_BIN = process.env.BROWSER_AUTOMATE_BIN
  ?? join(homedir(), 'clawd', 'skills', 'browser-automate', 'bin', 'browser-automate');

function fail(msg: string, code = 1): never {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  process.exit(code);
}

interface BAResult<D = unknown> { ok: boolean; recipe?: string; data?: D; error?: string; }

function runBA<D = unknown>(args: string[]): Promise<BAResult<D>> {
  return new Promise((resolve, reject) => {
    const p = spawn(BA_BIN, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.stdout.on('error', () => { /* swallow EPIPE */ });
    p.on('error', (err) => settle(() => reject(err)));
    p.on('close', () => settle(() => {
      const txt = Buffer.concat(chunks).toString('utf8').trim();
      if (!txt) return reject(new Error('browser-automate produced no stdout'));
      const lines = txt.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{') && !line.startsWith('[')) continue;
        try { return resolve(JSON.parse(line) as BAResult<D>); } catch { /* try earlier */ }
      }
      try { return resolve(JSON.parse(txt) as BAResult<D>); } catch { /* fall through */ }
      reject(new Error(`browser-automate returned non-JSON:\n${txt.slice(0, 500)}`));
    }));
  });
}

async function ensureDaemon(): Promise<void> {
  const status = await runBA<unknown>(['daemon', 'status']) as unknown as { ok: boolean; running?: boolean };
  if (!status.running) {
    process.stderr.write('[spotify-creators] browser-automate daemon not running — starting it...\n');
    const start = await runBA(['daemon', 'start']);
    if (!start.ok) fail(`failed to start daemon: ${start.error ?? 'unknown'}`);
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i++; }
  }
  return out;
}

const HELP = `spotify-creators — Spotify for Creators API layer (CDP-attached browser automation)

Subcommands:
  show-list
      List the shows you own/manage.

  episode-list --show-id <id>
      List episodes for a show.
      Options:
        --limit <n>            Cap results (default 50)
        --output <path>        Write JSON to file

  episode-upload --show-id <id> --audio <mp3> --title "<text>" --description "<text>"
      Upload a new episode. Show ID can be the human slug (e.g. "mani8319") — the
      skill auto-resolves to the internal base62 id via the dashboard redirect.
      Options:
        --audio <path>         MP3 file (required)
        --title <text>         Episode title (required)
        --description <text>   Episode description
        --description-file <p> Read description from file (overrides --description)
        --description-section <h>  Extract only the section under "## <h>" from the file
                                   (use with --description-file; treats the file as a vault episode note)
        --art <path>           Episode art image (optional)
        --season <n>           Season number
        --episode <n>          Episode number
        --episode-type <full|trailer|bonus>  Default: full
        --explicit             Mark episode as explicit
        --dry-run              Print the resolved payload without calling the browser

      Release mode (pick ONE):
        --draft                Save as draft — no publish date needed
        --schedule             Schedule for a future date.
                               Use with --publish-date/--publish-time, or --schedule-for,
                               or alone (defaults to next Tuesday 05:00 for My Podcast cadence).
        --publish-date <iso>   YYYY-MM-DD (implies --schedule)
        --publish-time <HH:MM> 24-hour time (defaults to 05:00)
        --schedule-for <spec>  Shorthand: "next-tuesday 05:00", "next-monday 09:00", etc.
        (neither --draft nor --schedule) → publish immediately

  help

Behaviour:
  - Requires browser-automate daemon (auto-starts).
  - You must already be signed in to Spotify for Creators in the daemon Chrome
    (the daemon seeds from ~/.config/google-chrome/Default on first start, so if
    you're signed in in your daily browser, the daemon inherits it).
  - Output on stdout is JSON on success.
`;

async function cmdShowList(_args: Record<string, string | boolean>): Promise<void> {
  await ensureDaemon();
  const recipeFile = await writeShowListRecipe();
  const result = await runBA<{ shows: Array<{ id: string; name: string; url: string }> }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '60000'],
  );
  if (!result.ok || !result.data) fail(`show-list failed: ${result.error ?? 'unknown'}`);
  process.stdout.write(JSON.stringify({ ok: true, shows: result.data.shows }, null, 2) + '\n');
}

async function cmdEpisodeList(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args['show-id'] !== 'string') fail('--show-id <id> required');
  await ensureDaemon();
  const recipeFile = await writeEpisodeListRecipe();
  const result = await runBA<{ episodes: Array<{ id: string; title: string; url: string; state?: string; publishDate?: string }> }>(
    ['run', '--recipe-file', recipeFile, '--args-json', JSON.stringify({ showId: args['show-id'] }), '--timeout-ms', '60000'],
  );
  if (!result.ok || !result.data) fail(`episode-list failed: ${result.error ?? 'unknown'}`);
  const limit = Number(args.limit ?? 50);
  const out = { ok: true, count: result.data.episodes.length, episodes: result.data.episodes.slice(0, limit) };
  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(out, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, count: out.count }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  }
}

// Resolve "next-tuesday 05:00" → { date: "YYYY-MM-DD", time: "05:00" } relative to now.
// Accepts day names tuesday, wednesday, etc. Time in 24h HH:MM.
function resolveScheduleFor(spec: string): { date: string; time: string } {
  const parts = spec.trim().split(/\s+/);
  if (parts.length < 1) throw new Error(`--schedule-for format: "next-<weekday> HH:MM" (got "${spec}")`);
  const dayToken = parts[0].toLowerCase().replace(/^next-/, '');
  const time = parts[1] ?? '05:00';
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDow = days.indexOf(dayToken);
  if (targetDow < 0) throw new Error(`unknown weekday "${dayToken}" — expected one of ${days.join(', ')}`);
  const now = new Date();
  const todayDow = now.getDay();
  let addDays = (targetDow - todayDow + 7) % 7;
  if (addDays === 0) addDays = 7; // "next-tuesday" on a Tuesday means one week from now
  const target = new Date(now);
  target.setDate(now.getDate() + addDays);
  const iso = target.toISOString().slice(0, 10);
  return { date: iso, time };
}

async function cmdEpisodeUpload(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args['show-id'] !== 'string') fail('--show-id required');
  if (typeof args.audio !== 'string') fail('--audio <path> required');
  if (typeof args.title !== 'string') fail('--title required');

  let description = typeof args.description === 'string' ? args.description : '';
  if (typeof args['description-file'] === 'string') {
    description = await readFile(args['description-file'], 'utf8');
    // --description-section "Description" extracts everything between `## Description` and the next `## ` heading.
    // Vault episode notes should have a canonical `## Description` section — this keeps the distribution
    // copy as pipeline source-of-truth instead of typed/regenerated each time.
    if (typeof args['description-section'] === 'string') {
      const heading = String(args['description-section']).trim();
      const re = new RegExp(`^#{1,6}\\s+${heading}\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|$(?![\\s\\S]))`, 'm');
      const m = description.match(re);
      if (!m) fail(`--description-section "${heading}" not found in ${args['description-file']}`);
      description = m[1].replace(/^\s+|\s+$/g, '');
    }
  }

  // Resolve publish date + time.
  //   --publish-date YYYY-MM-DD  --publish-time HH:MM (24h) — explicit
  //   --schedule-for "next-<weekday> HH:MM"  (e.g. "next-tuesday 05:00") — shorthand
  // If neither passed and --schedule is set, default to next-Tuesday 05:00.
  let publishDate: string | undefined;
  let publishTime: string | undefined;
  if (typeof args['publish-date'] === 'string') publishDate = args['publish-date'];
  if (typeof args['publish-time'] === 'string') publishTime = args['publish-time'];
  if (typeof args['schedule-for'] === 'string') {
    const resolved = resolveScheduleFor(args['schedule-for']);
    publishDate = publishDate ?? resolved.date;
    publishTime = publishTime ?? resolved.time;
  }
  // Default for My Podcast cadence: schedule flag without explicit inputs → next Tuesday 5am
  if (!!args.schedule && !publishDate) {
    const d = resolveScheduleFor('next-tuesday 05:00');
    publishDate = d.date; publishTime = d.time;
  }

  const payload = {
    showId: args['show-id'],
    audio: args.audio,
    title: args.title,
    description,
    art: typeof args.art === 'string' ? args.art : undefined,
    publishDate,
    publishTime,
    season: typeof args.season === 'string' ? Number(args.season) : undefined,
    episode: typeof args.episode === 'string' ? Number(args.episode) : undefined,
    episodeType: typeof args['episode-type'] === 'string' ? args['episode-type'] : 'full',
    schedule: !!args.schedule,
    draft: !!args.draft,
    explicit: !!args.explicit,
  };

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, payload }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const recipeFile = await writeEpisodeUploadRecipe();
  const result = await runBA<{ episodeUrl?: string; episodeId?: string; state: string }>(
    ['run', '--recipe-file', recipeFile, '--args-json', JSON.stringify(payload), '--timeout-ms', '600000'],
  );
  if (!result.ok || !result.data) fail(`episode-upload failed: ${result.error ?? 'unknown'}`);
  process.stdout.write(JSON.stringify({ ok: true, ...result.data }, null, 2) + '\n');
}

async function writeShowListRecipe(): Promise<string> {
  const path = join('/tmp', 'spotify-creators-show-list.mjs');
  const src = `
export default {
  name: 'spotify-creators-show-list',
  description: 'List shows visible in the Spotify for Creators account menu',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /creators\\.spotify\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    // Capture network responses that list shows.
    const shows = new Map();
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!/creators\\.spotify\\.com|anchor\\.fm|podcasters\\.spotify\\.com/.test(url)) return;
      if (!/shows|podcasts|stations/i.test(url)) return;
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (!ct.includes('application/json')) return;
        const body = await resp.json().catch(() => null);
        if (body) walkShows(body, shows);
      } catch {}
    });

    await page.goto('https://creators.spotify.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Also try the dashboard URL (newer variants).
    if (shows.size === 0) {
      await page.goto('https://creators.spotify.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }

    return { shows: Array.from(shows.values()) };
  },
};

function walkShows(obj, sink) {
  if (!obj) return;
  if (Array.isArray(obj)) { for (const it of obj) walkShows(it, sink); return; }
  if (typeof obj !== 'object') return;
  const r = obj;
  // Heuristic: a show object has id/uuid + (name|title) and usually a podcastUrl or stationId.
  const id = r.id ?? r.uuid ?? r.stationId ?? r.podcastId;
  const name = r.name ?? r.title ?? r.podcastTitle;
  if (typeof id === 'string' && typeof name === 'string' && (r.podcastUrl || r.stationId || r.podcastId || /show|podcast/i.test(JSON.stringify(Object.keys(r))))) {
    if (!sink.has(id)) {
      sink.set(id, {
        id, name,
        url: r.podcastUrl ?? r.url ?? null,
      });
    }
  }
  for (const v of Object.values(r)) walkShows(v, sink);
}
`;
  await writeFile(path, src, 'utf8');
  return path;
}

async function writeEpisodeListRecipe(): Promise<string> {
  const path = join('/tmp', 'spotify-creators-episode-list.mjs');
  const src = `
export default {
  name: 'spotify-creators-episode-list',
  description: 'List episodes of a show via the creators.spotify.com UI',
  async run(ctx, args) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /creators\\.spotify\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    const episodes = new Map();
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!/creators\\.spotify\\.com|anchor\\.fm|podcasters\\.spotify\\.com/.test(url)) return;
      if (!/episodes?|item/i.test(url)) return;
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (!ct.includes('application/json')) return;
        const body = await resp.json().catch(() => null);
        if (body) walkEpisodes(body, episodes);
      } catch {}
    });

    // Spotify for Creators URLs (the UI has shifted between anchor.fm, podcasters.spotify.com, creators.spotify.com).
    const candidateUrls = [
      \`https://creators.spotify.com/podcast/episodes\`,
      \`https://creators.spotify.com/pod/show/\${args.showId}/episodes\`,
      \`https://podcasters.spotify.com/pod/show/\${args.showId}/episodes\`,
    ];
    for (const u of candidateUrls) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3500);
      if (episodes.size > 0) break;
    }

    // Scroll to trigger lazy loading.
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000)).catch(() => {});
      await page.waitForTimeout(800);
    }

    return { episodes: Array.from(episodes.values()) };
  },
};

function walkEpisodes(obj, sink) {
  if (!obj) return;
  if (Array.isArray(obj)) { for (const it of obj) walkEpisodes(it, sink); return; }
  if (typeof obj !== 'object') return;
  const r = obj;
  const id = r.episodeId ?? r.webEpisodeId ?? r.id ?? r.uuid;
  const title = r.title ?? r.name;
  if (typeof id === 'string' && typeof title === 'string' && (r.duration !== undefined || r.publishOn || r.publishedAt || r.audioUrl || r.state || r.status)) {
    if (!sink.has(id)) {
      sink.set(id, {
        id, title,
        url: r.episodeShareUrl ?? r.shareUrl ?? r.url ?? null,
        state: r.state ?? r.status ?? null,
        publishDate: r.publishOn ?? r.publishedAt ?? r.publishDate ?? null,
        duration: r.duration ?? null,
      });
    }
  }
  for (const v of Object.values(r)) walkEpisodes(v, sink);
}
`;
  await writeFile(path, src, 'utf8');
  return path;
}

async function writeEpisodeUploadRecipe(): Promise<string> {
  const path = join('/tmp', 'spotify-creators-episode-upload.mjs');
  const src = `
import { stat } from 'fs/promises';

export default {
  name: 'spotify-creators-episode-upload',
  description: 'Upload a new episode via the creators.spotify.com UI',
  async run(ctx, args) {
    // Validate input file.
    try {
      const s = await stat(args.audio);
      if (!s.isFile() || s.size === 0) throw new Error('audio file missing or empty');
    } catch (e) { throw new Error(\`audio file check failed: \${e?.message ?? e}\`); }

    const pages = ctx.context.pages();
    let page = pages.find(p => /creators\\.spotify\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    // Resolve showId — callers may pass the human slug (e.g. "mani8319") OR the
    // internal base62 show UUID (e.g. "4ICpM5YIPlvPMM2FpOHAkJ"). If we get a slug,
    // navigate once to /pod/show/<slug> and follow the redirect to /pod/profile/<realId>.
    // If user passed the base62 internal id, use it directly. Otherwise resolve via
    // the dashboard: /pod/dashboard/home/main auto-redirects to /pod/show/<internalId>/home/main
    // for the owner's first show, OR we pick the matching show from the DOM if multiple.
    let resolvedShowId = args.showId;
    if (!/^[A-Za-z0-9]{20,30}$/.test(resolvedShowId)) {
      ctx.log(\`resolving show slug "\${resolvedShowId}" via dashboard\`);
      await page.goto('https://creators.spotify.com/pod/dashboard/home/main', { waitUntil: 'networkidle', timeout: 30000 });
      for (let i = 0; i < 8; i++) {
        const m = page.url().match(/\\/pod\\/show\\/([A-Za-z0-9]{20,30})\\//);
        if (m) { resolvedShowId = m[1]; ctx.log(\`resolved to \${resolvedShowId}\`); break; }
        await page.waitForTimeout(2000);
      }
      if (!/^[A-Za-z0-9]{20,30}$/.test(resolvedShowId)) {
        // Fallback: pull from any /pod/show/<id>/ link in the page DOM
        const fromDom = await page.evaluate(() => {
          const a = document.querySelector('a[href*="/pod/show/"]');
          const m = a?.getAttribute('href')?.match(/\\/pod\\/show\\/([A-Za-z0-9]{20,30})\\//);
          return m ? m[1] : null;
        }).catch(() => null);
        if (fromDom) { resolvedShowId = fromDom; ctx.log(\`resolved via DOM link: \${resolvedShowId}\`); }
      }
      if (!/^[A-Za-z0-9]{20,30}$/.test(resolvedShowId)) {
        throw new Error(\`could not resolve show slug "\${args.showId}" to internal id — final URL: \${page.url()}\`);
      }
    }

    // Capture the numeric episodeId from network (fires when process_upload finalizes)
    let capturedEpisodeId = null;
    let capturedEpisodeUri = null;
    page.on('response', async (resp) => {
      const url = resp.url();
      const method = resp.request().method();
      if (method !== 'POST') return;
      if (/api-v5\\.anchor\\.fm\\/v3\\/stations\\/\\d+\\/episodes\\?/.test(url) && resp.ok()) {
        try { const b = await resp.json(); capturedEpisodeUri = b.episodeUri ?? null; ctx.log(\`shell → \${capturedEpisodeUri}\`); } catch {}
      }
      if (/api-v5\\.anchor\\.fm\\/v3\\/upload\\/.+\\/process_upload/.test(url)) {
        try {
          const body = JSON.parse(resp.request().postData() || '{}');
          if (body.episodeId) { capturedEpisodeId = body.episodeId; ctx.log(\`captured numeric id=\${capturedEpisodeId}\`); }
        } catch {}
      }
    });

    // Navigate to the new-episode wizard (Spotify redirects slug → internal base62 id)
    const wizardUrl = \`https://creators.spotify.com/pod/show/\${resolvedShowId}/episode/wizard\`;
    ctx.log(\`→ \${wizardUrl}\`);
    await page.goto(wizardUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // Poll for the upload UI for up to 15s (React lazy-mount)
    let hasUploadUI = false;
    for (let i = 0; i < 15; i++) {
      hasUploadUI = await page.$('input[type="file"], [data-testid="uploadAreaWrapper"]').then(Boolean).catch(() => false);
      if (hasUploadUI) break;
      await page.waitForTimeout(1000);
    }
    if (!hasUploadUI) throw new Error(\`new-episode wizard did not load upload UI — final URL: \${page.url()}\`);
    // Capture the resolved internal id from the now-redirected URL
    const m = page.url().match(/\\/pod\\/show\\/([A-Za-z0-9]{20,30})\\//);
    if (m) { resolvedShowId = m[1]; ctx.log(\`resolved internal id: \${resolvedShowId}\`); }

    // Step 1 — upload audio
    ctx.log(\`uploading audio: \${args.audio}\`);
    const fileInputs = await page.$$('input[type="file"]');
    if (fileInputs.length === 0) throw new Error('file input not found');
    // First audio-accepting input
    let audioInput = null;
    for (const el of fileInputs) {
      const accept = (await el.getAttribute('accept')) || '';
      if (!accept || /audio|video|mp3|wav|mp4/i.test(accept)) { audioInput = el; break; }
    }
    await (audioInput ?? fileInputs[0]).setInputFiles(args.audio);

    // Wait until we see the captured episodeId OR a "Next" button becomes clickable
    ctx.log('waiting for process_upload + Next button...');
    const uploadDeadline = Date.now() + 600000;
    while (Date.now() < uploadDeadline) {
      if (capturedEpisodeId) break;
      await page.waitForTimeout(2000);
    }
    if (!capturedEpisodeId) throw new Error('process_upload never fired within 10 min — upload failed or UI changed');

    // Click Next → details step
    await clickFirst(page, ['button:has-text("Next")'], 'Next after upload', ctx);
    await page.waitForTimeout(2500);

    // Step 2 — fill metadata (confirmed selectors sniffed 2026-04-20)
    await fillFirst(page, ['input[name="title"]'], args.title, 'title', ctx);

    // Description — Spotify's rich-text editor is a contenteditable. Raw .type() produces
    // literal markdown artefacts (asterisks, dashes). We inject HTML directly then dispatch
    // React-compatible input events so the form's controller picks up the change.
    const descSelector = '[contenteditable="true"][name="description"], div[name="description"][contenteditable="true"]';
    const descHandle = await page.$(descSelector);
    if (descHandle && args.description) {
      const raw = args.description;
      // Decide if caller passed HTML or plain text.
      // HTML: contains a tag like <p>, <ul>, <li>, <strong>, <em>, <br>
      // Plain: everything else — convert bullet lines to <ul>, paragraphs to <p>, preserve <em>/<strong>.
      // Parse into blocks for keyboard-typing (React-friendly).
      const blocks = parseDescriptionBlocks(raw);
      void plainTextToHtml;  // kept for reference, no longer used

      await descHandle.click();
      await page.waitForTimeout(300);
      // Clear any existing content
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await page.waitForTimeout(200);

      // Paste each block via a synthetic ClipboardEvent so React's rich-text editor
      // receives it as one operation (instant, preserves quotes/em-dashes, no typing artefacts).
      async function pasteText(text) {
        await page.evaluate((t) => {
          const el = document.activeElement;
          if (!el) return;
          const dt = new DataTransfer();
          dt.setData('text/plain', t);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }, text);
      }
      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        if (block.kind === 'p') {
          await pasteText(block.text);
        } else if (block.kind === 'ul' || block.kind === 'ol') {
          const btnAria = block.kind === 'ul' ? 'Unordered list' : 'Ordered list';
          const btn = await page.$(\`button[aria-label="\${btnAria}"]\`);
          if (btn) await btn.click().catch(() => {});
          await page.waitForTimeout(150);
          for (let i = 0; i < block.items.length; i++) {
            await pasteText(block.items[i]);
            if (i < block.items.length - 1) await page.keyboard.press('Enter');
          }
          if (btn) await btn.click().catch(() => {});
          await page.waitForTimeout(100);
        }
        if (bi < blocks.length - 1) await page.keyboard.press('Enter');
      }
      ctx.log(\`description filled (\${blocks.length} blocks, pasted)\`);
      // Click body to force blur out of the rich-text editor, so subsequent Next clicks advance
      await page.evaluate(() => (document.activeElement)?.blur?.());
      await page.mouse.click(10, 10).catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Episode art (optional)
    if (args.art) {
      try {
        const artInput = await page.$('input[type="file"][accept*="image"]');
        if (artInput) { await artInput.setInputFiles(args.art); ctx.log('uploaded art'); }
      } catch (e) { ctx.log(\`art upload skipped: \${e?.message ?? e}\`); }
    }

    // Season + episode number — confirmed names from sniff
    if (args.season !== undefined) {
      await fillFirst(page, ['input[name="podcastSeasonNumber"]'], String(args.season), 'season', ctx).catch(() => {});
    }
    if (args.episode !== undefined) {
      await fillFirst(page, ['input[name="podcastEpisodeNumber"]'], String(args.episode), 'episodeNumber', ctx).catch(() => {});
    }

    // Episode type (full / trailer / bonus) — radio by name
    if (args.episodeType && args.episodeType !== 'full') {
      await clickFirst(page, [
        \`input[name="podcastEpisodeType"][value="\${args.episodeType}"]\`,
        \`label:has-text("\${args.episodeType}")\`,
      ], \`episode type \${args.episodeType}\`, ctx).catch(() => {});
    }

    // Explicit toggle
    if (args.explicit) {
      await clickFirst(page, [
        'input[name="podcastEpisodeIsExplicit"]',
        '[role="switch"][aria-label*="explicit" i]',
      ], 'explicit toggle', ctx).catch(() => {});
    }

    // Blur any focused field + click body so Next advances instead of being absorbed by the rich-text editor
    await page.evaluate(() => (document.activeElement)?.blur?.());
    await page.mouse.click(10, 10).catch(() => {});
    await page.waitForTimeout(800);

    // Advance to publish step — verify URL or wizard step marker changes
    const detailsUrl = page.url();
    await clickFirst(page, ['button:has-text("Next")'], 'Next → publish step', ctx);
    // Wait for either URL change, or the schedule radio to appear
    for (let i = 0; i < 10; i++) {
      const onPublish = await page.$('input[name="wizardPublishDateSelection"]').then(Boolean).catch(() => false);
      if (onPublish) { ctx.log('confirmed on publish step'); break; }
      await page.waitForTimeout(1000);
      if (i === 5) { // try clicking Next again in case the first was absorbed
        ctx.log('publish step not reached; retrying Next');
        await clickFirst(page, ['button:has-text("Next")'], 'Next (retry)', ctx).catch(() => {});
      }
    }

    // Scheduled publish — pick "Schedule for later" radio, set date + time
    if (args.publishDate && !args.draft) {
      const iso = args.publishDate.split('T')[0];

      // 1. Select "Schedule" radio
      const radios = await page.$$('input[name="wizardPublishDateSelection"]');
      for (const r of radios) {
        const val = (await r.getAttribute('value')) || '';
        if (/schedule|later|date/i.test(val) || val !== 'now') {
          await r.click({ force: true }).catch(() => {});
          ctx.log(\`schedule radio (value=\${val}) clicked\`);
          break;
        }
      }
      await page.waitForTimeout(4000);

      // Poll for time inputs to appear (they lazy-mount after schedule radio click).
      // If not found within 8s, click every "Expand or collapse section" button to force-render.
      let hourInput = await page.$('input[data-testid="hour-picker"], input[aria-label="Hour picker"]').catch(() => null);
      if (!hourInput) {
        const expanders = await page.$$('button[aria-label*="Expand" i]');
        for (const e of expanders) {
          await e.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
          hourInput = await page.$('input[data-testid="hour-picker"], input[aria-label="Hour picker"]').catch(() => null);
          if (hourInput) break;
        }
      }
      // Final wait
      for (let i = 0; i < 10 && !hourInput; i++) {
        await page.waitForTimeout(1000);
        hourInput = await page.$('input[data-testid="hour-picker"], input[aria-label="Hour picker"]').catch(() => null);
      }
      if (!hourInput) ctx.log('WARNING: hour-picker never appeared — schedule time may use Spotify default');

      // 2. Open date picker + pick day
      const dateBtn = await page.$('button[aria-label*="date" i], button:has-text("/20"), button:has-text("/2026")').catch(() => null);
      if (dateBtn) {
        await dateBtn.click();
        await page.waitForTimeout(1000);
        const [y, m, d] = iso.split('-');
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const longDateStr = \`\${months[Number(m)-1]} \${Number(d)}, \${y}\`;
        // Navigate calendar forward if the target month isn't shown — click "Next month" until longDateStr appears
        for (let i = 0; i < 12; i++) {
          const cell = await page.$(\`td[aria-label*="\${longDateStr}"]\`).catch(() => null);
          if (cell) { await cell.click(); ctx.log(\`picked \${longDateStr}\`); break; }
          const nextMonthBtn = await page.$('button[aria-label*="Next month" i], button[aria-label*="next" i]').catch(() => null);
          if (!nextMonthBtn) break;
          await nextMonthBtn.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      // 3. Fill time (hour-picker / minute-picker / meridiem-picker — testid selectors from sniff)
      const time = args.publishTime || '05:00';
      const [hh, mm] = time.split(':').map((x) => Number(x));
      const h12 = ((hh + 11) % 12) + 1;
      const meridiem = hh < 12 ? 'AM' : 'PM';

      if (hourInput) {
        await hourInput.click({ force: true });
        await page.keyboard.press('Control+A');
        await hourInput.type(String(h12));
        await hourInput.press('Tab');
        ctx.log(\`hour = \${h12}\`);
      }

      const minInput = await page.$('input[data-testid="minute-picker"], input[aria-label="Minute picker"]').catch(() => null);
      if (minInput) {
        await minInput.click({ force: true });
        await page.keyboard.press('Control+A');
        await minInput.type(String(mm).padStart(2, '0'));
        await minInput.press('Tab');
        ctx.log(\`minute = \${String(mm).padStart(2, '0')}\`);
      }

      const meridiemSel = await page.$('select[data-testid="meridiem-picker"]').catch(() => null);
      if (meridiemSel) { await meridiemSel.selectOption(meridiem); ctx.log(\`meridiem = \${meridiem}\`); }
      await page.waitForTimeout(1500);
    }

    // Wait for publish-step buttons to settle
    await page.waitForTimeout(4000);

    // Final action — selectors confirmed by sniff
    let actionButton;
    if (args.draft) {
      actionButton = [
        'button:has-text("Save draft")',
        'button:has-text("Save as draft")',
        'button[aria-label="Save draft"]',
      ];
    } else if (args.schedule || args.publishDate) {
      // Schedule radio selected → final button is "Publish" (Spotify treats it as
      // "publish at scheduled date" based on the radio value).
      actionButton = [
        'button:has-text("Publish")',
        'button:has-text("Schedule")',
      ];
    } else {
      actionButton = [
        'button:has-text("Publish now")',
        'button:has-text("Publish")',
      ];
    }

    // Retry up to 10s waiting for the button to render
    let clicked = false;
    for (let i = 0; i < 10 && !clicked; i++) {
      for (const sel of actionButton) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
          await el.click().catch(() => {});
          ctx.log(\`clicked final action via "\${sel}"\`);
          clicked = true;
          break;
        }
      }
      if (!clicked) await page.waitForTimeout(1000);
    }

    // If still not clicked and we're in draft mode, try the Close button — it prompts save
    if (!clicked && args.draft) {
      const closeBtn = await page.$('button[aria-label="Close"]').catch(() => null);
      if (closeBtn) {
        await closeBtn.click();
        ctx.log('clicked Close — expecting save-draft confirmation');
        await page.waitForTimeout(2000);
        // Click the confirm in the save-draft dialog
        const confirm = await page.$('button:has-text("Save draft"), button:has-text("Save"), button:has-text("Yes")').catch(() => null);
        if (confirm) { await confirm.click(); clicked = true; ctx.log('confirmed save-draft'); }
      }
    }

    if (!clicked) {
      // Last resort: dump visible buttons so the operator can debug
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((el) => el.offsetWidth > 0)
          .map((el) => ({ text: (el.textContent || '').trim().slice(0, 60), aria: el.getAttribute('aria-label') }));
      }).catch(() => []);
      throw new Error(\`could not find final action. Visible buttons: \${JSON.stringify(buttons).slice(0, 800)}\`);
    }

    await page.waitForTimeout(6000);

    return {
      state: args.draft ? 'draft' : (args.schedule ? 'scheduled' : 'published'),
      episodeUrl: page.url(),
      episodeUri: capturedEpisodeUri,
      episodeId: capturedEpisodeId,
    };
  },
};

// Parse a description (plain text, markdown, or HTML) into block list for keyboard typing.
// Returns: [{ kind: 'p', text }, { kind: 'ul', items: [...] }, { kind: 'ol', items: [...] }]
function parseDescriptionBlocks(raw) {
  // Strip HTML tags to plain text with paragraph/list structure preserved.
  let text = raw;
  if (/<(p|ul|ol|li|br)/i.test(raw)) {
    text = raw
      .replace(/<\\/?(strong|b|em|i|u|span|a[^>]*)>/gi, '')        // drop inline formatting
      .replace(/<br\\s*\\/?>/gi, '\\n')
      .replace(/<\\/(p|div|h[1-6])>/gi, '\\n\\n')
      .replace(/<(p|div|h[1-6])[^>]*>/gi, '')
      .replace(/<ul[^>]*>/gi, '').replace(/<\\/ul>/gi, '\\n')
      .replace(/<ol[^>]*>/gi, '').replace(/<\\/ol>/gi, '\\n')
      .replace(/<li[^>]*>/gi, '- ').replace(/<\\/li>/gi, '\\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&(?:quot|#34);/gi, '"').replace(/&(?:apos|#39);/gi, "'");
  }
  const lines = text.split(/\\r?\\n/);
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join(' ').trim() }); para = []; } };
  const flushList = () => { if (list && list.items.length) { blocks.push({ kind: list.tag, items: list.items }); list = null; } };
  for (const l of lines) {
    const line = l.trim();
    if (line === '') { flushPara(); flushList(); continue; }
    const bullet = line.match(/^[-*•]\\s+(.+)$/);
    const numbered = line.match(/^\\d+\\.\\s+(.+)$/);
    if (bullet) {
      flushPara();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(numbered[1]);
    } else {
      flushList();
      // Strip stray markdown emphasis chars so they don't render as literal * or _
      para.push(line.replace(/\\*\\*([^*]+)\\*\\*/g, '$1').replace(/(^|\\s)\\*([^*]+)\\*/g, '$1$2').replace(/\\_\\_([^_]+)\\_\\_/g, '$1').replace(/(^|\\s)\\_([^_]+)\\_/g, '$1$2'));
    }
  }
  flushPara(); flushList();
  return blocks;
}

// Convert plain text with basic formatting hints to HTML for Spotify's rich-text editor.
// Rules:
//  - blank line → paragraph break
//  - lines starting with "- " → unordered list item
//  - lines starting with "1. ", "2. "... → ordered list item
//  - *text* → <em>
//  - **text** → <strong>
//  - otherwise → paragraph
function plainTextToHtml(raw) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inlineFmt = (s) =>
    s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
     .replace(/(^|[\\s\\(])\\*([^*]+)\\*/g, '$1<em>$2</em>');
  const lines = raw.split(/\\r?\\n/);
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inlineFmt(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map(i => '<li>' + inlineFmt(i) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') { flushPara(); flushList(); continue; }
    const bullet = line.match(/^[-*•]\\s+(.+)$/);
    const numbered = line.match(/^\\d+\\.\\s+(.+)$/);
    if (bullet) {
      flushPara();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(escape(bullet[1]));
    } else if (numbered) {
      flushPara();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(escape(numbered[1]));
    } else {
      flushList();
      para.push(escape(line));
    }
  }
  flushPara(); flushList();
  return out.join('');
}

async function clickFirst(page, selectors, label, ctx) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click().catch(() => {});
      ctx.log(\`clicked \${label} via "\${sel}"\`);
      return true;
    }
  }
  throw new Error(\`could not find \${label} (tried: \${selectors.join(', ')})\`);
}

async function fillFirst(page, selectors, value, label, ctx) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.fill('').catch(() => {});
      await el.fill(value);
      ctx.log(\`filled \${label} via "\${sel}"\`);
      return true;
    }
  }
  throw new Error(\`could not find \${label} (tried: \${selectors.join(', ')})\`);
}
`;
  await writeFile(path, src, 'utf8');
  return path;
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
    case 'show-list':       return cmdShowList(args);
    case 'episode-list':    return cmdEpisodeList(args);
    case 'episode-upload':  return cmdEpisodeUpload(args);
    default: fail(`unknown subcommand '${sub}' — run 'spotify-creators help'`);
  }
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
