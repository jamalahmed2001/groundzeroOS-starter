#!/usr/bin/env node
// fal — fal.ai API skill. Subcommands: account, video-gen, image-gen, status, fetch, list-models.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listAccounts, loadAccount, addAccount, removeAccount, credPath, resolveKey,
} from './accounts.js';
import {
  submit, fetchStatus, fetchResult, awaitCompletion, uploadFile, downloadTo,
  extractVideoUrl, extractImageUrls,
  type SubmitResult,
} from './client.js';

function fail(msg: string, code = 1): never {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  process.exit(code);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
      out[key] = next; i++;
    }
  }
  return out;
}

const HELP = `fal — fal.ai API skill for video / image / audio generation.

Subcommands:
  account list
  account show <ref>
  account add <ref> --field FAL_KEY=...
  account remove <ref>

  video-gen --model <model-id> --prompt "<text>" [flags]
      Text-to-video. Waits for completion by default. Downloads result mp4 if --output-dir.
      Common flags:
        --image <path>|--image-url <url>   image-to-video seed (uploads local files)
        --aspect-ratio 16:9|9:16|1:1
        --duration <seconds>              model-dependent
        --resolution <WxH>                model-dependent
        --seed <int>
        --output-dir <path>               download mp4 here (filename from request_id)
        --async                           return request-id without waiting
        --timeout-ms <n>                  default 20 min
        --poll-ms <n>                     default 5000
        --input-json <path>               merge extra keys into the submit body (per-model quirks)
        --dry-run

  image-gen --model <model-id> --prompt "<text>" [flags]
      Text-to-image. Same flags but downloads images instead of videos.

  status --model <model-id> --request-id <id>
      Poll the queue status of a prior --async job.

  fetch --model <model-id> --request-id <id> [--output-dir <path>]
      Fetch the completed result (and optionally download it).

  list-models [--kind video|image|audio]
      Show the canonical model set (not exhaustive; pass any fal model id via --model).

Credentials:
  Priority: --account-ref <ref> → $FAL_KEY → ~/.credentials/fal.env → ~/.credentials/fal-<ref>.env
`;

async function cmdAccount(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === 'help' || sub === '-h') {
    process.stdout.write([
      'fal account <action>',
      '',
      '  list                          All configured fal accounts',
      '  show <ref>                    Details for one',
      '  add <ref> --field FAL_KEY=<key>',
      '  remove <ref>',
      '',
      'Credentials live at ~/.credentials/fal-<ref>.env (mode 600).',
      '',
    ].join('\n'));
    return;
  }
  if (sub === 'list') {
    const accounts = await listAccounts();
    process.stdout.write(JSON.stringify({
      ok: true,
      count: accounts.length,
      accounts: accounts.map(a => ({ ref: a.ref, has_key: !!a.fields.FAL_KEY })),
    }, null, 2) + '\n');
    return;
  }
  if (sub === 'show') {
    const ref = args[1];
    if (!ref) fail('ref required');
    try {
      const a = await loadAccount(ref);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.fields)) {
        masked[k] = /KEY|SECRET|TOKEN/.test(k) ? (v ? v.slice(0, 4) + '…' + v.slice(-4) + ` (${v.length} chars)` : '(empty)') : v;
      }
      process.stdout.write(JSON.stringify({ ok: true, ref: a.ref, path: a.path, fields: masked }, null, 2) + '\n');
    } catch (err) {
      fail(`account "${ref}" not found: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  if (sub === 'remove') {
    const ref = args[1];
    if (!ref) fail('ref required');
    await removeAccount(ref).catch(e => fail(`failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, removed: ref, path: credPath(ref) }) + '\n');
    return;
  }
  if (sub === 'add') {
    const ref = args[1];
    if (!ref) fail('ref required');
    const fields: Record<string, string> = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--field') {
        const [k, ...rest] = (args[++i] || '').split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      } else if (args[i].startsWith('--field=')) {
        const [k, ...rest] = args[i].slice('--field='.length).split('=');
        if (k && rest.length) fields[k] = rest.join('=');
      }
    }
    if (!fields.FAL_KEY) fail('--field FAL_KEY=<key> required');
    const created = await addAccount(ref, fields).catch(e => fail(`failed: ${e?.message ?? e}`));
    process.stdout.write(JSON.stringify({ ok: true, added: created.ref, path: created.path }, null, 2) + '\n');
    return;
  }
  fail(`unknown account action "${sub}"`);
}

// Canonical fal model IDs organized by kind — not exhaustive; pass any model via --model.
const MODELS: Record<'video' | 'image' | 'audio', Array<{ id: string; note: string }>> = {
  video: [
    { id: 'fal-ai/veo3/fast', note: 'Google Veo 3 (fast) — text or image to video, ~5–8s, 720p' },
    { id: 'fal-ai/veo3', note: 'Google Veo 3 (full) — highest quality text-to-video' },
    { id: 'fal-ai/kling-video/v2/master/text-to-video', note: 'Kling 2.0 text-to-video' },
    { id: 'fal-ai/kling-video/v2/master/image-to-video', note: 'Kling 2.0 image-to-video — good for cartoon bg motion' },
    { id: 'fal-ai/minimax/video-01', note: 'MiniMax Hailuo — cinematic motion' },
    { id: 'fal-ai/ltx-video', note: 'LTX Video — fast, cheap, lower fidelity' },
    { id: 'fal-ai/wan-25-preview/text-to-video', note: 'Wan 2.5 — open-source, good stylized output' },
    { id: 'fal-ai/runway-gen3/turbo/image-to-video', note: 'Runway Gen-3 Turbo (i2v)' },
    { id: 'fal-ai/pika/v1.5/pikaffects', note: 'Pika Pikaffects — stylized motion passes' },
  ],
  image: [
    { id: 'fal-ai/flux-pro/v1.1-ultra', note: 'Flux 1.1 Pro Ultra — photoreal' },
    { id: 'fal-ai/flux/dev', note: 'Flux Dev — fast, good quality' },
    { id: 'fal-ai/imagen4', note: 'Google Imagen 4' },
    { id: 'fal-ai/ideogram/v3', note: 'Ideogram v3 — good typography' },
    { id: 'fal-ai/recraft-v3', note: 'Recraft v3 — good for illustrated styles' },
  ],
  audio: [
    { id: 'fal-ai/elevenlabs/tts/multilingual-v2', note: 'ElevenLabs TTS (through fal)' },
    { id: 'fal-ai/stable-audio', note: 'Stable Audio — music/SFX' },
  ],
};

async function cmdListModels(args: Record<string, string | boolean>): Promise<void> {
  const kind = typeof args.kind === 'string' ? args.kind : null;
  const out: Array<{ kind: string; id: string; note: string }> = [];
  for (const [k, list] of Object.entries(MODELS)) {
    if (kind && k !== kind) continue;
    for (const m of list) out.push({ kind: k, ...m });
  }
  process.stdout.write(JSON.stringify({ ok: true, count: out.length, models: out }, null, 2) + '\n');
}

async function buildVideoInput(args: Record<string, string | boolean>, key: string): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  if (typeof args.prompt === 'string') input.prompt = args.prompt;
  if (typeof args['negative-prompt'] === 'string') input.negative_prompt = args['negative-prompt'];
  if (typeof args['aspect-ratio'] === 'string') input.aspect_ratio = args['aspect-ratio'];
  if (typeof args.duration === 'string') input.duration = Number(args.duration);
  if (typeof args.resolution === 'string') input.resolution = args.resolution;
  if (typeof args.seed === 'string') input.seed = Number(args.seed);

  // Image input — either upload a local file or pass a URL through.
  if (typeof args['image-url'] === 'string') input.image_url = args['image-url'];
  else if (typeof args.image === 'string') {
    const url = await uploadFile(key, args.image);
    input.image_url = url;
  }

  // Merge any caller-provided extra input JSON (per-model quirks)
  if (typeof args['input-json'] === 'string') {
    const extra = JSON.parse(await readFile(args['input-json'], 'utf8'));
    Object.assign(input, extra);
  }
  return input;
}

async function cmdVideoGen(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.model !== 'string') fail('--model <fal-model-id> required');
  if (typeof args.prompt !== 'string' && !args['image-url'] && !args.image && !args['input-json']) {
    fail('--prompt <text> required (or an image input for image-to-video)');
  }
  // Dry-run: skip key resolution + image upload; show the input we'd send.
  if (args['dry-run']) {
    const dryInput: Record<string, unknown> = {};
    if (typeof args.prompt === 'string') dryInput.prompt = args.prompt;
    if (typeof args['negative-prompt'] === 'string') dryInput.negative_prompt = args['negative-prompt'];
    if (typeof args['aspect-ratio'] === 'string') dryInput.aspect_ratio = args['aspect-ratio'];
    if (typeof args.duration === 'string') dryInput.duration = Number(args.duration);
    if (typeof args.resolution === 'string') dryInput.resolution = args.resolution;
    if (typeof args.seed === 'string') dryInput.seed = Number(args.seed);
    if (typeof args['image-url'] === 'string') dryInput.image_url = args['image-url'];
    else if (typeof args.image === 'string') dryInput.image_url = `<would upload: ${args.image}>`;
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true, model: args.model, endpoint: `POST https://queue.fal.run/${args.model}`, input: dryInput,
    }, null, 2) + '\n');
    return;
  }
  const key = await resolveKey(typeof args['account-ref'] === 'string' ? args['account-ref'] : undefined)
    .catch(e => fail(e?.message ?? String(e)));
  const input = await buildVideoInput(args, key);

  const submitted = await submit(key, args.model as string, input).catch(e => fail(e?.message ?? String(e))) as SubmitResult;
  process.stderr.write(`[fal video-gen] submitted request_id=${submitted.request_id}\n`);

  if (args.async) {
    process.stdout.write(JSON.stringify({ ok: true, action: 'submitted', model: args.model, ...submitted }, null, 2) + '\n');
    return;
  }

  const result = await awaitCompletion(key, submitted, {
    timeoutMs: typeof args['timeout-ms'] === 'string' ? Number(args['timeout-ms']) : undefined,
    pollIntervalMs: typeof args['poll-ms'] === 'string' ? Number(args['poll-ms']) : undefined,
    onStatus: (s) => process.stderr.write(`[fal video-gen] ${s.status}${s.queue_position ? ' (q=' + s.queue_position + ')' : ''}\n`),
  }).catch(e => fail(e?.message ?? String(e)));

  const videoUrl = extractVideoUrl(result);
  let filePath: string | null = null;
  if (videoUrl && typeof args['output-dir'] === 'string') {
    const outDir = args['output-dir'];
    filePath = join(outDir, `${submitted.request_id}.mp4`);
    const bytes = await downloadTo(videoUrl, filePath);
    process.stderr.write(`[fal video-gen] downloaded ${bytes} bytes → ${filePath}\n`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'completed',
    model: args.model,
    request_id: submitted.request_id,
    video_url: videoUrl,
    file_path: filePath,
    result,
  }, null, 2) + '\n');
}

async function cmdImageGen(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.model !== 'string') fail('--model <fal-model-id> required');
  if (typeof args.prompt !== 'string') fail('--prompt required');
  const key = await resolveKey(typeof args['account-ref'] === 'string' ? args['account-ref'] : undefined)
    .catch(e => fail(e?.message ?? String(e)));

  const input: Record<string, unknown> = { prompt: args.prompt };
  if (typeof args['aspect-ratio'] === 'string') input.aspect_ratio = args['aspect-ratio'];
  if (typeof args['image-size'] === 'string') input.image_size = args['image-size'];
  if (typeof args.seed === 'string') input.seed = Number(args.seed);
  if (typeof args.count === 'string') input.num_images = Number(args.count);
  if (typeof args['input-json'] === 'string') {
    Object.assign(input, JSON.parse(await readFile(args['input-json'], 'utf8')));
  }

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, model: args.model, input }, null, 2) + '\n');
    return;
  }

  const submitted = await submit(key, args.model as string, input).catch(e => fail(e?.message ?? String(e))) as SubmitResult;
  if (args.async) {
    process.stdout.write(JSON.stringify({ ok: true, action: 'submitted', model: args.model, ...submitted }, null, 2) + '\n');
    return;
  }
  const result = await awaitCompletion(key, submitted, {
    timeoutMs: typeof args['timeout-ms'] === 'string' ? Number(args['timeout-ms']) : 300000,
    pollIntervalMs: typeof args['poll-ms'] === 'string' ? Number(args['poll-ms']) : 3000,
    onStatus: (s) => process.stderr.write(`[fal image-gen] ${s.status}\n`),
  }).catch(e => fail(e?.message ?? String(e)));

  const urls = extractImageUrls(result);
  const files: string[] = [];
  if (typeof args['output-dir'] === 'string' && urls.length > 0) {
    for (let i = 0; i < urls.length; i++) {
      const ext = urls[i].split('?')[0].split('.').pop() || 'png';
      const dest = join(args['output-dir'], `${submitted.request_id}-${i + 1}.${ext}`);
      await downloadTo(urls[i], dest);
      files.push(dest);
    }
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'completed',
    model: args.model,
    request_id: submitted.request_id,
    image_urls: urls,
    file_paths: files,
    result,
  }, null, 2) + '\n');
}

async function cmdStatus(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.model !== 'string') fail('--model required');
  if (typeof args['request-id'] !== 'string') fail('--request-id required');
  const key = await resolveKey(typeof args['account-ref'] === 'string' ? args['account-ref'] : undefined)
    .catch(e => fail(e?.message ?? String(e)));
  const statusUrl = `https://queue.fal.run/${args.model}/requests/${args['request-id']}/status`;
  const status = await fetchStatus(key, statusUrl).catch(e => fail(e?.message ?? String(e)));
  process.stdout.write(JSON.stringify({ ok: true, model: args.model, request_id: args['request-id'], ...status }, null, 2) + '\n');
}

async function cmdFetch(args: Record<string, string | boolean>): Promise<void> {
  if (typeof args.model !== 'string') fail('--model required');
  if (typeof args['request-id'] !== 'string') fail('--request-id required');
  const key = await resolveKey(typeof args['account-ref'] === 'string' ? args['account-ref'] : undefined)
    .catch(e => fail(e?.message ?? String(e)));
  const responseUrl = `https://queue.fal.run/${args.model}/requests/${args['request-id']}`;
  const result = await fetchResult(key, responseUrl).catch(e => fail(e?.message ?? String(e)));
  const videoUrl = extractVideoUrl(result);
  const imageUrls = extractImageUrls(result);
  let files: string[] = [];
  if (typeof args['output-dir'] === 'string') {
    if (videoUrl) {
      const p = join(args['output-dir'], `${args['request-id']}.mp4`);
      await downloadTo(videoUrl, p); files.push(p);
    }
    for (let i = 0; i < imageUrls.length; i++) {
      const ext = imageUrls[i].split('?')[0].split('.').pop() || 'png';
      const p = join(args['output-dir'], `${args['request-id']}-${i + 1}.${ext}`);
      await downloadTo(imageUrls[i], p); files.push(p);
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, model: args.model, request_id: args['request-id'], video_url: videoUrl, image_urls: imageUrls, file_paths: files, result }, null, 2) + '\n');
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
    case 'account':     return cmdAccount(argv.slice(1));
    case 'video-gen':   return cmdVideoGen(args);
    case 'image-gen':   return cmdImageGen(args);
    case 'status':      return cmdStatus(args);
    case 'fetch':       return cmdFetch(args);
    case 'list-models': return cmdListModels(args);
    default: fail(`unknown subcommand "${sub}" — run 'fal help'`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
