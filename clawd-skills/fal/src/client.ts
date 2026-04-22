// fal.ai REST queue client. No SDK dep — just fetch.
// Reference: https://docs.fal.ai/model-endpoints/queue (queue pattern used for video gens).

import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

const QUEUE_BASE = 'https://queue.fal.run';
const STORAGE_BASE = 'https://rest.alpha.fal.ai/storage/upload/initiate';

export interface SubmitResult {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url?: string;
}

export interface StatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | string;
  logs?: Array<{ message: string; timestamp?: string; level?: string }>;
  queue_position?: number;
  response_url?: string;
}

export interface FinalResult {
  // Model-specific payload. Common video shape:
  //   { video: { url: "https://..." }, seed?, inference_time?, ... }
  // Common image shape:
  //   { images: [{ url, width, height }], seed?, ... }
  [key: string]: unknown;
}

/** Submit a fal job and return the queue handles. Doesn't wait. */
export async function submit(key: string, modelId: string, input: Record<string, unknown>): Promise<SubmitResult> {
  const url = `${QUEUE_BASE}/${modelId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`fal submit ${res.status}: ${text.slice(0, 400)}`), { code: res.status });
  }
  let parsed: SubmitResult;
  try { parsed = JSON.parse(text); } catch { throw new Error(`fal submit non-JSON response: ${text.slice(0, 400)}`); }
  return parsed;
}

/** Poll the status URL for a submitted request. */
export async function fetchStatus(key: string, statusUrl: string): Promise<StatusResult> {
  const res = await fetch(statusUrl, {
    headers: { Authorization: `Key ${key}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`fal status ${res.status}: ${text.slice(0, 400)}`), { code: res.status });
  return JSON.parse(text);
}

/** Fetch the final response once status is COMPLETED. */
export async function fetchResult(key: string, responseUrl: string): Promise<FinalResult> {
  const res = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`fal response ${res.status}: ${text.slice(0, 400)}`), { code: res.status });
  return JSON.parse(text);
}

/** Wait for a submitted request until it reaches a terminal state or the deadline. */
export async function awaitCompletion(
  key: string,
  submitted: SubmitResult,
  opts: { timeoutMs?: number; pollIntervalMs?: number; onStatus?: (s: StatusResult) => void } = {},
): Promise<FinalResult> {
  const timeout = opts.timeoutMs ?? 20 * 60 * 1000; // 20 min default — video jobs can be long
  const interval = opts.pollIntervalMs ?? 5000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = await fetchStatus(key, submitted.status_url);
    opts.onStatus?.(status);
    if (status.status === 'COMPLETED') {
      return fetchResult(key, submitted.response_url);
    }
    if (status.status === 'ERROR') {
      throw Object.assign(new Error(`fal job failed: ${JSON.stringify(status).slice(0, 400)}`), { code: 'ERROR' });
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw Object.assign(new Error(`fal job timed out after ${Math.round(timeout / 1000)}s`), { code: 'timeout' });
}

/** Upload a local file to fal's storage via the 2-step initiate+PUT flow.
 * Step 1: POST to /storage/upload/initiate with {file_name, content_type} → get {upload_url, file_url}.
 * Step 2: PUT the binary to upload_url.
 * Step 3: Return file_url (public URL for use as fal input).
 */
export async function uploadFile(key: string, filePath: string, contentType?: string): Promise<string> {
  const st = await stat(filePath);
  if (!st.isFile() || st.size === 0) throw new Error(`file missing or empty: ${filePath}`);
  const buf = await readFile(filePath);
  const ct = contentType ?? inferContentType(filePath);
  // Step 1: initiate
  const initRes = await fetch(STORAGE_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_name: basename(filePath), content_type: ct }),
  });
  const initText = await initRes.text();
  if (!initRes.ok) throw Object.assign(new Error(`fal upload initiate ${initRes.status}: ${initText.slice(0, 400)}`), { code: initRes.status });
  let init: Record<string, string>;
  try { init = JSON.parse(initText); } catch { throw new Error(`fal upload initiate non-JSON: ${initText.slice(0, 200)}`); }
  const uploadUrl = init.upload_url;
  const fileUrl = init.file_url ?? init.url ?? init.access_url;
  if (!uploadUrl) throw new Error(`fal upload initiate: no upload_url in response: ${initText.slice(0, 300)}`);
  if (!fileUrl) throw new Error(`fal upload initiate: no file_url in response: ${initText.slice(0, 300)}`);
  // Step 2: PUT the binary
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': ct },
    body: buf,
  });
  if (!putRes.ok) {
    const putText = await putRes.text();
    throw Object.assign(new Error(`fal upload PUT ${putRes.status}: ${putText.slice(0, 400)}`), { code: putRes.status });
  }
  return fileUrl;
}

function inferContentType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav',
  };
  return (ext && map[ext]) ?? 'application/octet-stream';
}

/** Download a URL to a local file. */
export async function downloadTo(url: string, dest: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

/** Extract a playable video URL from a fal result. Different models use different keys. */
export function extractVideoUrl(result: FinalResult): string | null {
  const r = result as { video?: { url?: string }; videos?: Array<{ url?: string }>; output?: { video_url?: string; url?: string }; video_url?: string };
  return (
    r.video?.url ??
    r.videos?.[0]?.url ??
    r.output?.video_url ??
    r.output?.url ??
    r.video_url ??
    null
  );
}

/** Extract image URLs from a fal result. */
export function extractImageUrls(result: FinalResult): string[] {
  const r = result as { images?: Array<{ url?: string }>; image?: { url?: string }; output?: { image_url?: string } };
  const out: string[] = [];
  if (Array.isArray(r.images)) for (const i of r.images) if (i.url) out.push(i.url);
  if (r.image?.url) out.push(r.image.url);
  if (r.output?.image_url) out.push(r.output.image_url);
  return out;
}
