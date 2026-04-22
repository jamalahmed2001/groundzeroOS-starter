// Instagram Graph API — Reels publish flow
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// Three-step flow: (1) create media container with a publicly-accessible video URL,
// (2) poll container status until FINISHED, (3) publish container.

const BASE = process.env.INSTAGRAM_GRAPH_API_BASE ?? 'https://graph.facebook.com/v19.0';

export interface ClientConfig {
  igUserId: string;      // Instagram Business/Creator account ID (IGID)
  accessToken: string;   // Long-lived Page access token
}

export interface UploadInput {
  videoUrl: string;      // Publicly-accessible URL (Instagram fetches it itself)
  caption?: string;
  coverUrl?: string;
  shareToFeed?: boolean; // Reels only — also show in main feed
  thumbOffsetMs?: number; // frame for the thumbnail
}

export interface UploadResult {
  containerId: string;
  mediaId: string;
  url: string;
  platform: 'instagram';
}

interface ContainerResponse {
  id?: string;
  error?: { message?: string; code?: number; type?: string };
}

interface StatusResponse {
  status_code?: 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';
  error?: { message?: string; code?: number };
}

function throwApi(status: number, text: string, codeOverride?: number | string): never {
  throw Object.assign(new Error(`Instagram API HTTP ${status}: ${text}`), { code: codeOverride ?? status });
}

export async function createContainer(cfg: ClientConfig, input: UploadInput): Promise<string> {
  const url = `${BASE}/${cfg.igUserId}/media`;
  const body: Record<string, string> = {
    media_type: 'REELS',
    video_url: input.videoUrl,
    access_token: cfg.accessToken,
  };
  if (input.caption)         body.caption = input.caption;
  if (input.coverUrl)        body.cover_url = input.coverUrl;
  if (input.thumbOffsetMs != null) body.thumb_offset = String(input.thumbOffsetMs);
  if (input.shareToFeed)     body.share_to_feed = 'true';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throwApi(res.status, await res.text());
  const json = (await res.json()) as ContainerResponse;
  if (json.error) throwApi(500, json.error.message ?? 'unknown', json.error.code);
  if (!json.id) throw new Error(`Instagram container create returned no ID: ${JSON.stringify(json)}`);
  return json.id;
}

export interface PollOptions {
  pollIntervalMs?: number;   // default 5000
  timeoutMs?: number;         // default 300000 (5 min)
}

export async function pollContainer(
  cfg: ClientConfig,
  containerId: string,
  opts: PollOptions = {},
): Promise<void> {
  const interval = opts.pollIntervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const url = new URL(`${BASE}/${containerId}`);
    url.searchParams.set('fields', 'status_code');
    url.searchParams.set('access_token', cfg.accessToken);
    const res = await fetch(url.toString());
    if (!res.ok) throwApi(res.status, await res.text());
    const json = (await res.json()) as StatusResponse;

    if (json.status_code === 'FINISHED') return;
    if (json.status_code === 'ERROR' || json.status_code === 'EXPIRED') {
      throw Object.assign(
        new Error(`Instagram container ${containerId} ${json.status_code}: ${json.error?.message ?? 'unknown'}`),
        { code: 'policy' },
      );
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw Object.assign(new Error(`Instagram container ${containerId} did not reach FINISHED in ${timeout}ms`), { code: 'timeout' });
}

export async function publishContainer(cfg: ClientConfig, containerId: string): Promise<string> {
  const url = `${BASE}/${cfg.igUserId}/media_publish`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: cfg.accessToken,
    }).toString(),
  });
  if (!res.ok) throwApi(res.status, await res.text());
  const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } };
  if (json.error) throwApi(500, json.error.message ?? 'unknown', json.error.code);
  if (!json.id) throw new Error(`Instagram publish returned no media ID: ${JSON.stringify(json)}`);
  return json.id;
}

/**
 * Full flow: create container → poll until FINISHED → publish.
 * Returns the published media ID + URL.
 */
export async function uploadVideo(
  cfg: ClientConfig,
  input: UploadInput,
  pollOpts?: PollOptions,
): Promise<UploadResult> {
  const containerId = await createContainer(cfg, input);
  await pollContainer(cfg, containerId, pollOpts);
  const mediaId = await publishContainer(cfg, containerId);
  return {
    containerId,
    mediaId,
    url: `https://www.instagram.com/reel/${mediaId}/`,
    platform: 'instagram',
  };
}
