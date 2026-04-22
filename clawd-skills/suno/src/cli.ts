import { mkdir, writeFile, readFile, copyFile } from 'fs/promises';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';

/**
 * Suno API skill
 *
 * Public verbs that read/write Suno via the user's browser session, using the
 * browser-automate skill's CDP attach (which points at a debuggable Chrome with
 * the user's Suno login seeded in). No third-party API keys, no proxies.
 *
 * Verbs:
 *   library   — list tracks in the user's library
 *   track     — fetch a single track's metadata by id
 *   download  — download a track's MP3 (and optional cover art) to a local path
 *   generate  — create new tracks (currently: DOM-driven via browser-automate/suno recipe)
 *
 * Planned:
 *   extend, delete, publish, unpublish — will land when their endpoints are sniffed.
 */

const BA_BIN = process.env.BROWSER_AUTOMATE_BIN
  ?? join(homedir(), 'clawd', 'skills', 'browser-automate', 'bin', 'browser-automate');

const CAPTCHA_SOLVE_BIN = process.env.CAPTCHA_SOLVE_BIN
  ?? join(homedir(), 'clawd', 'skills', 'captcha-solve', 'bin', 'captcha-solve');

// Extracted from suno.com's _next bundle (chunk 42598aa6) — the generate-path Turnstile sitekey.
// (The auth/signup flow uses 0x4AAAAAABtnpJo7aKMs9JLQ instead.)
const SUNO_TURNSTILE_SITEKEY = '0x4AAAAAABd64Cd9aq5C--VE';

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
    p.stdout.on('error', () => { /* swallow EPIPE etc. */ });
    p.on('error', (err) => settle(() => reject(err)));
    p.on('close', () => settle(() => {
      const txt = Buffer.concat(chunks).toString('utf8').trim();
      if (!txt) return reject(new Error('browser-automate produced no stdout'));
      // The last line is the JSON result (earlier lines may be status output from list/daemon).
      const lines = txt.split('\n');
      // Walk backwards until we find a parseable JSON object.
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{') && !line.startsWith('[')) continue;
        try { return resolve(JSON.parse(line) as BAResult<D>); } catch { /* try earlier */ }
      }
      // Maybe the full output is multi-line JSON.
      try { return resolve(JSON.parse(txt) as BAResult<D>); } catch { /* fall through */ }
      reject(new Error(`browser-automate returned non-JSON:\n${txt.slice(0, 500)}`));
    }));
  });
}

async function ensureDaemon(): Promise<void> {
  // daemon status/start return fields at the top level of the JSON, not in .data
  const status = await runBA<unknown>(['daemon', 'status']) as unknown as { ok: boolean; running?: boolean };
  if (!status.running) {
    process.stderr.write('[suno] browser-automate daemon not running — starting it...\n');
    const start = await runBA(['daemon', 'start']);
    if (!start.ok) fail(`failed to start daemon: ${start.error ?? 'unknown'}`);
  }
}

/**
 * Solve Suno's Turnstile captcha via the captcha-solve skill. Returns the
 * Turnstile token for use in the `token` field of POST /api/generate/v2-web/.
 * Returns null if no 2captcha account is configured (caller should fall back).
 */
async function solveSunoTurnstile(): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn(CAPTCHA_SOLVE_BIN, [
      'solve',
      '--url', 'https://suno.com/create',
      '--kind', 'turnstile',
      '--sitekey', SUNO_TURNSTILE_SITEKEY,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    p.stdout.on('data', (b) => chunks.push(b));
    p.on('close', () => {
      try {
        const out = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (out?.ok && typeof out.token === 'string') resolve(out.token);
        else resolve(null);
      } catch { resolve(null); }
    });
    p.on('error', () => resolve(null));
  });
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const HELP = `suno — Suno API layer (uses your paid Suno account via browser-automate CDP)

Subcommands:
  library
      List tracks in your library. Paginates /api/feed/v2 until has_more=false.
      Persona names auto-resolved; workspace_name filled if --workspace is passed.
      Options:
        --workspace <id>       Only tracks in this workspace (use 'default' for the catch-all)
        --limit <n>            Cap number of tracks (default 200; pass 9999 for full)
        --since <iso>          Only tracks created after this ISO date
        --public-only          Only public tracks
        --private-only         Only private tracks
        --max-scroll <n>       Scroll cycles for fallback path (default 60)
        --skip-names           Don't fetch workspaces/personas for enrichment
        --output <path>        Write JSON to file (otherwise stdout)

  workspaces
      List your 'project' workspaces with id, name, clip_count, last_updated_clip.
      Options:
        --output <path>

  create-workspace --name <string> [--description <string>] [--dry-run]
      Create a new workspace (project). Prints {id, name, ...} of the created workspace.

  delete-workspace --workspace <id> [--dry-run]
      Trash a workspace (POST /api/project/trash). Tracks inside are not deleted —
      they're moved back to default. To rename a workspace, create new + move tracks + trash old.

  rename-track --track <uuid> --title <string> [--dry-run]
      Rename a track (POST /api/gen/<id>/set_metadata/). Preserves existing lyrics,
      caption, and cover flags — only the title changes.

  personas
      List your custom personas (voices) with id + name.
      Options:
        --output <path>

  move --track <uuid> --workspace <id>
      Move one or more tracks into a workspace (internally: "project").
      Uses the same endpoint Suno's UI calls: POST /api/project/<src>/clips
      Options:
        --track <uuid>         A single clip ID to move
        --tracks <csv>         Comma-separated clip IDs for bulk move
        --workspace <id>       Target workspace (use 'default' for the catch-all)
        --from-workspace <id>  Source workspace id for the URL (defaults to 'default'; server
                               figures actual source out from clip_ids)
        --dry-run

  track --id <uuid>
      Fetch a single track's metadata.

  download --id <uuid> --output <path>
      Download a track's MP3. Use a directory path to also save cover + metadata.
      Options:
        --with-cover           Also download cover image alongside the MP3
        --with-metadata        Write a .json alongside with the full clip metadata

  groups [--by persona|workspace|project|model|gen_type|user]
      Summarise your library grouped by one of the dimensions above. Returns
      counts + totalDuration + sample track per group. Default: persona.
      Options:
        --library <path>       Use a previously-saved library JSON (skips the fetch)
        --output <path>        Write grouped JSON to file
        --min-count <n>        Hide groups with fewer than N tracks (default 1)

  generate --prompt "<lyrics>" [--style "<tags>"]
      Create new tracks. Default backend is 'auto' — tries direct API first, falls
      back to DOM-driven UI flow if Suno requires a captcha (returns 422 "Token
      validation failed"). When the DOM path detects a captcha, solve it manually
      in your Chrome window; the recipe waits up to 10 min.
      Options:
        --backend auto|api|dom       default auto
        --title <text>               Track title (Suno will generate one if empty)
        --style <tags>               Comma-separated style/genre/tempo tags
        --negative-tags <tags>       Things to avoid
        --instrumental | --vocal     Default: --vocal (task=vox)
        --count <n>                  Informational — Suno always returns 2 (default 2)
        --model <name>               chirp-fenix (default) / chirp-auk / chirp-crow / chirp-v4 / chirp-v3
        --persona <id>               Attach a voice/persona by UUID
        --persona-name <string>      Same, but resolves id from 'suno personas'
        --workspace <id>             Auto-move generated tracks into this workspace after completion
        --workspace-name <string>    Same, resolves id from 'suno workspaces'
        --cover-clip <clip-id>       Remix/cover mode — seed from an existing track
        --continue-clip <clip-id>    Extend an existing track
        --continue-at <seconds>      Continuation offset (seconds)
        --output-dir <path>          If set, downloads the MP3s to this directory
        --dry-run                    Print the request body without submitting

  duet --prompt-a "<lyrics>" --prompt-b "<lyrics>" \\
       (--persona-a <id> | --persona-a-name "<name>") \\
       (--persona-b <id> | --persona-b-name "<name>") \\
       [--style "<tags>"] [--title "<text>"]
      Sequential two-voice duet. Generates part 1 with persona A, waits for
      completion, then extends the chosen take with persona B using Suno's
      continue-clip mechanism. The part-2 takes each render the FULL assembled
      duet audio — pick your favourite.
      Options:
        --prompt-a <lyrics>          Part-1 lyrics (what persona A sings)
        --prompt-b <lyrics>          Part-2 lyrics (what persona B takes over with)
        --persona-a / --persona-a-name    Voice for part 1
        --persona-b / --persona-b-name    Voice for part 2
        --style <tags>               Shared style/genre/tempo tags
        --title <text>               Shared title (Suno will auto-name if empty)
        --model <name>               Shared model (default chirp-fenix)
        --negative-tags <tags>       Shared negative tags
        --take 1|2|auto              Which part-1 take to extend (default: auto = longer of the two)
        --continue-at <seconds>      Splice point (default: part-1 clip duration, i.e. append)
        --workspace <id>             Auto-move all four clips (seed + 2 duet takes) into this workspace
        --workspace-name <string>    Same, resolves id from 'suno workspaces'
        --output-dir <path>          Download the two duet takes as MP3s
        --no-captcha                 Don't attempt Turnstile solve on 422 (fail instead)
        --dry-run                    Print the request plan without submitting

  help
      This text.

Global behaviour:
  - Requires a running browser-automate daemon. If not running, auto-started
    (seeded from ~/.config/google-chrome/Default on first run).
  - Output on stdout is JSON on success (stderr for progress).
`;

// Write a one-shot recipe that runs an authed GET from inside the page.
// Used for the workspaces/personas/playlists lookups — small responses, no pagination.
async function writeSimpleGetRecipe(url: string): Promise<string> {
  const path = join('/tmp', `suno-get-${Date.now()}.mjs`);
  const src = `
export default {
  name: 'suno-simple-get',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();
    let bearer = null;
    page.on('request', (req) => {
      if (!bearer && /studio-api-prod\\.suno\\.com/.test(req.url())) {
        const a = req.headers()['authorization'];
        if (a && a.startsWith('Bearer ')) bearer = a;
      }
    });
    // Always navigate to /library — even if we're already on suno.com — so the SPA
    // fires its initial auth'd requests and we capture the Bearer.
    if (!/suno\\.com\\/library/.test(page.url())) {
      await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    for (let i = 0; i < 20 && !bearer; i++) {
      await page.waitForTimeout(300);
    }
    if (!bearer) throw new Error('no bearer captured after 6s — page may not be authenticated');
    const result = await page.evaluate(async ({ url, bearer }) => {
      const r = await fetch(url, { headers: { Authorization: bearer, Accept: 'application/json' } });
      if (!r.ok) return { ok: false, status: r.status, text: (await r.text()).slice(0, 300) };
      return { ok: true, body: await r.json() };
    }, { url: ${JSON.stringify(url)}, bearer });
    return result;
  },
};
`;
  await writeFile(path, src, 'utf8');
  return path;
}

async function fetchWorkspaces(): Promise<SunoWorkspace[]> {
  await ensureDaemon();
  const out: SunoWorkspace[] = [];
  for (let page = 1; page <= 10; page++) {
    const recipeFile = await writeSimpleGetRecipe(`https://studio-api-prod.suno.com/api/project/me?page=${page}&sort=max_created_at_last_updated_clip&show_trashed=false&exclude_shared=false`);
    const ba = await runBA<{ ok?: boolean; body?: { projects?: SunoWorkspace[]; num_total_results?: number; current_page?: number } }>(
      ['run', '--recipe-file', recipeFile, '--timeout-ms', '30000'],
    );
    if (!ba.ok || !ba.data?.ok) break;
    const projects = ba.data.body?.projects ?? [];
    if (projects.length === 0) break;
    out.push(...projects);
    if (out.length >= (ba.data.body?.num_total_results ?? 0)) break;
  }
  return out;
}

async function fetchPersonas(): Promise<SunoPersona[]> {
  await ensureDaemon();
  const out: SunoPersona[] = [];
  for (let page = 1; page <= 20; page++) {
    const recipeFile = await writeSimpleGetRecipe(`https://studio-api-prod.suno.com/api/persona/get-personas/?page=${page}`);
    const ba = await runBA<{ ok?: boolean; body?: { personas?: Array<{ id: string; name: string; description: string; image_s3_id?: string; is_public?: boolean; is_owned?: boolean }>; total_results?: number } }>(
      ['run', '--recipe-file', recipeFile, '--timeout-ms', '30000'],
    );
    if (!ba.ok || !ba.data?.ok) break;
    const personas = ba.data.body?.personas ?? [];
    if (personas.length === 0) break;
    for (const p of personas) {
      out.push({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_s3_id ?? null,
        is_public: p.is_public ?? false,
        is_owned: p.is_owned ?? false,
      });
    }
    if (out.length >= (ba.data.body?.total_results ?? 0)) break;
  }
  return out;
}

async function cmdWorkspaces(args: Record<string, string | boolean>): Promise<void> {
  const workspaces = await fetchWorkspaces();
  const payload = { ok: true, count: workspaces.length, workspaces };
  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, count: workspaces.length }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

async function cmdPersonas(args: Record<string, string | boolean>): Promise<void> {
  const personas = await fetchPersonas();
  const payload = { ok: true, count: personas.length, personas };
  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, count: personas.length }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

async function cmdLibrary(args: Record<string, string | boolean>): Promise<void> {
  await ensureDaemon();
  const maxScroll = Number(args['max-scroll'] ?? 60);
  const workspace = typeof args.workspace === 'string' ? args.workspace : null;
  const recipeFile = await writeLibraryRecipe(maxScroll, workspace);
  const ba = await runBA<{ currentUrl: string; count: number; tracks: SunoTrackRaw[]; source?: string; pagesFetched?: number; bearerCaptured?: boolean }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '300000'],
  );
  if (!ba.ok || !ba.data) fail(`library failed: ${ba.error ?? 'unknown'}`);

  let tracks = ba.data.tracks;

  // Enrich with workspace & persona names unless the user opts out.
  if (!args['skip-names']) {
    try {
      const [workspaces, personas] = await Promise.all([fetchWorkspaces(), fetchPersonas()]);
      const wMap = new Map(workspaces.map((w) => [w.id, w.name]));
      const pMap = new Map(personas.map((p) => [p.id, p.name]));
      // Track->workspace membership isn't in the feed payload — we'd need per-workspace walks
      // to map it. For now, enrich persona names only; workspace_name stays null unless
      // --workspace <id> was passed (then we know the whole set shares that workspace).
      for (const t of tracks) {
        if (t.persona_id && pMap.has(t.persona_id)) t.persona_name = pMap.get(t.persona_id)!;
        if (workspace) {
          t.workspace_id = workspace;
          if (wMap.has(workspace)) t.workspace_name = wMap.get(workspace)!;
        }
      }
    } catch (e) {
      process.stderr.write(`[suno] name enrichment failed (non-fatal): ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  const limit = Number(args.limit ?? 200);
  if (args.since && typeof args.since === 'string') {
    const since = new Date(args.since).toISOString();
    tracks = tracks.filter((t) => !!t.created_at && t.created_at >= since);
  }
  if (args['public-only']) tracks = tracks.filter((t) => t.is_public === true);
  if (args['private-only']) tracks = tracks.filter((t) => t.is_public === false);
  tracks = tracks.slice(0, limit);

  const payload = { ok: true, count: tracks.length, tracks, workspace: workspace ?? null };
  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, count: tracks.length, workspace: workspace ?? null }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

async function cmdTrack(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.id !== 'string') fail('--id <uuid> required');
  await ensureDaemon();
  const recipeFile = await writeLibraryRecipe(10);
  const ba = await runBA<{ tracks: SunoTrackRaw[] }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '60000'],
  );
  if (!ba.ok || !ba.data) fail(`track failed: ${ba.error ?? 'unknown'}`);
  const hit = ba.data.tracks.find((t) => t.id === args.id);
  if (!hit) fail(`track ${String(args.id)} not found in library`);
  process.stdout.write(JSON.stringify({ ok: true, track: hit }, null, 2) + '\n');
}

async function cmdDownload(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.id !== 'string') fail('--id <uuid> required');
  if (typeof args.output !== 'string') fail('--output <path> required');

  await ensureDaemon();
  const recipeFile = await writeDownloadRecipe();
  const ba = await runBA<{ mp3Path: string; coverPath?: string; metadata?: SunoTrackRaw }>(
    [
      'run',
      '--recipe-file', recipeFile,
      '--args-json', JSON.stringify({
        id: args.id,
        outputPath: args.output,
        withCover: !!args['with-cover'],
        withMetadata: !!args['with-metadata'],
      }),
      '--timeout-ms', '120000',
    ],
  );
  if (!ba.ok || !ba.data) fail(`download failed: ${ba.error ?? 'unknown'}`);
  process.stdout.write(JSON.stringify({ ok: true, ...ba.data }) + '\n');
}

async function cmdGroups(args: Record<string, string | boolean>): Promise<void> {
  const dim = (typeof args.by === 'string' ? args.by : 'persona').toLowerCase();
  const validDims = ['persona', 'workspace', 'project', 'model', 'gen_type', 'user', 'is_public'];
  if (!validDims.includes(dim)) fail(`--by must be one of: ${validDims.join(', ')}`);

  // Load tracks — either from a previously-saved library JSON or by fetching now.
  let tracks: SunoTrackRaw[];
  if (typeof args.library === 'string') {
    const raw = await readFile(args.library, 'utf8');
    const parsed = JSON.parse(raw) as { tracks?: SunoTrackRaw[] };
    if (!parsed.tracks) fail(`--library file doesn't contain a 'tracks' array`);
    tracks = parsed.tracks;
  } else {
    await ensureDaemon();
    const maxScroll = Number(args['max-scroll'] ?? 60);
    const recipeFile = await writeLibraryRecipe(maxScroll);
    const ba = await runBA<{ tracks: SunoTrackRaw[] }>(
      ['run', '--recipe-file', recipeFile, '--timeout-ms', '300000'],
    );
    if (!ba.ok || !ba.data) fail(`groups failed during library fetch: ${ba.error ?? 'unknown'}`);
    tracks = ba.data.tracks;
  }

  const keyOf = (t: SunoTrackRaw): string => {
    switch (dim) {
      case 'persona':   return t.persona_name ?? t.persona_id ?? '(no persona)';
      case 'workspace': return t.workspace_name ?? t.workspace_id ?? '(no workspace)';
      case 'project':   return t.project_id ?? '(no project)';
      case 'model':     return t.model ?? '(unknown model)';
      case 'gen_type':  return t.gen_type ?? '(unknown type)';
      case 'user':      return t.user_id ?? '(no user)';
      case 'is_public': return t.is_public === true ? 'public' : t.is_public === false ? 'private' : '(unknown)';
      default:          return '(unknown)';
    }
  };

  interface Group {
    key: string;
    count: number;
    totalDurationSeconds: number;
    firstCreated: string | null;
    lastCreated: string | null;
    sampleTitles: string[];
    trackIds: string[];
  }

  const groups = new Map<string, Group>();
  for (const t of tracks) {
    const k = keyOf(t);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, count: 0, totalDurationSeconds: 0, firstCreated: null, lastCreated: null, sampleTitles: [], trackIds: [] };
      groups.set(k, g);
    }
    g.count += 1;
    g.totalDurationSeconds += t.duration ?? 0;
    if (t.created_at) {
      if (!g.firstCreated || t.created_at < g.firstCreated) g.firstCreated = t.created_at;
      if (!g.lastCreated || t.created_at > g.lastCreated) g.lastCreated = t.created_at;
    }
    if (g.sampleTitles.length < 3 && t.title) g.sampleTitles.push(t.title);
    g.trackIds.push(t.id);
  }

  const minCount = Number(args['min-count'] ?? 1);
  const sorted = Array.from(groups.values())
    .filter((g) => g.count >= minCount)
    .sort((a, b) => b.count - a.count);

  const payload = {
    ok: true,
    groupedBy: dim,
    totalTracks: tracks.length,
    groupCount: sorted.length,
    groups: sorted,
  };

  if (typeof args.output === 'string') {
    await writeFile(args.output, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, written: args.output, groupedBy: dim, groupCount: sorted.length }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

async function cmdMove(args: Record<string, string | boolean>): Promise<void> {
  // Move one or more tracks into a target workspace.
  // Endpoint: POST /api/project/<source>/clips  body: {update_type:"move", metadata:{clip_ids:[], target_project_id}}
  // The source workspace ID doesn't seem to matter for the URL (Suno figures it out from clip_ids),
  // so we default to 'default' — the only required input is the target workspace and the track(s).
  const rawTracks = typeof args.track === 'string' ? args.track : typeof args.tracks === 'string' ? args.tracks : null;
  if (!rawTracks) fail('--track <uuid> (or --tracks <csv>) required');
  if (typeof args.workspace !== 'string') fail('--workspace <id> required (use "default" for the catch-all)');

  const clipIds = rawTracks.split(',').map((s) => s.trim()).filter(Boolean);
  if (clipIds.length === 0) fail('no clip IDs to move');
  const targetWorkspace = args.workspace;
  const sourceWorkspace = typeof args['from-workspace'] === 'string' ? args['from-workspace'] : 'default';

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      endpoint: `POST /api/project/${sourceWorkspace}/clips`,
      body: { update_type: 'move', metadata: { clip_ids: clipIds, target_project_id: targetWorkspace } },
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const url = `https://studio-api-prod.suno.com/api/project/${encodeURIComponent(sourceWorkspace)}/clips`;
  const body = JSON.stringify({ update_type: 'move', metadata: { clip_ids: clipIds, target_project_id: targetWorkspace } });
  const recipeFile = join('/tmp', `suno-move-${Date.now()}.mjs`);
  await writeFile(recipeFile, `
export default {
  name: 'suno-move',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();
    let bearer = null;
    page.on('request', (req) => {
      if (!bearer && /studio-api-prod\\.suno\\.com/.test(req.url())) {
        const a = req.headers()['authorization'];
        if (a && a.startsWith('Bearer ')) bearer = a;
      }
    });
    if (!/suno\\.com\\/library/.test(page.url())) {
      await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    for (let i = 0; i < 20 && !bearer; i++) await page.waitForTimeout(300);
    if (!bearer) throw new Error('no bearer captured');
    const result = await page.evaluate(async ({ url, bearer, body }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: bearer, 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      });
      if (!r.ok) return { ok: false, status: r.status, text: (await r.text()).slice(0, 400) };
      const text = await r.text();
      try { return { ok: true, body: JSON.parse(text) }; } catch { return { ok: true, bodyText: text.slice(0, 400) }; }
    }, { url: ${JSON.stringify(url)}, bearer, body: ${JSON.stringify(body)} });
    return result;
  },
};
`, 'utf8');
  const ba = await runBA<{ ok?: boolean; body?: unknown; status?: number; text?: string }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '30000'],
  );
  if (!ba.ok || !ba.data?.ok) {
    const d = ba.data ?? {};
    fail(`move failed: status=${d.status ?? '?'} ${d.text ?? ba.error ?? ''}`);
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'moved',
    clip_ids: clipIds,
    target_workspace: targetWorkspace,
    response: ba.data.body,
  }, null, 2) + '\n');
}

// Write a recipe that performs an authenticated write-verb fetch against studio-api-prod,
// using the same CDP+bearer pattern as cmdMove. Method: POST | PATCH | DELETE | PUT.
async function writeApiCallRecipe(
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  url: string,
  body: unknown | null,
  navPath: string = '/library',   // /create for gen submissions so the bearer has the right scope
): Promise<string> {
  const recipeFile = join('/tmp', `suno-api-${method.toLowerCase()}-${Date.now()}.mjs`);
  const bodyJson = body === null ? 'null' : JSON.stringify(JSON.stringify(body));
  const navUrl = `https://suno.com${navPath}`;
  await writeFile(recipeFile, `
export default {
  name: 'suno-api-${method.toLowerCase()}',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();
    let bearer = null;
    page.on('request', (req) => {
      if (!bearer && /studio-api-prod\\.suno\\.com/.test(req.url())) {
        const a = req.headers()['authorization'];
        if (a && a.startsWith('Bearer ')) bearer = a;
      }
    });
    const target = ${JSON.stringify(navUrl)};
    if (!page.url().startsWith(target)) {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    // Give Suno a moment to fire its internal auth/config requests — bearer issues happen there
    for (let i = 0; i < 30 && !bearer; i++) await page.waitForTimeout(300);
    if (!bearer) throw new Error('no bearer captured');
    const result = await page.evaluate(async ({ url, bearer, method, body }) => {
      const init = {
        method,
        headers: { Authorization: bearer, Accept: 'application/json' },
      };
      if (body !== null) {
        init.headers['Content-Type'] = 'application/json';
        init.body = body;
      }
      const r = await fetch(url, init);
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      return { ok: r.ok, status: r.status, body: parsed, text: parsed ? null : text.slice(0, 400) };
    }, { url: ${JSON.stringify(url)}, bearer, method: ${JSON.stringify(method)}, body: ${bodyJson} });
    return result;
  },
};
`, 'utf8');
  return recipeFile;
}

async function cmdCreateWorkspace(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.name !== 'string') fail('--name <string> required');
  const description = typeof args.description === 'string' ? args.description : '';

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      endpoint: 'POST /api/project',
      body: { name: args.name, description },
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const url = `https://studio-api-prod.suno.com/api/project`;
  const recipe = await writeApiCallRecipe('POST', url, { name: args.name, description });
  const ba = await runBA<{ ok?: boolean; status?: number; body?: unknown; text?: string }>(
    ['run', '--recipe-file', recipe, '--timeout-ms', '30000'],
  );
  if (!ba.ok || !ba.data?.ok) {
    const d = ba.data ?? {};
    fail(`create-workspace failed: status=${d.status ?? '?'} ${d.text ?? JSON.stringify(d.body ?? {}) ?? ba.error ?? ''}`);
  }
  process.stdout.write(JSON.stringify({ ok: true, action: 'created', workspace: ba.data.body }, null, 2) + '\n');
}

// Note: Suno has no discovered rename endpoint as of 2026-04-20. Workflow to "rename" is
//   1. create-workspace --name <new>
//   2. move all tracks from old to new
//   3. delete-workspace --workspace <old-id>

async function cmdRenameTrack(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.track !== 'string') fail('--track <uuid> required');
  if (typeof args.title !== 'string') fail('--title <string> required');
  const trackId = args.track;
  const newTitle = args.title;

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      endpoint: `POST /api/gen/${trackId}/set_metadata/`,
      body: { title: newTitle, '…': 'existing lyrics + caption preserved' },
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();

  // We must preserve the clip's existing lyrics/caption/cover flags — set_metadata
  // replaces the whole record. Recipe: fetch current clip, patch title, POST back.
  const recipeFile = join('/tmp', `suno-rename-${Date.now()}.mjs`);
  await writeFile(recipeFile, `
export default {
  name: 'suno-rename-track',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();
    let bearer = null;
    page.on('request', (req) => {
      if (!bearer && /studio-api-prod\\.suno\\.com/.test(req.url())) {
        const a = req.headers()['authorization'];
        if (a && a.startsWith('Bearer ')) bearer = a;
      }
    });
    if (!/suno\\.com\\/library/.test(page.url())) {
      await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    for (let i = 0; i < 20 && !bearer; i++) await page.waitForTimeout(300);
    if (!bearer) throw new Error('no bearer captured');

    const trackId = ${JSON.stringify(trackId)};
    const newTitle = ${JSON.stringify(newTitle)};

    const result = await page.evaluate(async ({ bearer, trackId, newTitle }) => {
      // 1. Read current clip so we can preserve everything except the title.
      const rGet = await fetch('https://studio-api-prod.suno.com/api/clip/' + trackId, {
        headers: { Authorization: bearer, Accept: 'application/json' },
      });
      if (!rGet.ok) return { ok: false, stage: 'get', status: rGet.status, text: (await rGet.text()).slice(0, 400) };
      const clip = await rGet.json();

      // 2. POST set_metadata with preserved fields + new title.
      const body = {
        title: newTitle,
        lyrics: clip.metadata?.prompt ?? clip.prompt ?? '',
        caption: clip.caption ?? '',
        caption_mentions: clip.caption_mentions ?? { user_mentions: [] },
        remove_image_cover: false,
        remove_video_cover: false,
      };
      const rPost = await fetch('https://studio-api-prod.suno.com/api/gen/' + trackId + '/set_metadata/', {
        method: 'POST',
        headers: { Authorization: bearer, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await rPost.text();
      if (!rPost.ok) return { ok: false, stage: 'post', status: rPost.status, text: text.slice(0, 400) };
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      return { ok: true, status: rPost.status, clip: parsed };
    }, { bearer, trackId, newTitle });
    return result;
  },
};
`, 'utf8');
  const ba = await runBA<{ ok?: boolean; status?: number; clip?: { id?: string; title?: string }; stage?: string; text?: string }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '30000'],
  );
  if (!ba.ok || !ba.data?.ok) {
    const d = ba.data ?? {};
    fail(`rename-track failed (stage=${d.stage ?? '?'}): status=${d.status ?? '?'} ${d.text ?? ba.error ?? ''}`);
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'renamed',
    track: ba.data.clip?.id ?? trackId,
    new_title: ba.data.clip?.title ?? newTitle,
  }, null, 2) + '\n');
}

async function cmdDeleteWorkspace(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.workspace !== 'string') fail('--workspace <id> required');

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      endpoint: 'POST /api/project/trash',
      body: { project_id: args.workspace },
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();
  const url = `https://studio-api-prod.suno.com/api/project/trash`;
  const recipe = await writeApiCallRecipe('POST', url, { project_id: args.workspace });
  const ba = await runBA<{ ok?: boolean; status?: number; body?: unknown; text?: string }>(
    ['run', '--recipe-file', recipe, '--timeout-ms', '30000'],
  );
  if (!ba.ok || !ba.data?.ok) {
    const d = ba.data ?? {};
    fail(`delete-workspace failed: status=${d.status ?? '?'} ${d.text ?? JSON.stringify(d.body ?? {}) ?? ba.error ?? ''}`);
  }
  process.stdout.write(JSON.stringify({ ok: true, action: 'deleted', workspace: args.workspace }, null, 2) + '\n');
}

/**
 * DOM-driven generate fallback. Drives the suno.com/create form directly.
 * Used when the direct-API path returns "Token validation failed" (Suno now pops a
 * captcha on submit — visible only after clicking Create, so the UI is the only
 * path that handles it). User manually solves any captcha that appears in their
 * Chrome; this recipe waits up to 10 min for the generate to land and clip IDs
 * to appear in /api/feed/v3.
 */
async function cmdGenerateDom(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.prompt !== 'string' && !args.instrumental) fail('--prompt required (or --instrumental with --style)');
  const title = typeof args.title === 'string' ? args.title : '';
  const style = typeof args.style === 'string' ? args.style : '';
  const instrumental = args.instrumental === true && args.vocal !== true;
  const personaName = typeof args['persona-name'] === 'string' ? args['persona-name'] : null;
  const outputDir = typeof args['output-dir'] === 'string' ? args['output-dir'] : null;

  // Resolve target workspace (same semantics as API path).
  let targetWorkspaceId: string | null = null;
  if (typeof args.workspace === 'string') targetWorkspaceId = args.workspace;
  else if (typeof args['workspace-name'] === 'string') {
    const workspaces = await fetchWorkspaces();
    const match = workspaces.find((w) => w.name === args['workspace-name']);
    if (!match) fail(`workspace-name "${args['workspace-name']}" not found`);
    targetWorkspaceId = match.id;
  }

  await ensureDaemon();

  const recipeFile = join('/tmp', `suno-gen-dom-${Date.now()}.mjs`);
  await writeFile(recipeFile, `
export default {
  name: 'suno-generate-dom',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    // Listeners — capture the generate response (gives us the clip IDs)
    const generatePayloads = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (/\\/api\\/generate\\/v2-web/.test(url) && resp.request().method() === 'POST') {
        try {
          const body = await resp.text();
          generatePayloads.push({ status: resp.status(), body });
        } catch { /* ignore */ }
      }
    });

    // Navigate fresh to /create
    await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Let the create-page widgets hydrate
    await page.waitForTimeout(5000);

    // Ensure Custom mode (default is sometimes Simple). Heuristic: look for a tab/button labelled Custom
    for (const sel of ['button:has-text("Custom")', '[role="tab"]:has-text("Custom")']) {
      const el = await page.$(sel);
      if (el) {
        const selected = await el.getAttribute('aria-selected').catch(() => null);
        if (selected !== 'true') { await el.click().catch(() => {}); ctx.log('switched to Custom mode'); }
        break;
      }
    }
    await page.waitForTimeout(1500);

    // Fill Lyrics (or main prompt field). Selectors robust across Suno redesigns.
    const prompt = ${JSON.stringify(args.prompt ?? '')};
    const style  = ${JSON.stringify(style)};
    const title  = ${JSON.stringify(title)};
    const instrumental = ${JSON.stringify(instrumental)};
    const personaName = ${JSON.stringify(personaName)};

    async function fillFirst(selectors, value, label) {
      for (const sel of selectors) {
        const el = await page.$(sel);
        if (el) {
          // Focus, select-all, type. Playwright's .fill() can dodge React-controlled listeners,
          // so we use focus + keyboard select-all + type for maximum compatibility.
          await el.focus().catch(() => {});
          await page.keyboard.press('ControlOrMeta+a').catch(() => {});
          await page.keyboard.press('Delete').catch(() => {});
          // Typing char-by-char triggers React change handlers. Short delay keeps the UI stable.
          await page.keyboard.type(value, { delay: 0 });
          ctx.log(\`filled \${label} via "\${sel}"\`);
          return true;
        }
      }
      return false;
    }

    // 1. Dismiss the OneTrust cookie banner — it has role="dialog" and confuses generic modal-close
    for (const sel of [
      '#onetrust-accept-btn-handler',
      '.onetrust-close-btn-handler',
      'button[aria-label="Close" i].onetrust-close-btn-handler',
    ]) {
      const el = await page.$(sel);
      if (el) { await el.click().catch(() => {}); ctx.log('dismissed cookie banner'); break; }
    }
    // Close any leftover aria-modal="true" dialog (stale Voices picker from a prior run)
    for (let i = 0; i < 3; i++) {
      const modal = await page.$('[aria-modal="true"]');
      if (!modal) break;
      const closeBtn = await modal.$('button[aria-label="Close" i], button[aria-label="close" i]');
      if (closeBtn) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(500); }
      else { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    }

    // 2. Instrumental toggle (if needed)
    if (instrumental) {
      for (const sel of ['button[aria-label="Instrumental" i]', '[role="switch"][aria-label*="instrumental" i]', 'button:has-text("Instrumental")']) {
        const el = await page.$(sel);
        if (el) { await el.click().catch(() => {}); ctx.log('instrumental toggled'); break; }
      }
    }

    // 3. Select Voice/persona — Suno's current UI uses a pill at the top of the Create form.
    // Voice tiles inside the modal are cursor-pointer DIVs (not buttons), so target them precisely.
    async function selectPersonaTile(name) {
      // Wait for Voices dialog to be present
      for (let i = 0; i < 20; i++) {
        const d = await page.$('[role="dialog"][aria-modal="true"]');
        if (d) break;
        await page.waitForTimeout(200);
      }
      // Handles for visible voice tiles in the modal — match on exact text within cursor-pointer wrapper
      const tile = await page.$(\`[role="dialog"][aria-modal="true"] div.cursor-pointer:has-text("\${name}")\`);
      if (tile) { await tile.click({ force: true }).catch(() => {}); ctx.log(\`voice tile clicked: \${name}\`); return true; }
      return false;
    }
    if (personaName) {
      // Open the Voices picker pill (top of form). It's in a row alongside Audio / Inspo.
      let opened = false;
      for (const sel of [
        'button:has-text("Voice"):not(:has-text("Voices")):not(:has-text("voice?"))',
        '[role="button"]:has-text("Voice")',
        'button[aria-label*="voice" i]',
        'button[data-testid*="voice" i]',
      ]) {
        const el = await page.$(sel);
        if (el) { await el.click().catch(() => {}); opened = true; ctx.log(\`opened Voices picker via "\${sel}"\`); break; }
      }
      if (opened) {
        await page.waitForTimeout(1200);
        await selectPersonaTile(personaName);
        await page.waitForTimeout(500);
        // Close modal (Escape is safest — X close button may not exist)
        const stillOpen = await page.$('[role="dialog"][aria-modal="true"]');
        if (stillOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      } else {
        ctx.log('Voices picker pill not found — will select tile lazily after Create click');
      }
    }

    // 4. Lyrics / prompt field (only if not instrumental)
    if (!instrumental && prompt) {
      await fillFirst([
        'textarea[data-testid*="lyric"]',
        'textarea[placeholder*="lyric" i]',
        'textarea[placeholder*="Enter your own lyrics" i]',
        'textarea[name*="lyric" i]',
        '[contenteditable="true"][aria-label*="lyric" i]',
        'textarea[placeholder*="description" i]',
      ], prompt, 'lyrics');
    }

    // 5. Style / tags field — Suno shows a placeholder-only textarea inside create-form-styles-wrapper.
    // The visible "powerful emotional female vocals, baby metal..." is PLACEHOLDER text (empty value),
    // not chips — so no chip-clearing needed, just fill the textarea.
    if (style) {
      await fillFirst([
        '[data-testid="create-form-styles-wrapper"] textarea',
        '[data-testid*="styles" i] textarea',
        'textarea[placeholder*="style" i]',
        'textarea[data-testid*="tag"]',
        'textarea[data-testid*="style"]',
        'input[placeholder*="style" i]',
        'textarea[name*="tag" i]',
      ], style, 'style');
    }

    // 6. Title
    if (title) {
      await fillFirst([
        'input[placeholder*="Song Title" i]',
        'input[placeholder*="Title" i]',
        'input[name*="title" i]',
      ], title, 'title');
    }

    await page.waitForTimeout(1500);

    // Click the main "Create song" button. Its aria-label is exactly "Create song" — do NOT
    // match on text "Create" because the top-right pill ("Create your own song") also says
    // "Create" and navigating it takes us to suno.com/ home.
    let sawCaptcha = false;
    const clicked = await (async () => {
      for (const sel of [
        'button[aria-label="Create song"]',
        'button[aria-label="Create Song"]',
        'form button[type="submit"]',
      ]) {
        const el = await page.$(sel);
        if (el) { await el.click().catch(() => {}); ctx.log(\`clicked Create via "\${sel}"\`); return true; }
      }
      return false;
    })();
    if (!clicked) throw new Error('could not find "Create song" button');

    // Wait loop: look for (a) generate response, (b) captcha iframe, (c) re-opened Voices modal, (d) timeout
    const deadline = Date.now() + 10 * 60 * 1000;  // 10 min
    let voicesHandled = false;
    while (Date.now() < deadline) {
      // If Suno re-opened the Voices modal after Create (no persona selected yet), click the tile
      if (!voicesHandled && personaName) {
        const voicesModal = await page.$('[role="dialog"][aria-modal="true"]');
        if (voicesModal) {
          const txt = (await voicesModal.textContent().catch(() => '')) ?? '';
          if (/Voices|My Voices|Favorites|Create Voice/i.test(txt)) {
            const tile = await page.$(\`[role="dialog"][aria-modal="true"] div.cursor-pointer:has-text("\${personaName}")\`);
            if (tile) {
              await tile.click({ force: true }).catch(() => {});
              ctx.log(\`post-Create Voices modal: clicked \${personaName} tile\`);
              await page.waitForTimeout(600);
              // Close modal and re-click Create
              await page.keyboard.press('Escape').catch(() => {});
              await page.waitForTimeout(400);
              const createAgain = await page.$('button[aria-label="Create song"], button[aria-label="Create Song"]');
              if (createAgain) { await createAgain.click().catch(() => {}); ctx.log('re-clicked Create'); }
              voicesHandled = true;
            }
          }
        }
      }
      if (generatePayloads.length > 0) {
        const last = generatePayloads[generatePayloads.length - 1];
        if (last.status === 200) {
          ctx.log('generate submitted successfully');
          try { return { ok: true, generate: JSON.parse(last.body), sawCaptcha }; }
          catch { return { ok: true, generateText: last.body.slice(0, 500), sawCaptcha }; }
        }
        // 422 or similar — check if captcha is now on page
      }
      const captcha = await page.$('iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha.com"], iframe[title*="captcha" i]');
      if (captcha && !sawCaptcha) {
        sawCaptcha = true;
        const src = await captcha.getAttribute('src').catch(() => '');
        ctx.log('CAPTCHA_DETECTED — please solve in your Chrome window on suno.com/create. Waiting up to 10 min.');
        ctx.log(\`  captcha src: \${src.slice(0, 120)}\`);
      }
      await page.waitForTimeout(2000);
    }
    return { ok: false, error: 'timeout — no generate response after 10 min', sawCaptcha };
  },
};
`, 'utf8');

  const ba = await runBA<{ ok?: boolean; sawCaptcha?: boolean; generate?: { id: string; clips: Array<{ id: string; status: string }> }; error?: string }>(
    ['run', '--recipe-file', recipeFile, '--timeout-ms', '660000'],
  );
  if (!ba.ok || !ba.data?.ok) {
    const d = ba.data ?? {};
    fail(`DOM generate failed: ${d.error ?? ba.error ?? 'unknown'}${d.sawCaptcha ? ' (captcha detected)' : ''}`);
  }
  const submission = ba.data.generate;
  if (!submission) fail('DOM generate: no generate response body captured');
  const clipIds = submission.clips.map((c) => c.id);
  process.stderr.write(`[suno generate/dom] submitted ${clipIds.length} clips (task=${submission.id}); polling…\n`);

  // From here on — reuse the API poll/download/move logic by calling cmdGenerate's tail.
  // Simplest: poll feed/v3 inline via writeApiCallRecipe.
  const pollUrl = 'https://studio-api-prod.suno.com/api/feed/v3';
  const deadline = Date.now() + 6 * 60 * 1000;
  let finalClips: Array<{ id: string; title: string; status: string; audio_url: string; duration?: number; image_url?: string }> = [];
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRecipe = await writeApiCallRecipe('POST', pollUrl, { filters: { ids: { presence: 'True', clipIds } }, limit: clipIds.length });
    const pollRes = await runBA<{ ok?: boolean; body?: { clips: typeof finalClips } }>(['run', '--recipe-file', pollRecipe, '--timeout-ms', '30000']);
    if (!pollRes.ok || !pollRes.data?.ok) continue;
    const clips = pollRes.data.body?.clips ?? [];
    process.stderr.write(`[suno generate/dom] ${clips.map(c => c.status).join(',')}\n`);
    if (clips.length === clipIds.length && clips.every((c) => c.status === 'complete' || c.status === 'error')) {
      finalClips = clips;
      break;
    }
  }
  const completed = finalClips.filter((c) => c.status === 'complete');
  const tracks: Array<{ id: string; title: string; audio_url: string; image_url?: string; duration?: number; filePath?: string; bytes?: number }> = [];
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    for (let i = 0; i < completed.length; i++) {
      const c = completed[i];
      const fname = `${String(i + 1).padStart(2, '0')}-${sanitiseFilename(c.title || c.id.slice(0, 8))}.mp3`;
      const filePath = join(outputDir, fname);
      const bytes = await downloadFile(c.audio_url, filePath);
      tracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, image_url: c.image_url, duration: c.duration, filePath, bytes });
    }
  } else {
    for (const c of completed) tracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, image_url: c.image_url, duration: c.duration });
  }

  // Post-gen move (same as API path)
  let moveResult: { moved: string[]; targetWorkspace: string } | null = null;
  if (targetWorkspaceId && targetWorkspaceId !== 'default' && completed.length > 0) {
    const moveUrl = 'https://studio-api-prod.suno.com/api/project/default/clips';
    const moveBody = { update_type: 'move', metadata: { clip_ids: completed.map((c) => c.id), target_project_id: targetWorkspaceId } };
    const moveRecipe = await writeApiCallRecipe('POST', moveUrl, moveBody);
    const mv = await runBA<{ ok?: boolean }>(['run', '--recipe-file', moveRecipe, '--timeout-ms', '30000']);
    if (mv.ok && mv.data?.ok) moveResult = { moved: completed.map((c) => c.id), targetWorkspace: targetWorkspaceId };
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    provider: 'suno-dom',
    task_id: submission.id,
    count: completed.length,
    tracks,
    move: moveResult,
    captcha_encountered: !!ba.data.sawCaptcha,
  }, null, 2) + '\n');
}

// ── submitGenerationAndWait ──────────────────────────────────────────────────
// POST /api/generate/v2-web/, transparently solve Turnstile on 422, then poll
// /api/feed/v3 until every returned clip is terminal ('complete' or 'error').
// No DOM-backend fallback here (callers that need it handle it themselves);
// this keeps the flow deterministic for the duet pipeline.

interface GeneratedClip {
  id: string;
  title: string;
  status: string;
  audio_url: string;
  image_url?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

async function submitGenerationAndWait(
  body: Record<string, unknown>,
  opts: { label?: string; noCaptcha?: boolean; timeoutMs?: number } = {},
): Promise<{ taskId: string; clips: GeneratedClip[] }> {
  const label = opts.label ?? 'generate';
  const submitUrl = 'https://studio-api-prod.suno.com/api/generate/v2-web/';

  const submitRecipe = await writeApiCallRecipe('POST', submitUrl, body, '/create');
  const submitRes = await runBA<{ ok?: boolean; status?: number; body?: { id: string; clips: Array<{ id: string; status: string }> }; text?: string }>(
    ['run', '--recipe-file', submitRecipe, '--timeout-ms', '60000'],
  );
  let submission: { id: string; clips: Array<{ id: string; status: string }> } | null =
    (submitRes.ok && submitRes.data?.ok && submitRes.data.body) ? submitRes.data.body : null;

  if (!submission) {
    const d = submitRes.data ?? {};
    const reason = d.text ?? JSON.stringify(d.body ?? {}).slice(0, 400);
    if (d.status === 422 && /Token validation failed/i.test(reason) && !opts.noCaptcha) {
      process.stderr.write(`[suno ${label}] 422 Token validation failed — solving Turnstile via captcha-solve…\n`);
      const cfToken = await solveSunoTurnstile();
      if (!cfToken) throw new Error(`${label}: captcha solve unavailable (no 2Captcha key?)`);
      process.stderr.write(`[suno ${label}] got Turnstile token (len=${cfToken.length}); re-submitting…\n`);
      const retryRecipe = await writeApiCallRecipe('POST', submitUrl, { ...body, token: cfToken }, '/create');
      const retryRes = await runBA<{ ok?: boolean; status?: number; body?: { id: string; clips: Array<{ id: string; status: string }> }; text?: string }>(
        ['run', '--recipe-file', retryRecipe, '--timeout-ms', '60000'],
      );
      if (retryRes.ok && retryRes.data?.ok && retryRes.data.body) {
        submission = retryRes.data.body;
      } else {
        const r2 = retryRes.data ?? {};
        const reason2 = r2.text ?? JSON.stringify(r2.body ?? {}).slice(0, 400);
        throw new Error(`${label} retry failed: status=${r2.status ?? '?'} ${reason2}`);
      }
    } else {
      throw new Error(`${label} failed: status=${d.status ?? '?'} ${reason}`);
    }
  }
  if (!submission) throw new Error(`${label}: no response body`);

  const clipIds = submission.clips.map(c => c.id);
  process.stderr.write(`[suno ${label}] submitted ${clipIds.length} clips (task=${submission.id}); polling for completion…\n`);

  const pollUrl = 'https://studio-api-prod.suno.com/api/feed/v3';
  const pollBody = { filters: { ids: { presence: 'True', clipIds } }, limit: clipIds.length };
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60 * 1000);
  let finalClips: GeneratedClip[] = [];
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRecipe = await writeApiCallRecipe('POST', pollUrl, pollBody);
    const pollRes = await runBA<{ ok?: boolean; status?: number; body?: { clips: GeneratedClip[] } }>(
      ['run', '--recipe-file', pollRecipe, '--timeout-ms', '30000'],
    );
    if (!pollRes.ok || !pollRes.data?.ok) continue;
    const clips = pollRes.data.body?.clips ?? [];
    const states = clips.map(c => c.status).join(',');
    process.stderr.write(`[suno ${label}] ${states}\n`);
    if (clips.length === clipIds.length && clips.every(c => c.status === 'complete' || c.status === 'error')) {
      finalClips = clips;
      break;
    }
  }
  if (finalClips.length === 0) throw new Error(`${label} polling timed out after ${((opts.timeoutMs ?? 6*60*1000)/1000).toFixed(0)}s`);
  return { taskId: submission.id, clips: finalClips };
}

// ── cmdDuet ──────────────────────────────────────────────────────────────────
// Sequential two-voice duet via Suno's continue-clip mechanism:
//   1. submit part A (persona A, prompt A)                     → 2 takes
//   2. pick one take (explicit --take or longer of the two)
//   3. submit part B with continue_clip_id = that take's id
//                        continue_at      = take duration (or --continue-at)
//      persona B, prompt B                                     → 2 duet takes
//   4. download / move on success. Downloaded B clips ARE the full assembled
//      duet — Suno bakes the original take into the continuation render.

async function cmdDuet(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args['prompt-a'] !== 'string') fail('--prompt-a required (part-1 lyrics)');
  if (typeof args['prompt-b'] !== 'string') fail('--prompt-b required (part-2 lyrics)');

  const style = typeof args.style === 'string' ? args.style : '';
  const title = typeof args.title === 'string' ? args.title : '';
  const model = typeof args.model === 'string' ? args.model : 'chirp-fenix';
  const negativeTags = typeof args['negative-tags'] === 'string' ? args['negative-tags'] : '';
  const outputDir = typeof args['output-dir'] === 'string' ? args['output-dir'] : null;
  const noCaptcha = args['no-captcha'] === true;
  const takeArg = typeof args.take === 'string' ? args.take : 'auto';
  const continueAtOverride = typeof args['continue-at'] === 'string' ? Number(args['continue-at']) : null;

  // Resolve the two personas. Require explicit distinct voices — a duet with
  // the same persona on both sides is just `generate --continue-clip`.
  const resolvePersonaArg = async (idKey: string, nameKey: string, roleLabel: string): Promise<string> => {
    if (typeof args[idKey] === 'string') return args[idKey] as string;
    if (typeof args[nameKey] === 'string') {
      const personas = await fetchPersonas();
      const match = personas.find(p => p.name === args[nameKey]);
      if (!match) fail(`${nameKey} "${args[nameKey]}" not found — run 'suno personas'`);
      return match!.id;
    }
    fail(`--${idKey} or --${nameKey} required (${roleLabel})`);
  };
  const personaAId = await resolvePersonaArg('persona-a', 'persona-a-name', 'voice for part 1');
  const personaBId = await resolvePersonaArg('persona-b', 'persona-b-name', 'voice for part 2');

  // Resolve optional destination workspace.
  let targetWorkspaceId: string | null = null;
  if (typeof args.workspace === 'string') {
    targetWorkspaceId = args.workspace;
  } else if (typeof args['workspace-name'] === 'string') {
    const workspaces = await fetchWorkspaces();
    const match = workspaces.find(w => w.name === args['workspace-name']);
    if (!match) fail(`workspace-name "${args['workspace-name']}" not found — run 'suno workspaces'`);
    targetWorkspaceId = match.id;
  }

  const buildBody = (personaId: string, prompt: string, extras: Record<string, unknown> = {}) => ({
    token: null,
    task: 'vox' as const,
    generation_type: 'TEXT',
    title,
    tags: style,
    negative_tags: negativeTags,
    mv: model,
    prompt,
    make_instrumental: false,
    user_uploaded_images_b64: null,
    metadata: {
      web_client_pathname: '/create',
      is_max_mode: false,
      is_mumble: false,
      create_mode: 'custom',
      user_tier: '3eaebef3-ef46-446a-931c-3d50cd1514f1',
      create_session_token: randomUuid(),
      disable_volume_normalization: false,
    },
    override_fields: ['prompt', 'tags'],
    cover_clip_id: null,
    cover_start_s: null,
    cover_end_s: null,
    persona_id: personaId,
    artist_clip_id: null,
    artist_start_s: null,
    artist_end_s: null,
    continue_clip_id: null,
    continued_aligned_prompt: null,
    continue_at: null,
    transaction_uuid: randomUuid(),
    ...extras,
  });

  const bodyA = buildBody(personaAId, args['prompt-a'] as string);

  if (args['dry-run']) {
    // Can't resolve the selected clip id without actually running part A, so
    // emit body A plus a templated body B with placeholders.
    const bodyBTemplate = buildBody(personaBId, args['prompt-b'] as string, {
      continue_clip_id: '{PART_A_SELECTED_CLIP_ID}',
      continue_at: continueAtOverride ?? '{PART_A_DURATION_SECONDS}',
    });
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      flow: 'submit A → poll → pick take → submit B with continue_clip_id + continue_at → poll → download',
      partA: { endpoint: 'POST /api/generate/v2-web/', persona_id: personaAId, body: bodyA },
      partB: {
        endpoint: 'POST /api/generate/v2-web/',
        persona_id: personaBId,
        take: takeArg,
        continueAt: continueAtOverride === null ? 'clip.duration' : continueAtOverride,
        body: bodyBTemplate,
      },
      wouldMoveTo: targetWorkspaceId,
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();

  // Part 1.
  process.stderr.write('[suno duet] generating part 1 (persona A)…\n');
  const resA = await submitGenerationAndWait(bodyA, { label: 'duet-A', noCaptcha });
  const completedA = resA.clips.filter(c => c.status === 'complete');
  if (completedA.length === 0) fail('part 1 returned no completed clips (both takes errored); aborting');

  // Take selection.
  let seed: GeneratedClip;
  if (takeArg === '1') seed = completedA[0];
  else if (takeArg === '2') seed = completedA[1] ?? completedA[0];
  else seed = [...completedA].sort((x, y) => (y.duration ?? 0) - (x.duration ?? 0))[0];   // auto = longest

  const continueAt = continueAtOverride !== null ? continueAtOverride : (seed.duration ?? 60);
  process.stderr.write(`[suno duet] part 1 seed take: ${seed.id.slice(0, 8)}… "${seed.title}" (${(seed.duration ?? 0).toFixed(1)}s) — continuing at ${continueAt.toFixed(2)}s\n`);

  // Part 2 (the continuation — renders the assembled duet).
  process.stderr.write('[suno duet] generating part 2 (persona B, extending part 1)…\n');
  const bodyB = buildBody(personaBId, args['prompt-b'] as string, {
    continue_clip_id: seed.id,
    continue_at: continueAt,
  });
  const resB = await submitGenerationAndWait(bodyB, { label: 'duet-B', noCaptcha });
  const completedB = resB.clips.filter(c => c.status === 'complete');
  if (completedB.length === 0) fail('part 2 returned no completed clips; the part-1 seed survives in your library');

  // Download the duet takes. Each completed part-B clip contains the FULL
  // assembled duet audio, so one of these (pick your favourite) is the track.
  const duetTracks: Array<{ id: string; title: string; audio_url: string; duration?: number; filePath?: string; bytes?: number }> = [];
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    for (let i = 0; i < completedB.length; i++) {
      const c = completedB[i];
      const fname = `duet-${String(i + 1).padStart(2, '0')}-${sanitiseFilename(c.title || c.id.slice(0, 8))}.mp3`;
      const filePath = join(outputDir, fname);
      const bytes = await downloadFile(c.audio_url, filePath);
      duetTracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, duration: c.duration, filePath, bytes });
    }
  } else {
    for (const c of completedB) duetTracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, duration: c.duration });
  }

  // Optional move — pull the seed in too so the whole duet session lives
  // in the target workspace.
  let moveResult: { moved: string[]; targetWorkspace: string } | null = null;
  if (targetWorkspaceId && targetWorkspaceId !== 'default') {
    const allIds = [seed.id, ...completedB.map(c => c.id)];
    const moveUrl = 'https://studio-api-prod.suno.com/api/project/default/clips';
    const moveBody = { update_type: 'move', metadata: { clip_ids: allIds, target_project_id: targetWorkspaceId } };
    const moveRecipe = await writeApiCallRecipe('POST', moveUrl, moveBody);
    const mv = await runBA<{ ok?: boolean; status?: number; text?: string }>(
      ['run', '--recipe-file', moveRecipe, '--timeout-ms', '30000'],
    );
    if (mv.ok && mv.data?.ok) moveResult = { moved: allIds, targetWorkspace: targetWorkspaceId };
    else process.stderr.write('[suno duet] warning: post-gen move failed — tracks remain in default.\n');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    provider: 'suno-api',
    partA: {
      task_id: resA.taskId,
      seed: { id: seed.id, duration: seed.duration ?? null, title: seed.title },
      takes: completedA.map(c => ({ id: c.id, duration: c.duration ?? null, title: c.title })),
    },
    partB: {
      task_id: resB.taskId,
      continue_at: continueAt,
      clips: duetTracks,
    },
    move: moveResult,
  }, null, 2) + '\n');
}

async function cmdGenerate(args: Record<string, string | boolean>): Promise<void> {
  // Backend selector: api (default) | dom | auto (try api, fall back to dom on 422)
  const backend = typeof args.backend === 'string' ? args.backend : 'auto';
  if (backend === 'dom') return cmdGenerateDom(args);

  if (typeof args.prompt !== 'string') fail('--prompt required');

  const outputDir = typeof args['output-dir'] === 'string' ? args['output-dir'] : null;
  const model = typeof args.model === 'string' ? args.model : 'chirp-fenix';
  const title = typeof args.title === 'string' ? args.title : '';
  const style = typeof args.style === 'string' ? args.style : '';
  const negativeTags = typeof args['negative-tags'] === 'string' ? args['negative-tags'] : '';
  // Default: vocal (task=vox). --instrumental flips to instrumental; --vocal always wins.
  const instrumental = args.instrumental === true && args.vocal !== true;
  const count = Number(args.count ?? 2);

  // Resolve persona (id or name → id). Suno's generate endpoint requires persona_id even
  // for instrumental takes, so we default to the first persona on the account if none passed.
  let personaId: string | null = null;
  if (typeof args.persona === 'string') {
    personaId = args.persona;
  } else if (typeof args['persona-name'] === 'string') {
    const personas = await fetchPersonas();
    const match = personas.find((p) => p.name === args['persona-name']);
    if (!match) fail(`persona-name "${args['persona-name']}" not found — run 'suno personas'`);
    personaId = match.id;
  } else {
    const personas = await fetchPersonas();
    if (personas.length === 0) fail('no personas on this account — create one in Suno UI first');
    personaId = personas[0].id;
    process.stderr.write(`[suno generate] no --persona passed; defaulting to "${personas[0].name}" (${personaId.slice(0, 8)}…)\n`);
  }

  // Resolve target workspace.
  let targetWorkspaceId: string | null = null;
  if (typeof args.workspace === 'string') {
    targetWorkspaceId = args.workspace;
  } else if (typeof args['workspace-name'] === 'string') {
    const workspaces = await fetchWorkspaces();
    const match = workspaces.find((w) => w.name === args['workspace-name']);
    if (!match) fail(`workspace-name "${args['workspace-name']}" not found — run 'suno workspaces'`);
    targetWorkspaceId = match.id;
  }

  // Optional extensions: remix/cover or continue-from.
  const coverClipId = typeof args['cover-clip'] === 'string' ? args['cover-clip'] : null;
  const continueClipId = typeof args['continue-clip'] === 'string' ? args['continue-clip'] : null;
  const continueAt = typeof args['continue-at'] === 'string' ? Number(args['continue-at']) : null;

  // Build request body matching the sniffed schema.
  const transactionUuid = randomUuid();
  const body = {
    token: null,
    // Suno's `task` enum covers extend/cover/infill/etc. For standard text-to-song gen
    // (both vocal and instrumental), the task stays 'vox' and make_instrumental toggles vocals off.
    task: 'vox',
    generation_type: 'TEXT',
    title,
    tags: style,
    negative_tags: negativeTags,
    mv: model,
    prompt: args.prompt,
    make_instrumental: instrumental,
    user_uploaded_images_b64: null,
    metadata: {
      web_client_pathname: '/create',
      is_max_mode: false,
      is_mumble: false,
      create_mode: 'custom',
      // user_tier + create_session_token added post-2026-04-20: Suno started rejecting
      // generate requests with 422 "Token validation failed" when these were absent.
      // Values harvested from the original sniff — user_tier is user-scoped (stable),
      // create_session_token is per-session but Suno accepts re-used UUIDs.
      user_tier: '3eaebef3-ef46-446a-931c-3d50cd1514f1',
      create_session_token: randomUuid(),
      disable_volume_normalization: false,
    },
    override_fields: ['prompt', 'tags'],
    cover_clip_id: coverClipId,
    cover_start_s: null,
    cover_end_s: null,
    persona_id: personaId,
    artist_clip_id: null,
    artist_start_s: null,
    artist_end_s: null,
    continue_clip_id: continueClipId,
    continued_aligned_prompt: null,
    continue_at: continueAt,
    transaction_uuid: transactionUuid,
  };

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      endpoint: 'POST /api/generate/v2-web/',
      body,
      wouldMoveTo: targetWorkspaceId,
    }, null, 2) + '\n');
    return;
  }

  await ensureDaemon();

  // Submit and receive initial clip IDs.
  const submitRecipe = await writeApiCallRecipe('POST', 'https://studio-api-prod.suno.com/api/generate/v2-web/', body, '/create');
  const submitRes = await runBA<{ ok?: boolean; status?: number; body?: { id: string; clips: Array<{ id: string; status: string }> }; text?: string }>(
    ['run', '--recipe-file', submitRecipe, '--timeout-ms', '60000'],
  );
  let submission: { id: string; clips: Array<{ id: string; status: string }> } | null =
    (submitRes.ok && submitRes.data?.ok && submitRes.data.body) ? submitRes.data.body : null;
  if (!submitRes.ok || !submitRes.data?.ok) {
    const d = submitRes.data ?? {};
    const reason = d.text ?? JSON.stringify(d.body ?? {}).slice(0, 400);
    // When Suno returns 422 Token validation failed, the generate body needs a
    // Cloudflare Turnstile token in its `token` field. Try to solve via
    // captcha-solve (2Captcha) and re-POST before falling back to the slower
    // DOM flow.
    if (backend !== 'dom' && d.status === 422 && /Token validation failed/i.test(reason) && args['no-captcha'] !== true) {
      process.stderr.write('[suno generate] 422 Token validation failed — solving Turnstile via captcha-solve…\n');
      const cfToken = await solveSunoTurnstile();
      if (cfToken) {
        process.stderr.write(`[suno generate] got Turnstile token (len=${cfToken.length}); re-submitting…\n`);
        const retryBody = { ...body, token: cfToken };
        const retryRecipe = await writeApiCallRecipe('POST', 'https://studio-api-prod.suno.com/api/generate/v2-web/', retryBody, '/create');
        const retryRes = await runBA<{ ok?: boolean; status?: number; body?: { id: string; clips: Array<{ id: string; status: string }> }; text?: string }>(
          ['run', '--recipe-file', retryRecipe, '--timeout-ms', '60000'],
        );
        if (retryRes.ok && retryRes.data?.ok && retryRes.data.body) {
          submission = retryRes.data.body;
        } else {
          const r2 = retryRes.data ?? {};
          const reason2 = r2.text ?? JSON.stringify(r2.body ?? {}).slice(0, 400);
          process.stderr.write(`[suno generate] retry with token failed: status=${r2.status ?? '?'} ${reason2}\n`);
          if (backend === 'auto') {
            process.stderr.write('[suno generate] falling back to DOM flow.\n');
            return cmdGenerateDom(args);
          }
          fail(`generate retry failed: status=${r2.status ?? '?'} ${reason2}`);
        }
      } else if (backend === 'auto') {
        process.stderr.write('[suno generate] captcha-solve did not return a token (missing 2Captcha key?) — falling back to DOM flow.\n');
        return cmdGenerateDom(args);
      } else {
        fail(`generate submit failed: captcha solve unavailable and backend=${backend}`);
      }
    } else if (backend === 'auto' && d.status === 422 && /Token validation failed/i.test(reason)) {
      process.stderr.write('[suno generate] --no-captcha set; falling back to DOM flow.\n');
      return cmdGenerateDom(args);
    } else {
      fail(`generate submit failed: status=${d.status ?? '?'} ${reason}`);
    }
  }
  if (!submission) fail('generate submit: no response body');
  const clipIds = submission.clips.map((c) => c.id);
  process.stderr.write(`[suno generate] submitted ${clipIds.length} clips (task=${submission.id}); polling for completion…\n`);

  // Poll /api/feed/v3 until every clip is 'complete' or 'error'.
  const pollBody = {
    filters: { ids: { presence: 'True', clipIds } },
    limit: clipIds.length,
  };
  const pollUrl = 'https://studio-api-prod.suno.com/api/feed/v3';
  const deadline = Date.now() + 6 * 60 * 1000;
  let finalClips: Array<{ id: string; title: string; status: string; audio_url: string; image_url?: string; duration?: number; metadata?: Record<string, unknown> }> = [];
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRecipe = await writeApiCallRecipe('POST', pollUrl, pollBody);
    const pollRes = await runBA<{ ok?: boolean; status?: number; body?: { clips: typeof finalClips } }>(
      ['run', '--recipe-file', pollRecipe, '--timeout-ms', '30000'],
    );
    if (!pollRes.ok || !pollRes.data?.ok) continue;
    const clips = pollRes.data.body?.clips ?? [];
    const states = clips.map((c) => c.status).join(',');
    process.stderr.write(`[suno generate] ${states}\n`);
    if (clips.length === clipIds.length && clips.every((c) => c.status === 'complete' || c.status === 'error')) {
      finalClips = clips;
      break;
    }
  }
  if (finalClips.length === 0) fail('generate polling timed out after 6 minutes');
  const completed = finalClips.filter((c) => c.status === 'complete');

  // Optionally download.
  const tracks: Array<{ id: string; title: string; audio_url: string; image_url?: string; duration?: number; filePath?: string; bytes?: number }> = [];
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    for (let i = 0; i < completed.length; i++) {
      const c = completed[i];
      const fname = `${String(i + 1).padStart(2, '0')}-${sanitiseFilename(c.title || c.id.slice(0, 8))}.mp3`;
      const filePath = join(outputDir, fname);
      const bytes = await downloadFile(c.audio_url, filePath);
      tracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, image_url: c.image_url, duration: c.duration, filePath, bytes });
    }
  } else {
    for (const c of completed) {
      tracks.push({ id: c.id, title: c.title, audio_url: c.audio_url, image_url: c.image_url, duration: c.duration });
    }
  }

  // Optional post-gen move into target workspace.
  let moveResult: { moved: string[]; targetWorkspace: string } | null = null;
  if (targetWorkspaceId && targetWorkspaceId !== 'default' && completed.length > 0) {
    const moveUrl = 'https://studio-api-prod.suno.com/api/project/default/clips';
    const moveBody = { update_type: 'move', metadata: { clip_ids: completed.map((c) => c.id), target_project_id: targetWorkspaceId } };
    const moveRecipe = await writeApiCallRecipe('POST', moveUrl, moveBody);
    const mv = await runBA<{ ok?: boolean; status?: number; text?: string }>(
      ['run', '--recipe-file', moveRecipe, '--timeout-ms', '30000'],
    );
    if (mv.ok && mv.data?.ok) {
      moveResult = { moved: completed.map((c) => c.id), targetWorkspace: targetWorkspaceId };
    } else {
      process.stderr.write(`[suno generate] warning: post-gen move failed — tracks remain in default.\n`);
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    provider: 'suno-api',
    task_id: submission.id,
    count: completed.length,
    tracks,
    move: moveResult,
    transaction_uuid: transactionUuid,
  }, null, 2) + '\n');
}

function randomUuid(): string {
  // Minimal RFC4122 v4 uuid (Node 18+ has crypto.randomUUID; use it if available).
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const hex = [...Array(16)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  hex[6] = (parseInt(hex[6], 16) & 0x0f | 0x40).toString(16).padStart(2, '0');
  hex[8] = (parseInt(hex[8], 16) & 0x3f | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`;
}

function sanitiseFilename(s: string): string {
  return s.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function downloadFile(url: string, dest: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

interface SunoTrackRaw {
  id: string;
  title: string;
  created_at: string | null;
  duration: number | null;
  tags: string | null;
  is_public: boolean | null;
  audio_url: string | null;
  image_url: string | null;
  // Grouping dimensions
  workspace_id: string | null;
  workspace_name?: string | null;      // enriched by cmdLibrary
  persona_id: string | null;
  persona_name?: string | null;        // enriched by cmdLibrary
  project_id: string | null;
  user_id: string | null;
  // Generation context
  model: string | null;
  gen_type: string | null;
  prompt: string | null;
  parent_id: string | null;
  is_liked: boolean | null;
}

interface SunoWorkspace {
  id: string;
  name: string;
  description: string;
  clip_count: number;
  last_updated_clip: string | null;
  shared: boolean;
  created_at: string | null;
}

interface SunoPersona {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_public: boolean;
  is_owned: boolean;
}

// Library recipe — paginate /api/feed/v2 using the UI's captured Bearer token.
// First we let the SPA load, which issues its own auth'd requests — we sniff the
// Bearer header off the first one. Then we run the remaining pagination inside
// the page context so cookies + bearer both work, and we can walk the entire
// library deterministically (not limited to whatever the UI renders).
async function writeLibraryRecipe(maxScroll = 60, workspaceId: string | null = null): Promise<string> {
  const path = join('/tmp', 'suno-library.mjs');
  // When workspace is specified use GET /api/project/<id>?page=N (returns {project_clips}).
  // When unscoped use GET /api/feed/v2?page=N.
  const endpoint = workspaceId
    ? `https://studio-api-prod.suno.com/api/project/${encodeURIComponent(workspaceId)}`
    : 'https://studio-api-prod.suno.com/api/feed/v2';
  const src = `
const MAX_SCROLL = ${maxScroll};
const ENDPOINT = ${JSON.stringify(endpoint)};
const IS_WORKSPACE_SCOPED = ${JSON.stringify(!!workspaceId)};

export default {
  name: 'suno-library',
  description: 'List complete library via bearer-authed /api/feed/v2 pagination',
  async run(ctx) {
    const pages = ctx.context.pages();
    let page = pages.find(p => /suno\\.com\\/(me|library|create)/.test(p.url())) ?? pages[0];
    if (!page) page = await ctx.context.newPage();

    const seen = new Map();
    let capturedAuth = null;

    // Phase 1: load /library to let the SPA make its own authed calls + capture the Bearer.
    page.on('request', (req) => {
      if (!capturedAuth && /studio-api(-prod|\\.prod)\\.suno\\.com/.test(req.url())) {
        const auth = req.headers()['authorization'];
        if (auth && auth.startsWith('Bearer ')) capturedAuth = auth;
      }
    });

    // Also capture responses in case direct-HTTP phase fails — we still get whatever the UI loaded.
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!/(suno\\.com|studio-api(-prod|\\.prod)\\.suno\\.com)/.test(url)) return;
      if (!/api\\/(feed|clips|library|me|profile|v2\\/library|project|song|persona|workspace)/i.test(url)) return;
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (!ct.includes('application/json')) return;
        const body = await resp.json().catch(() => null);
        if (body) walk(body, seen);
      } catch {}
    });

    const targetUrl = 'https://suno.com/create';
    if (page.url() === targetUrl) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(4000);

    // Phase 2: paginate /api/feed/v2 via the captured bearer. Walks the ENTIRE library.
    // Response shape: { clips: [...], num_total_results, current_page, has_more }
    let source = 'network-capture';
    let pagesFetched = 0;
    let numTotalResults = null;
    if (capturedAuth) {
      ctx.log(IS_WORKSPACE_SCOPED ? \`bearer captured — paginating project \${ENDPOINT}\` : 'bearer captured — paginating /api/feed/v2');
      const bearer = capturedAuth;
      const endpoint = ENDPOINT;

      // project endpoint is 1-indexed; feed/v2 is 0-indexed.
      const startPage = IS_WORKSPACE_SCOPED ? 1 : 0;
      const endPage = startPage + 500;
      for (let p = startPage; p < endPage; p++) {
        let result;
        // Retry transient errors (429, 502-504) with exponential backoff.
        for (let attempt = 0; attempt < 5; attempt++) {
          result = await page.evaluate(async ({ url, bearer, idx }) => {
            const u = \`\${url}?page=\${idx}\`;
            try {
              const r = await fetch(u, { headers: { Authorization: bearer, Accept: 'application/json' } });
              if (!r.ok) return { ok: false, status: r.status, text: (await r.text()).slice(0, 200) };
              return { ok: true, body: await r.json() };
            } catch (e) {
              return { ok: false, status: 0, error: String(e && e.message || e) };
            }
          }, { url: endpoint, bearer, idx: p });
          if (result.ok) break;
          const transient = result.status === 429 || (result.status >= 502 && result.status <= 504);
          if (!transient) break;
          const waitMs = 1000 * Math.pow(2, attempt);
          ctx.log(\`feed/v2 page \${p} got \${result.status}, backoff \${waitMs}ms (attempt \${attempt + 1}/5)\`);
          await page.waitForTimeout(waitMs);
        }

        if (!result.ok) {
          ctx.log(\`feed/v2 page \${p} failed after retries: HTTP \${result.status} \${result.error ?? result.text ?? ''}\`);
          break;
        }

        const before = seen.size;
        walk(result.body, seen);
        const added = seen.size - before;
        pagesFetched = p + 1;
        if (numTotalResults === null && typeof result.body.num_total_results === 'number') {
          numTotalResults = result.body.num_total_results;
        }
        ctx.log(\`feed/v2 page \${p}: +\${added} tracks (total \${seen.size}\${numTotalResults ? ' / ' + numTotalResults : ''})\`);

        if (result.body.has_more === false) break;
        if (added === 0) break;  // safety: no new records → end
      }
      source = 'direct-http';
    }

    // Phase 3: scroll fallback when bearer wasn't captured (pagination never ran).
    if (!capturedAuth) {
      let sameCount = 0;
      let prevSize = seen.size;
      for (let i = 0; i < MAX_SCROLL && sameCount < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 2000)).catch(() => {});
        await page.waitForTimeout(900);
        if (seen.size === prevSize) sameCount++; else { sameCount = 0; prevSize = seen.size; }
      }
      source = 'network-capture';
    }

    return {
      source,
      pagesFetched,
      numTotalResults,
      bearerCaptured: !!capturedAuth,
      count: seen.size,
      tracks: Array.from(seen.values()),
    };
  },
};

function walk(obj, sink) {
  if (!obj) return;
  if (Array.isArray(obj)) { for (const it of obj) walk(it, sink); return; }
  if (typeof obj !== 'object') return;
  const r = obj;
  if (typeof r.id === 'string' && (r.audio_url || r.title)) {
    if (!sink.has(r.id)) {
      const md = r.metadata || {};
      sink.set(r.id, {
        id: r.id,
        title: r.title ?? '',
        created_at: r.created_at ?? null,
        duration: md.duration ?? r.duration ?? null,
        tags: md.tags ?? r.tags ?? null,
        is_public: r.is_public ?? null,
        audio_url: r.audio_url ?? null,
        image_url: r.image_url ?? null,
        // Grouping dimensions
        workspace_id: r.workspace_id ?? r.workspace?.id ?? md.workspace_id ?? null,
        persona_id: r.persona_id ?? r.persona?.id ?? md.persona_id ?? null,
        project_id: r.project_id ?? r.project?.id ?? md.project_id ?? null,
        user_id: r.user_id ?? r.handle ?? md.user_id ?? null,
        // Generation context
        model: r.model_name ?? md.model_name ?? null,
        gen_type: r.gen_type ?? md.type ?? null,
        prompt: md.prompt ?? md.gpt_description_prompt ?? r.prompt ?? null,
        parent_id: md.concat_history?.[0]?.id ?? md.history?.[0]?.id ?? null,
        is_liked: r.is_liked ?? null,
      });
    }
  }
  for (const v of Object.values(r)) walk(v, sink);
}
`;
  await writeFile(path, src, 'utf8');
  return path;
}

async function writeDownloadRecipe(): Promise<string> {
  const path = join('/tmp', 'suno-download.mjs');
  const src = `
import { writeFile, mkdir, stat } from 'fs/promises';
import { dirname } from 'path';

export default {
  name: 'suno-download',
  description: 'Download a single track MP3 (and optional cover/metadata)',
  async run(ctx, args) {
    const { id, outputPath, withCover, withMetadata } = args;
    if (!id) throw new Error('missing id');
    if (!outputPath) throw new Error('missing outputPath');

    // If outputPath ends with .mp3, it's a file. Otherwise treat as dir.
    const isFile = outputPath.toLowerCase().endsWith('.mp3');
    const mp3Path = isFile ? outputPath : \`\${outputPath}/\${id}.mp3\`;
    await mkdir(dirname(mp3Path), { recursive: true });

    const audioUrl = \`https://cdn1.suno.ai/\${id}.mp3\`;
    ctx.log(\`downloading \${audioUrl}\`);
    const mp3Bytes = await ctx.downloadUrl(audioUrl, mp3Path);
    ctx.log(\`saved \${mp3Bytes} bytes -> \${mp3Path}\`);

    const out = { mp3Path, bytes: mp3Bytes };

    if (withCover || withMetadata) {
      // Fetch metadata via the clip endpoint.
      const pages = ctx.context.pages();
      let page = pages.find(p => /suno\\.com/.test(p.url())) ?? pages[0];
      if (!page) page = await ctx.context.newPage();

      let meta = null;
      try {
        const resp = await ctx.context.request.get(\`https://studio-api.prod.suno.com/api/clip/\${id}\`);
        if (resp.ok()) meta = await resp.json();
      } catch {}

      if (withMetadata && meta) {
        const metaPath = mp3Path.replace(/\\.mp3$/, '.json');
        await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
        out.metadataPath = metaPath;
      }
      if (withCover && meta?.image_url) {
        const coverPath = mp3Path.replace(/\\.mp3$/, '.jpg');
        const bytes = await ctx.downloadUrl(meta.image_url, coverPath);
        out.coverPath = coverPath;
        out.coverBytes = bytes;
      }
      if (meta) out.metadata = meta;
    }

    return out;
  },
};
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
    case 'library':    return cmdLibrary(args);
    case 'track':      return cmdTrack(args);
    case 'download':   return cmdDownload(args);
    case 'groups':     return cmdGroups(args);
    case 'workspaces': return cmdWorkspaces(args);
    case 'personas':   return cmdPersonas(args);
    case 'move':       return cmdMove(args);
    case 'create-workspace': return cmdCreateWorkspace(args);
    case 'delete-workspace': return cmdDeleteWorkspace(args);
    case 'rename-track':     return cmdRenameTrack(args);
    case 'generate':   return cmdGenerate(args);
    case 'duet':       return cmdDuet(args);
    default: fail(`unknown subcommand '${sub}' — run 'suno help'`);
  }
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
