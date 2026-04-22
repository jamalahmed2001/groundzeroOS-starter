/**
 * music-distro — music distribution skill with pluggable provider recipes.
 *
 * Default provider: distrokid. Select others via MUSIC_DISTRO_PROVIDER.
 *
 * Verbs:
 *   release-create   — upload audio + metadata, submit for distribution (single-track)
 *   album-create     — multi-track album release from a manifest JSON
 *   release-list     — list existing releases in the account
 *   release-status   — get live status of a specific release
 *
 * Drives the distributor UI via browser-automate CDP attach (no public APIs
 * exist for individual-artist accounts across any major distributor).
 */

import { readFile, writeFile } from 'fs/promises';
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
    process.stderr.write('[music-distro] browser-automate daemon not running — starting it...\n');
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

type Provider = 'distrokid' | 'tunecore' | 'amuse' | 'routenote' | 'unitedmasters' | 'ditto';

function provider(): Provider {
  const v = (process.env.MUSIC_DISTRO_PROVIDER ?? 'distrokid').toLowerCase();
  const valid: Provider[] = ['distrokid', 'tunecore', 'amuse', 'routenote', 'unitedmasters', 'ditto'];
  if (!valid.includes(v as Provider)) fail(`unknown MUSIC_DISTRO_PROVIDER '${v}'. valid: ${valid.join(', ')}`);
  return v as Provider;
}

const HELP = `music-distro — music release distribution across services without public APIs

Subcommands:
  release-create
      Upload audio + metadata and submit for distribution.
      Options:
        --audio <path>           Final mastered MP3/WAV/FLAC (required)
        --title <text>           Track title (required)
        --artist <text>          Artist / stage name (required)
        --art <path>             Cover art — min 3000x3000 for most distributors (required)
        --release-date <YYYY-MM-DD>  Default: 4 weeks from today (for pre-save / playlist consideration)
        --isrc <code>            ISRC code (optional — some distros auto-assign)
        --upc <code>             UPC code (optional)
        --explicit               Mark as explicit
        --genre <text>           Primary genre
        --secondary-genre <text> Secondary genre
        --language <text>        Lyrics language (default: English)
        --songwriter <text>      Songwriter credit (can repeat: --songwriter "Jamal" --songwriter "...")
        --producer <text>        Producer credit (repeatable)
        --featuring <text>       Featured artist (repeatable)
        --instrumental           Mark instrumental (no lyrics)
        --ai-generated           Disclose AI tools used in creation (required by Spotify/etc. from 2025)
        --spotify-artist-id <id> Link to existing Spotify artist profile
        --apple-artist-id <id>   Link to existing Apple Music artist profile
        --release-type <single|ep|album>  Default: single
        --dry-run

  album-create
      Multi-track album (or EP) release from a manifest JSON.
      Options:
        --manifest <path>        Path to album.json (required, see shape below)
        --dry-run                Print resolved payload and exit

      Manifest JSON shape:
        {
          "releaseType": "album",         // or "ep"
          "title": "Low Light Hours",
          "artist": "Scrim Johnson",       // primary artist applied to every track
          "art": "/abs/path/cover.jpg",   // min 3000x3000
          "releaseDate": "2026-05-20",    // YYYY-MM-DD
          "genre": "Reggae",
          "secondaryGenre": "Lounge",     // optional
          "language": "English",
          "aiGenerated": true,
          "explicit": false,
          "tracks": [
            { "number": 1, "title": "Porch Light Still On", "audio": "/abs/01.mp3", "explicit": false, "instrumental": false, "featuring": [] },
            { "number": 2, "title": "Her Coat Your Chair", "audio": "/abs/02.mp3" },
            ...
          ]
        }

  release-list
      List your releases visible in the provider's dashboard.
      Options:
        --limit <n>              Cap (default 50)
        --output <path>          Write JSON to file

  release-status --release-id <id>
      Get live status of a specific release (pending, distributed, takedown, etc.).

  help

Provider selection:
  MUSIC_DISTRO_PROVIDER=distrokid (default) | tunecore | amuse | routenote | unitedmasters | ditto

Prerequisite:
  Signed in to the provider's web UI in your daily Chrome — browser-automate daemon
  inherits the session on first start.
`;

async function cmdReleaseCreate(args: Record<string, string | boolean>): Promise<void> {
  for (const req of ['audio', 'title', 'artist', 'art']) {
    if (typeof args[req] !== 'string') fail(`--${req} required`);
  }

  // Default release-date to 4 weeks out (DistroKid recommends ≥ 4 weeks for Spotify pre-save / editorial consideration)
  if (!args['release-date']) {
    const d = new Date(); d.setDate(d.getDate() + 28);
    args['release-date'] = d.toISOString().slice(0, 10);
  }

  const payload = {
    audio: args.audio,
    title: args.title,
    artist: args.artist,
    art: args.art,
    releaseDate: args['release-date'],
    isrc: args.isrc,
    upc: args.upc,
    explicit: !!args.explicit,
    genre: args.genre,
    secondaryGenre: args['secondary-genre'],
    language: args.language ?? 'English',
    instrumental: !!args.instrumental,
    aiGenerated: !!args['ai-generated'],
    spotifyArtistId: args['spotify-artist-id'],
    appleArtistId: args['apple-artist-id'],
    releaseType: args['release-type'] ?? 'single',
  };

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, provider: provider(), payload }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const recipeFile = await writeReleaseCreateRecipe(provider());
  const result = await runBA<{ releaseUrl?: string; releaseId?: string; state: string }>(
    ['run', '--recipe-file', recipeFile, '--args-json', JSON.stringify(payload), '--timeout-ms', '900000'],
  );
  if (!result.ok || !result.data) fail(`release-create failed: ${result.error ?? 'unknown'}`);
  process.stdout.write(JSON.stringify({ ok: true, provider: provider(), ...result.data }, null, 2) + '\n');
}

interface AlbumManifest {
  releaseType?: 'album' | 'ep';
  title: string;
  artist: string;
  art: string;
  releaseDate?: string;
  genre?: string;
  secondaryGenre?: string;
  language?: string;
  aiGenerated?: boolean;
  explicit?: boolean;
  isrc?: string;
  upc?: string;
  spotifyArtistId?: string;
  appleArtistId?: string;
  tracks: Array<{
    number: number;
    title: string;
    audio: string;
    explicit?: boolean;
    instrumental?: boolean;
    featuring?: string[];
    songwriters?: string[];
    isrc?: string;
  }>;
}

async function cmdAlbumCreate(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.manifest !== 'string') fail('--manifest <path> required');
  const raw = await readFile(args.manifest, 'utf8').catch((e) => fail(`reading manifest failed: ${e.message}`));
  let m: AlbumManifest;
  try { m = JSON.parse(raw) as AlbumManifest; }
  catch (e: any) { fail(`manifest is not valid JSON: ${e.message}`); }

  for (const req of ['title', 'artist', 'art']) {
    if (typeof (m as any)[req] !== 'string' || !(m as any)[req]) fail(`manifest.${req} required`);
  }
  if (!Array.isArray(m.tracks) || m.tracks.length === 0) fail('manifest.tracks must be a non-empty array');
  if (m.tracks.length === 1) {
    process.stderr.write('[music-distro] manifest has 1 track — consider `release-create` instead. Proceeding with album wizard anyway.\n');
  }
  // Sort tracks by number and validate each
  m.tracks.sort((a, b) => a.number - b.number);
  for (const t of m.tracks) {
    if (typeof t.title !== 'string' || !t.title) fail(`track ${t.number}: title required`);
    if (typeof t.audio !== 'string' || !t.audio) fail(`track ${t.number}: audio path required`);
  }

  if (!m.releaseDate) {
    const d = new Date(); d.setDate(d.getDate() + 28);
    m.releaseDate = d.toISOString().slice(0, 10);
  }
  if (!m.language) m.language = 'English';
  if (!m.releaseType) m.releaseType = 'album';

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, provider: provider(), manifest: m }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const recipeFile = await writeAlbumCreateRecipe(provider());
  // 10 minute per-track budget on uploads — albums are slow
  const timeoutMs = 600_000 + m.tracks.length * 180_000;
  const result = await runBA<{ releaseUrl?: string; state: string; tracksUploaded?: number }>(
    ['run', '--recipe-file', recipeFile, '--args-json', JSON.stringify(m), '--timeout-ms', String(timeoutMs)],
  );
  if (!result.ok || !result.data) fail(`album-create failed: ${result.error ?? 'unknown'}`);
  process.stdout.write(JSON.stringify({ ok: true, provider: provider(), trackCount: m.tracks.length, ...result.data }, null, 2) + '\n');
}

async function writeAlbumCreateRecipe(prov: Provider): Promise<string> {
  const path = join('/tmp', `music-distro-${prov}-album-create.mjs`);
  const src = prov === 'distrokid' ? distrokidAlbumCreateRecipe() : genericStubRecipe(prov, 'album-create');
  await writeFile(path, src, 'utf8');
  return path;
}

async function cmdReleaseList(args: Record<string, string | boolean>): Promise<void> {
  await ensureDaemon();
  const recipeFile = await writeReleaseListRecipe(provider());
  const result = await runBA<{ releases: Array<{ id: string; title: string; state: string; url: string }> }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '60000'],
  );
  if (!result.ok || !result.data) fail(`release-list failed: ${result.error ?? 'unknown'}`);
  const limit = Number(args.limit ?? 50);
  const out = { ok: true, provider: provider(), count: result.data.releases.length, releases: result.data.releases.slice(0, limit) };
  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(out, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, count: out.count }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  }
}

async function cmdReleaseStatus(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args['release-id'] !== 'string') fail('--release-id required');
  await ensureDaemon();
  const recipeFile = await writeReleaseListRecipe(provider());
  const result = await runBA<{ releases: Array<{ id: string; state: string; title: string; url: string }> }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '60000'],
  );
  if (!result.ok || !result.data) fail(`release-status failed: ${result.error ?? 'unknown'}`);
  const hit = result.data.releases.find((r) => r.id === args['release-id']);
  if (!hit) fail(`release ${String(args['release-id'])} not found`);
  process.stdout.write(JSON.stringify({ ok: true, provider: provider(), release: hit }, null, 2) + '\n');
}

// ─── Provider recipes ──────────────────────────────────────────────────────

async function writeReleaseCreateRecipe(prov: Provider): Promise<string> {
  const path = join('/tmp', `music-distro-${prov}-release-create.mjs`);
  const src = prov === 'distrokid' ? distrokidReleaseCreateRecipe() : genericStubRecipe(prov, 'release-create');
  await writeFile(path, src, 'utf8');
  return path;
}

async function writeReleaseListRecipe(prov: Provider): Promise<string> {
  const path = join('/tmp', `music-distro-${prov}-release-list.mjs`);
  const src = prov === 'distrokid' ? distrokidReleaseListRecipe() : genericStubRecipe(prov, 'release-list');
  await writeFile(path, src, 'utf8');
  return path;
}

function genericStubRecipe(prov: Provider, verb: string): string {
  return `
export default {
  name: 'music-distro-${prov}-${verb}',
  description: 'Stub recipe — ${prov} ${verb} not yet implemented',
  async run() {
    throw new Error('provider ${prov} not yet implemented; currently only distrokid is supported. Add a recipe in ~/clawd/skills/music-distro/src/cli.ts');
  },
};
`;
}

function distrokidReleaseListRecipe(): string {
  return `
export default {
  name: 'music-distro-distrokid-release-list',
  description: 'List releases from the DistroKid dashboard',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /distrokid\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    const releases = new Map();

    // Network capture: DistroKid loads release lists via XHR with titles + states
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!/distrokid\\.com/.test(url)) return;
      if (!/mymusic|songs|releases|api/i.test(url)) return;
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (!ct.includes('application/json')) return;
        const body = await resp.json().catch(() => null);
        if (body) walkReleases(body, releases);
      } catch {}
    });

    await page.goto('https://distrokid.com/mymusic/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // DistroKid's My Music page is largely HTML-rendered — fall back to DOM scrape.
    if (releases.size === 0) {
      const domReleases = await page.$$eval('table tr, [class*="release"], [class*="song"]', (rows) => {
        const out = [];
        for (const row of rows) {
          const title = row.querySelector('a[href*="/mymusic/"]')?.textContent?.trim() ?? row.querySelector('td:nth-child(2)')?.textContent?.trim();
          const href = row.querySelector('a[href*="/mymusic/"]')?.getAttribute('href');
          const state = row.querySelector('[class*="status"]')?.textContent?.trim()
            ?? row.querySelector('td:nth-last-child(1)')?.textContent?.trim();
          if (title && href) {
            const idMatch = href.match(/\\/mymusic\\/([\\w-]+)/);
            out.push({
              id: idMatch ? idMatch[1] : href,
              title,
              state: state ?? 'unknown',
              url: href.startsWith('http') ? href : 'https://distrokid.com' + href,
            });
          }
        }
        return out;
      }).catch(() => []);
      for (const r of domReleases) releases.set(r.id, r);
    }

    return { releases: Array.from(releases.values()) };
  },
};

function walkReleases(obj, sink) {
  if (!obj) return;
  if (Array.isArray(obj)) { for (const it of obj) walkReleases(it, sink); return; }
  if (typeof obj !== 'object') return;
  const r = obj;
  const id = r.id ?? r.songId ?? r.releaseId ?? r.uuid;
  const title = r.title ?? r.trackTitle ?? r.name;
  if (typeof id === 'string' && typeof title === 'string') {
    if (!sink.has(id)) {
      sink.set(id, {
        id, title,
        state: r.status ?? r.state ?? 'unknown',
        url: r.url ?? (r.slug ? \`https://distrokid.com/mymusic/\${r.slug}\` : null),
      });
    }
  }
  for (const v of Object.values(r)) walkReleases(v, sink);
}
`;
}

function distrokidReleaseCreateRecipe(): string {
  return `
import { stat } from 'fs/promises';

export default {
  name: 'music-distro-distrokid-release-create',
  description: 'Upload + distribute a release via the DistroKid UI',
  async run(ctx, args) {
    // Validate inputs.
    for (const [k, path] of [['audio', args.audio], ['art', args.art]]) {
      try {
        const s = await stat(path);
        if (!s.isFile() || s.size === 0) throw new Error(\`\${k} file missing or empty: \${path}\`);
      } catch (e) { throw new Error(\`\${k} check failed: \${e?.message ?? e}\`); }
    }

    const pages = ctx.context.pages();
    let page = pages.find(p => /distrokid\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    // DistroKid's upload wizard URL.
    ctx.log('navigating to upload wizard');
    await page.goto('https://distrokid.com/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    // DistroKid's wizard is long — multi-step. We'll fill as many fields as we can
    // and stop at the final "Confirm & Distribute" button, which the user should click
    // manually to review. This is safer than auto-submitting a paid distribution.
    //
    // If you want auto-submit, set args.autoSubmit = true in the recipe args.

    // Step: Is this a single or album?
    await clickFirst(page, [
      args.releaseType === 'album' ? 'button:has-text("Album")' : 'button:has-text("Single")',
      args.releaseType === 'album' ? 'input[value="album"]' : 'input[value="single"]',
    ], 'release type', ctx).catch(() => {});

    // Step: upload audio
    const audioInput = await page.waitForSelector('input[type="file"][accept*="audio"]', { timeout: 60000 }).catch(() => null)
      ?? await page.$('input[type="file"]');
    if (!audioInput) throw new Error('audio file input not found');
    ctx.log(\`uploading audio: \${args.audio}\`);
    await audioInput.setInputFiles(args.audio);

    // Wait for upload to complete — DistroKid shows a progress bar then enables Next.
    ctx.log('waiting for audio upload...');
    await Promise.race([
      page.waitForSelector('button:has-text("Next"):not([disabled])', { timeout: 600000 }),
      page.waitForSelector('[class*="uploaded"], [class*="complete"]', { timeout: 600000 }),
      page.waitForSelector('audio', { timeout: 600000 }),
    ]).catch(() => {});

    // Artist name
    await fillFirst(page, [
      'input[name="artistName"]', 'input[placeholder*="artist" i]',
    ], args.artist, 'artist name', ctx);

    // Track title
    await fillFirst(page, [
      'input[name="songTitle"]', 'input[name="title"]', 'input[placeholder*="song title" i]', 'input[placeholder*="track title" i]',
    ], args.title, 'track title', ctx);

    // Songwriters / producers / featuring — DistroKid separates credits screen
    // Note: DistroKid requires at least one songwriter for payouts.
    // If args.songwriter is not passed we default to args.artist.
    // Skipping auto-fill of credits here — it's safer for user to verify.

    // Explicit
    if (args.explicit) {
      await clickFirst(page, [
        'input[value="yes"][name*="explicit" i]',
        'button:has-text("Explicit")',
        '[role="switch"][aria-label*="explicit" i]',
      ], 'explicit', ctx).catch(() => {});
    }

    // AI-generated disclosure (required since 2025 for most stores)
    if (args.aiGenerated) {
      await clickFirst(page, [
        'input[value="ai"][name*="creation" i]',
        'button:has-text("AI")',
        'label:has-text("AI-generated")',
      ], 'ai-generated disclosure', ctx).catch(() => {});
    }

    // Primary genre
    if (args.genre) {
      await selectFirst(page, [
        'select[name="genre"]', 'select[aria-label*="genre" i]',
      ], args.genre, 'genre', ctx).catch(() => {});
    }

    // Language
    if (args.language) {
      await selectFirst(page, [
        'select[name="language"]', 'select[aria-label*="language" i]',
      ], args.language, 'language', ctx).catch(() => {});
    }

    // Release date
    if (args.releaseDate) {
      await fillFirst(page, [
        'input[type="date"]', 'input[name*="releaseDate" i]',
      ], args.releaseDate, 'release date', ctx).catch(() => {});
    }

    // Instrumental toggle
    if (args.instrumental) {
      await clickFirst(page, [
        'input[value="yes"][name*="instrumental" i]',
        'label:has-text("Instrumental")',
      ], 'instrumental', ctx).catch(() => {});
    }

    // Upload cover art
    ctx.log(\`uploading art: \${args.art}\`);
    const artInput = await page.$('input[type="file"][accept*="image"]');
    if (artInput) {
      await artInput.setInputFiles(args.art);
      await page.waitForTimeout(4000);
    } else {
      ctx.log('art input not found — distrokid may be on a different step');
    }

    // Move through remaining steps by clicking Next until we hit the Confirm screen.
    // We DO NOT click "Confirm & Distribute" automatically — leaving that to the user.
    for (let i = 0; i < 8; i++) {
      const next = await page.$('button:has-text("Next"):not([disabled])');
      if (next) { await next.click(); ctx.log(\`clicked Next (step \${i + 1})\`); await page.waitForTimeout(2000); }
      else break;
    }

    // Capture the final review URL + state
    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    return {
      state: 'ready-for-review',
      releaseUrl: currentUrl,
      message: 'All fields populated. Review in the open DistroKid wizard and click Confirm & Distribute manually to submit. The wizard remains open in the daemon Chrome — visit http://localhost:9222 in another Chrome tab to interact visually.',
    };
  },
};

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

async function selectFirst(page, selectors, value, label, ctx) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.selectOption({ label: value }).catch(async () => {
        await el.selectOption({ value }).catch(() => {});
      });
      ctx.log(\`selected \${label} via "\${sel}"\`);
      return true;
    }
  }
  throw new Error(\`could not find \${label} (tried: \${selectors.join(', ')})\`);
}
`;
}

function distrokidAlbumCreateRecipe(): string {
  return `
import { stat } from 'fs/promises';

// Genre name → DistroKid genre select option text.
// DistroKid's list doesn't contain every Spotify genre — map common aliases to the closest DK option.
const GENRE_ALIAS = {
  'neo soul': 'R&B/Soul',
  'neo-soul': 'R&B/Soul',
  'rnb': 'R&B/Soul',
  'r&b': 'R&B/Soul',
  'soul': 'R&B/Soul',
  'hip hop': 'Hip Hop/Rap',
  'hip-hop': 'Hip Hop/Rap',
  'rap': 'Hip Hop/Rap',
  'edm': 'Electronic',
  'house': 'Dance',
};

function mapGenre(g) {
  if (!g) return null;
  return GENRE_ALIAS[g.toLowerCase()] || g;
}

function splitName(name) {
  const parts = name.trim().split(/\\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export default {
  name: 'music-distro-distrokid-album-create',
  description: 'Upload an album (multi-track release) via the DistroKid wizard',
  async run(ctx, m) {
    // Validate every file up front.
    for (const [k, path] of [['art', m.art], ...m.tracks.map((t, i) => [\`track[\${i + 1}].audio\`, t.audio])]) {
      try {
        const s = await stat(path);
        if (!s.isFile() || s.size === 0) throw new Error(\`\${k} missing or empty: \${path}\`);
      } catch (e) { throw new Error(\`\${k} check failed: \${e?.message ?? e}\`); }
    }

    const pages = ctx.context.pages();
    let page = pages.find(p => /distrokid\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();
    await page.bringToFront();

    ctx.log(\`starting album upload: "\${m.title}" by \${m.artist} (\${m.tracks.length} tracks)\`);
    await page.goto('https://distrokid.com/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    // Confirm we reached the wizard (not the sign-in or profile-completion page)
    const url = page.url();
    if (/\\/signin/.test(url)) throw new Error('not logged in: sign in to DistroKid in the daemon Chrome at http://localhost:9222 first');
    if (/Real Quick/i.test(await page.content())) throw new Error('DistroKid requires profile completion (phone + mailing address). Visit distrokid.com and complete it first.');

    // Dismiss Osano cookie banner if present (blocks form interactions at bottom of page)
    await page.evaluate(() => {
      document.querySelectorAll('.osano-cm-save, .osano-cm-accept, .osano-cm-dialog__close').forEach(el => el.click?.());
    }).catch(() => {});
    await page.waitForTimeout(500);

    // ── 1. Release type = Album / EP / Single ────────────────────────────
    const typeLabel = m.releaseType === 'ep' ? 'EP' : (m.releaseType === 'single' ? 'Single' : 'Album');
    await clickFirst(page, [\`label:has-text("\${typeLabel}")\`], \`release type (\${typeLabel})\`, ctx);
    await page.waitForTimeout(1200);

    // ── 2. Number of songs — triggers conditional rendering of track rows ─
    const trackCount = m.tracks.length;
    await page.evaluate((n) => {
      const sel = document.querySelector('#howManySongsOnThisAlbum');
      if (!sel) throw new Error('#howManySongsOnThisAlbum not found');
      sel.value = String(n);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, trackCount);
    ctx.log(\`set track count: \${trackCount}\`);
    await page.waitForTimeout(2500);

    // ── 3. Previously released = No ──────────────────────────────────────
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('input[name^="previouslyReleased_"]')];
      const no = radios.find(r => r.value === 'no' || /no/i.test(r.closest('label')?.innerText || ''));
      no?.click();
    }).catch(() => {});
    await page.waitForTimeout(400);

    // ── 4. Artist name ────────────────────────────────────────────────────
    // DK remembers the previous artist name across sessions. When a prior
    // release used the same artist, the #artistName input is rendered as
    // type="hidden" with the value pre-populated. Skip the visible-fill step
    // in that case.
    const currentArtist = await page.evaluate(() => {
      const el = document.getElementById('artistName');
      return { value: el?.value || '', type: el?.type || '', visible: el?.offsetParent !== null };
    });
    if (currentArtist.value === m.artist && currentArtist.type === 'hidden') {
      ctx.log(\`artist already set to "\${m.artist}" (hidden) — skipping fill\`);
    } else if (currentArtist.visible) {
      const artist = page.locator('#artistName');
      await artist.fill('');
      await artist.fill(m.artist);
      await artist.blur();
      ctx.log(\`filled artist: \${m.artist}\`);
      await page.waitForTimeout(2500); // DK runs artist-match AJAX here
    } else {
      // Hidden but value doesn't match — force-set via property + fire change
      await page.evaluate((v) => {
        const el = document.getElementById('artistName');
        if (el) {
          el.value = v;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, m.artist);
      ctx.log(\`force-set hidden artist input to "\${m.artist}"\`);
      await page.waitForTimeout(1500);
    }

    // ── 5. Compound band name = No (solo act) ─────────────────────────────
    await page.locator('#js-non-compound-band-name-radio').click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);

    // ── 6. "First release" / "no existing profile" radios ─────────────────
    // DK renders different radio IDs depending on whether the artist-name search
    // returned matches. For a brand-new artist (zero matches) the visible radios
    // are the "zero-matches-new" variants. The default selection after artist blur
    // is often "Yes - Group with other releases" which requires a profile URI;
    // we click the "No - no existing profile yet" variant and retry if DK reverts
    // the selection (its jQuery handlers sometimes re-check the "Yes" option after
    // AJAX artist-search completes).
    const firstReleaseGroups = [
      { group: 'spotifyArtistID',           id: 'js-spotify-artist-id-zero-matches-new' },
      { group: 'appleArtistID',             id: 'js-apple-artist-id-zero-matches-new' },
      { group: 'googleArtistID',            id: 'js-google-artist-id-zero-matches-new' },
      { group: 'instagramProfileArtistID',  id: 'js-instagramProfile-artist-id-zero-matches-new' },
      { group: 'facebookProfileArtistID',   id: 'js-facebookProfile-artist-id-zero-matches-new' },
    ];
    for (const { group, id } of firstReleaseGroups) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const loc = page.locator('#' + id);
        if (!(await loc.isVisible().catch(() => false))) break;
        await loc.click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(800);
        const current = await page.evaluate((g) => {
          const c = [...document.querySelectorAll(\`input[name="\${g}"]\`)].find(r => r.checked);
          return c?.id;
        }, group);
        if (current === id) break;
        if (attempt === 2) ctx.log(\`WARN: \${group} stuck on \${current}, expected \${id}\`);
      }
    }
    ctx.log('locked all artist-ID groups to "no existing profile" variants');
    await page.waitForTimeout(600);

    // ── 7. Language ───────────────────────────────────────────────────────
    if (m.language) {
      await page.locator('#language').selectOption({ label: m.language })
        .catch(() => page.locator('select[name="language"]').selectOption({ label: m.language }))
        .catch((e) => ctx.log('language select failed: ' + e.message));
    }

    // ── 8. Genre + secondary genre ────────────────────────────────────────
    if (m.genre) {
      const mapped = mapGenre(m.genre);
      await page.locator('#genrePrimary').selectOption({ label: mapped })
        .catch(() => page.locator('#genrePrimary').selectOption({ label: m.genre }))
        .catch((e) => ctx.log(\`primary genre "\${mapped}" failed: \` + e.message));
      ctx.log(\`primary genre: \${mapped}\`);
    }
    if (m.secondaryGenre) {
      const mapped2 = mapGenre(m.secondaryGenre);
      await page.locator('#genreSecondary').selectOption({ label: mapped2 })
        .catch(() => page.locator('#genreSecondary').selectOption({ label: m.secondaryGenre }))
        .catch((e) => ctx.log(\`secondary genre "\${mapped2}" failed: \` + e.message));
      ctx.log(\`secondary genre: \${mapped2}\`);
    }

    // ── 9. Release date ───────────────────────────────────────────────────
    if (m.releaseDate) {
      await page.evaluate((d) => {
        const el = document.querySelector('#original-release-date-dp, input[name="originalReleaseDate"]');
        if (!el) return;
        el.value = d;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, m.releaseDate);
      ctx.log(\`release date: \${m.releaseDate}\`);
    }

    // ── 10. Album title ────────────────────────────────────────────────────
    await page.locator('#albumTitleInput, input[name="albumtitle"]').first().fill(m.title);
    ctx.log(\`album title: \${m.title}\`);

    // ── 11. Cover art ──────────────────────────────────────────────────────
    ctx.log(\`uploading cover art: \${m.art}\`);
    await page.locator('#artwork').setInputFiles(m.art);
    await page.waitForTimeout(3500);

    // ── 12. Per-track loop ─────────────────────────────────────────────────
    const { first: swFirst, last: swLast } = splitName(m.artist);
    for (let i = 0; i < m.tracks.length; i++) {
      const t = m.tracks[i];
      const n = i + 1;
      ctx.log(\`track \${n}/\${m.tracks.length}: \${t.title}\`);

      // Title (via placeholder — UUIDs in name change per-page-load)
      await page.locator(\`input[placeholder="Track \${n} title"]\`).fill(t.title);

      // Audio file upload (hidden input — Playwright handles hidden file inputs)
      await page.locator('#js-track-upload-' + n).setInputFiles(t.audio);
      ctx.log(\`  uploading \${t.audio}\`);

      // No featured artist
      await page.locator('#js-no-feat-' + n).click({ force: true }).catch(() => {});
      // No version (original track, not remix)
      await page.locator('#track-' + n + '-version-no').click({ force: true }).catch(() => {});
      // Not a cover song
      await page.locator('#not_coversong_radio_button_' + n).click({ force: true }).catch(() => {});
      // Explicit or not
      const explicitId = t.explicit ? 'js-explicit-radio-button-' : 'js-not-explicit-radio-button-';
      await page.locator('#' + explicitId + n).click({ force: true }).catch(() => {});
      // Not radio-edit ("cleaned") version
      await page.locator('#js-not-cleaned-radio-button-' + n).click({ force: true }).catch(() => {});
      // Instrumental or not — DK only surfaces "instrumental-yes" id; default state is "no" so only click if true
      if (t.instrumental) {
        await page.locator('#js-instrumental-radio-button-' + n).click({ force: true }).catch(() => {});
      }
      // Dolby Atmos = No (first dolby radio per track; skip upload)
      await page.evaluate((n) => {
        const radios = [...document.querySelectorAll(\`input[name="dolby_\${n}"]\`)];
        const no = radios.find(r => /no/i.test(r.closest('label')?.innerText || '') || r.value === 'no');
        no?.click();
      }, n).catch(() => {});

      // Songwriter real name (first + last)
      await page.locator(\`input[name="songwriter_real_name_first\${n}"]\`).fill(swFirst).catch(() => {});
      await page.locator(\`input[name="songwriter_real_name_last\${n}"]\`).fill(swLast).catch(() => {});

      // AI-generated disclosure. Flow:
      //   1. Click the "Yes" LABEL on ai_gate (clicking the hidden radio directly doesn't fire DK's jQuery handler reliably; the label does)
      //   2. DistroKid opens a SweetAlert modal ("Which parts of this song were AI-generated?")
      //   3. Inside the modal: tick distroAiMusic + distroAiLyrics (unless instrumental) + distroAiRecordingScope[value=full]
      //   4. Set distroAiArtistPersona to "Human" (value=0, default) unless t.aiPersona is true
      //   5. Click the modal's Save button (.swal2-confirm.ai-modal-btn-save) to close
      if (m.aiGenerated) {
        // Click "Yes" via the label (DK uses label clicks to drive the hidden radio)
        const clicked = await page.evaluate((n) => {
          const radio = document.querySelector(\`input.distroAiGate[track="\${n}"][value="1"]\`);
          if (!radio) return false;
          const label = radio.closest('label');
          (label || radio).click();
          return true;
        }, n);
        if (!clicked) { ctx.log(\`  ai_gate radio not found for track \${n}\`); }
        // Wait for modal
        const modal = page.locator('.swal2-popup.swal2-show');
        await modal.waitFor({ state: 'visible', timeout: 6000 }).catch(() => ctx.log(\`  AI modal did not open for track \${n}\`));
        await page.waitForTimeout(300);
        // Tick detail checkboxes within the modal
        await modal.locator('input.distroAiMusic').first().check({ force: true }).catch(() => {});
        if (!t.instrumental) {
          await modal.locator('input.distroAiLyrics').first().check({ force: true }).catch(() => {});
        }
        const scope = t.aiScope === 'partial' ? 'partial' : 'full';
        await modal.locator(\`input.distroAiRecordingScope[value="\${scope}"]\`).first().check({ force: true }).catch(() => {});
        // Artist persona — human by default, AI persona if explicitly set
        const personaVal = t.aiPersona ? '1' : '0';
        await modal.locator(\`input.distroAiArtistPersona[value="\${personaVal}"]\`).first().check({ force: true }).catch(() => {});
        // Save the modal
        await modal.locator('button.swal2-confirm.ai-modal-btn-save').click({ timeout: 5000 }).catch((e) => ctx.log(\`  ai modal save failed: \${e.message}\`));
        await page.waitForSelector('.swal2-popup.swal2-show', { state: 'hidden', timeout: 8000 }).catch(() => {});
        ctx.log(\`  ai disclosure: music\${!t.instrumental ? '+lyrics' : ''}, scope=\${scope}, persona=\${t.aiPersona ? 'AI' : 'human'}\`);
      }

      // Small pause between tracks so DOM settles (helps especially when the file upload spinner starts)
      await page.waitForTimeout(300);
    }

    // ── 13. Wait for audio uploads to settle ───────────────────────────────
    // DK's setInputFiles returns synchronously but the server-side ingest takes
    // a few seconds per track. Best signal is network-idle + a short sleep.
    ctx.log('letting audio uploads settle...');
    await page.waitForLoadState('networkidle', { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // ── 14. Store exclusions (m.excludeStores: array of store checkbox ids, e.g. ['chkapplemusic','chkitunes']) ─
    if (Array.isArray(m.excludeStores)) {
      for (const sid of m.excludeStores) {
        const el = page.locator('#' + sid);
        if (await el.isChecked().catch(() => false)) {
          await el.evaluate(el => { const lbl = el.closest('label'); (lbl || el).click(); });
          ctx.log(\`  unchecked store #\${sid}\`);
        }
      }
    }

    // ── 15. Dismiss any upgrade-modal overlay so we can reach the bottom ───
    await page.evaluate(() => {
      document.querySelectorAll('.upgrade-ultimate-dismissal, .swal2-close, button[class*="dismiss"]').forEach(b => b.click?.());
    }).catch(() => {});
    await page.waitForTimeout(500);

    // ── 16. Tick every visible .areyousure agreement checkbox ──────────────
    // DK surfaces conditional agreements (5 mandatory + extras like
    // "areyousurenonstandardscaps" when title-case is detected, plus
    // "areyousureticktokcml"/snap if those stores are opted in).
    const agreeCount = await page.evaluate(() => {
      let ticked = 0;
      [...document.querySelectorAll('input[type="checkbox"].areyousure')].forEach(c => {
        if (c.offsetParent === null) return;
        if (!c.checked) {
          const label = c.closest('label');
          (label || c).click();
          ticked++;
        }
      });
      return ticked;
    });
    ctx.log(\`ticked \${agreeCount} agreement checkboxes\`);
    await page.waitForTimeout(500);

    // ── 17. Click the final "Continue" / "Try again" submit button ─────────
    // DK's submit button is <input id="doneButton" type="button"> (NOT a <button>).
    // It calls distroSubmitNewAlbumForm and changes label to "Uploading..." then
    // advances to /new/mixea/ on success.
    if (m.autoSubmit !== false) {
      await page.locator('#doneButton').scrollIntoViewIfNeeded().catch(() => {});
      await page.locator('#doneButton').click({ force: true });
      ctx.log('clicked submit (doneButton)');
      // Wait for the Mixea page or a validation alert
      await Promise.race([
        page.waitForURL(/\\/new\\/mixea\\//, { timeout: 120000 }),
        page.waitForSelector('.swal2-popup.swal2-show', { state: 'visible', timeout: 120000 }),
      ]).catch(() => {});
      // If a validation popup appeared, bail with its message
      const alertText = await page.locator('.swal2-popup.swal2-show').innerText().catch(() => '');
      if (alertText && /error|invalid|oops|required/i.test(alertText)) {
        throw new Error(\`DK validation rejected submit: \${alertText.slice(0, 200)}\`);
      }
    }

    // ── 18. Handle the Mixea mastering upsell page ──────────────────────────
    // DK redirects to /new/mixea/ after a successful save. We pick "Use my
    // originals" (variant=0, £0) and click "Continue with my uploaded files".
    if (/\\/new\\/mixea\\//.test(page.url())) {
      ctx.log('on Mixea upsell page; picking "Use my originals" (free)');
      await page.locator('input[name="variant"][value="0"]').first().check({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      // "Continue with my uploaded files" is the button that progresses without adding charge
      const primary = page.locator('button:has-text("Continue with my uploaded files")').first();
      if (await primary.isVisible().catch(() => false)) {
        await primary.click({ force: true });
      } else {
        await page.locator('button.submit-button').first().click({ force: true });
      }
      await page.waitForURL(/\\/new\\/done\\//, { timeout: 60000 }).catch(() => {});
      ctx.log('navigated to Done page');
    }

    // ── 19. Confirm we reached the Done page ────────────────────────────────
    const finalUrl = page.url();
    const done = /\\/new\\/done\\//.test(finalUrl);
    const albumUuid = finalUrl.match(/albumuuid=([A-F0-9-]+)/i)?.[1] || null;
    return {
      state: done ? 'submitted' : 'ready-for-review',
      releaseUrl: finalUrl,
      albumUuid,
      tracksUploaded: m.tracks.length,
      hyperfollowUrl: done && m.artist ? \`https://distrokid.com/hyperfollow/\${m.artist.toLowerCase().replace(/[^a-z0-9]/g, '')}/\${m.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}\` : null,
      message: done
        ? \`Album "\${m.title}" by \${m.artist} submitted successfully. DistroKid is processing; streaming services will publish within 2-7 days.\`
        : 'Album not yet submitted. Review the wizard and click Continue manually.',
    };
  },
};

async function clickFirst(page, selectors, label, ctx) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); ctx.log(\`clicked \${label} via "\${sel}"\`); return true; }
  }
  throw new Error(\`could not find \${label} (tried: \${selectors.join(', ')})\`);
}
`;
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
    case 'release-create': return cmdReleaseCreate(args);
    case 'album-create':   return cmdAlbumCreate(args);
    case 'release-list':   return cmdReleaseList(args);
    case 'release-status': return cmdReleaseStatus(args);
    default: fail(`unknown subcommand '${sub}' — run 'music-distro help'`);
  }
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
