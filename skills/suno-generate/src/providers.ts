import { writeFile } from 'fs/promises';

export interface GenerateRequest {
  prompt: string;
  style?: string;
  title?: string;
  durationSeconds?: number;
  instrumental?: boolean;
  modelVersion?: string;
}

export interface GeneratedTrack {
  id: string;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  style?: string;
  modelVersion?: string;
}

export interface Provider {
  name: string;
  generate(req: GenerateRequest): Promise<GeneratedTrack[]>;
}

function getEnv(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) throw new Error(`Missing env var: ${name}`);
  return v ?? '';
}

async function pollForCompletion<T>(
  fetchStatus: () => Promise<{ done: boolean; data?: T }>,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();
  while (true) {
    const res = await fetchStatus();
    if (res.done && res.data !== undefined) return res.data;
    if (Date.now() - start > timeout) throw new Error('Suno generation timed out');
    await new Promise((r) => setTimeout(r, interval));
  }
}

// ── Provider 1: Generic HTTP gateway (PiAPI / GoAPI / SunoAPI.org shape) ─────
//
// Most paid Suno gateways follow the same protocol: POST to create, GET to poll,
// returns track URLs when status === "complete". Config through env:
//   SUNO_GATEWAY_URL   e.g. https://api.piapi.ai/api/v1/task
//   SUNO_API_KEY       bearer token
//   SUNO_GATEWAY_POLL_PATH  (optional)  default: uses task id in URL path
//
// If the provider has a different request/response shape, extend this provider
// or add a new one.
export const gatewayProvider: Provider = {
  name: 'gateway',
  async generate(req) {
    const url = getEnv('SUNO_GATEWAY_URL');
    const key = getEnv('SUNO_API_KEY');

    const createResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'x-api-key': key,
      },
      body: JSON.stringify({
        model: req.modelVersion ?? 'chirp-v4',
        task_type: 'generate_music',
        input: {
          gpt_description_prompt: req.prompt,
          prompt: req.prompt,
          tags: req.style ?? '',
          title: req.title ?? '',
          make_instrumental: req.instrumental ?? true,
        },
      }),
    });

    if (!createResp.ok) {
      throw new Error(`Gateway create failed: HTTP ${createResp.status} — ${await createResp.text()}`);
    }

    const createJson = (await createResp.json()) as {
      data?: { task_id?: string; id?: string };
      task_id?: string;
      id?: string;
    };
    const taskId = createJson.data?.task_id ?? createJson.data?.id ?? createJson.task_id ?? createJson.id;
    if (!taskId) throw new Error(`No task id in gateway response: ${JSON.stringify(createJson)}`);

    const pollUrl = `${url.replace(/\/$/, '')}/${taskId}`;

    const tracks = await pollForCompletion<GeneratedTrack[]>(async () => {
      const pollResp = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${key}`, 'x-api-key': key },
      });
      if (!pollResp.ok) throw new Error(`Gateway poll failed: HTTP ${pollResp.status}`);
      const pollJson = (await pollResp.json()) as {
        data?: {
          status?: string;
          output?: {
            clips?: Record<string, { id: string; title?: string; audio_url?: string; duration?: number; tags?: string; model?: string }>;
          };
        };
        status?: string;
      };
      const status = pollJson.data?.status ?? pollJson.status ?? '';
      const terminal = ['completed', 'complete', 'success', 'succeeded'];
      if (!terminal.includes(status.toLowerCase())) {
        if (['failed', 'error'].includes(status.toLowerCase())) {
          throw new Error(`Gateway reported failure: ${JSON.stringify(pollJson)}`);
        }
        return { done: false };
      }
      const clips = pollJson.data?.output?.clips ?? {};
      const list: GeneratedTrack[] = Object.values(clips)
        .filter((c) => c.audio_url)
        .map((c) => ({
          id: c.id,
          title: c.title ?? req.title ?? '',
          audioUrl: c.audio_url!,
          durationSeconds: c.duration ?? 0,
          style: c.tags,
          modelVersion: c.model,
        }));
      return { done: true, data: list };
    });

    return tracks;
  },
};

// ── Provider 2: gcui-art/suno-api self-hosted wrapper ────────────────────────
//
// Open-source Node server you run yourself (docker or localhost). Config:
//   SUNO_SELFHOST_URL     e.g. http://localhost:3000
//   SUNO_COOKIE           your Suno web cookie (required by the wrapper)
export const selfHostedProvider: Provider = {
  name: 'selfhosted',
  async generate(req) {
    const url = getEnv('SUNO_SELFHOST_URL').replace(/\/$/, '');
    const cookie = getEnv('SUNO_COOKIE');

    const createResp = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        prompt: req.prompt,
        tags: req.style ?? '',
        title: req.title ?? '',
        make_instrumental: req.instrumental ?? true,
      }),
    });

    if (!createResp.ok) {
      throw new Error(`Selfhost create failed: HTTP ${createResp.status} — ${await createResp.text()}`);
    }

    type Clip = { id: string; title?: string; audio_url?: string; metadata?: { duration?: number; tags?: string } };
    const clips = (await createResp.json()) as Clip[];

    const tracks = await pollForCompletion<GeneratedTrack[]>(async () => {
      const ids = clips.map((c) => c.id).join(',');
      const pollResp = await fetch(`${url}/api/get?ids=${ids}`, { headers: { Cookie: cookie } });
      if (!pollResp.ok) throw new Error(`Selfhost poll failed: HTTP ${pollResp.status}`);
      const poll = (await pollResp.json()) as Clip[];
      const allReady = poll.every((c) => c.audio_url && c.audio_url.length > 0);
      if (!allReady) return { done: false };
      return {
        done: true,
        data: poll.map((c) => ({
          id: c.id,
          title: c.title ?? req.title ?? '',
          audioUrl: c.audio_url!,
          durationSeconds: c.metadata?.duration ?? 0,
          style: c.metadata?.tags,
        })),
      };
    });

    return tracks;
  },
};

// ── Provider 3: browser automation via browser-automate skill ───────────────
//
// Shells out to `~/clawd/skills/browser-automate/bin/browser-automate run suno ...`
// which drives Suno's own UI under your paid Pro subscription. No API key needed;
// a one-time `browser-automate login suno` sets up the persistent session.
//
// Tracks are already downloaded by the recipe; this provider returns them with
// file:// URLs so the cli layer knows not to re-download.
export const browserProvider: Provider = {
  name: 'browser',
  async generate(req) {
    const { spawn } = await import('child_process');
    const { mkdtemp } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    const outputDir = await mkdtemp(join(tmpdir(), 'suno-browser-'));
    const args = {
      prompt: req.prompt,
      style: req.style ?? '',
      title: req.title ?? '',
      instrumental: req.instrumental ?? true,
      count: 2,
      outputDir,
    };

    const binary = process.env.BROWSER_AUTOMATE_BIN ?? `${process.env.HOME}/clawd/skills/browser-automate/bin/browser-automate`;

    const result = await new Promise<{ ok: boolean; data?: { tracks: Array<{ id: string; title: string; audioUrl: string; filePath: string; bytes: number; durationSeconds?: number }> }; error?: string }>(
      (resolve, reject) => {
        const p = spawn(binary, ['run', 'suno', '--args-json', JSON.stringify(args)], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        const stdout: Buffer[] = [];
        p.stdout.on('data', (c: Buffer) => stdout.push(c));
        p.on('error', reject);
        p.on('close', () => {
          const out = Buffer.concat(stdout).toString('utf8').trim();
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`browser-automate returned non-JSON:\n${out}`));
          }
        });
      },
    );

    if (!result.ok || !result.data) throw new Error(result.error ?? 'browser-automate failed');

    return result.data.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      audioUrl: `file://${t.filePath}`,
      durationSeconds: t.durationSeconds ?? 0,
    }));
  },
};

export function pickProvider(): Provider {
  const name = (process.env.SUNO_PROVIDER ?? 'gateway').toLowerCase();
  switch (name) {
    case 'gateway':
      return gatewayProvider;
    case 'selfhosted':
    case 'self-hosted':
    case 'selfhost':
      return selfHostedProvider;
    case 'browser':
      return browserProvider;
    default:
      throw new Error(`Unknown SUNO_PROVIDER: ${name}. Valid: gateway, selfhosted, browser`);
  }
}

export async function downloadTrack(url: string, outputPath: string): Promise<number> {
  // file:// URLs mean the browser provider already downloaded — just copy/move.
  if (url.startsWith('file://')) {
    const { copyFile, stat } = await import('fs/promises');
    const srcPath = url.replace(/^file:\/\//, '');
    await copyFile(srcPath, outputPath);
    const s = await stat(outputPath);
    return s.size;
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(outputPath, buf);
  return buf.length;
}
