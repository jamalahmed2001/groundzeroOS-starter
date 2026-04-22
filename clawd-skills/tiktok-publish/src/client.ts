import { open, stat } from 'node:fs/promises';

// TikTok Content Posting API — FILE_UPLOAD flow
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
const TIKTOK_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;  // 5 MB per API spec
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

export interface ClientConfig {
  accessToken: string;  // TikTok Content Posting access token (user-scoped)
}

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

export interface UploadInput {
  videoPath: string;
  title: string;
  privacyLevel?: TikTokPrivacy;           // default SELF_ONLY (safest — stays as draft-style)
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
  chunkSize?: number;
}

export interface UploadResult {
  publishId: string;
  platform: 'tiktok';
}

function clampChunkSize(size: number, total: number): number {
  // TikTok requires 5 MB ≤ chunk ≤ 64 MB for all chunks except potentially the final one.
  // For files smaller than 5 MB we must still respect the min — use a single chunk equal to total.
  if (total <= MIN_CHUNK_SIZE) return total;
  return Math.max(MIN_CHUNK_SIZE, Math.min(size, MAX_CHUNK_SIZE));
}

export async function initUpload(
  cfg: ClientConfig,
  input: UploadInput,
  totalSize: number,
): Promise<{ publishId: string; uploadUrl: string; chunkSize: number; totalChunkCount: number }> {
  const chunkSize = clampChunkSize(input.chunkSize ?? DEFAULT_CHUNK_SIZE, totalSize);
  const totalChunkCount = Math.ceil(totalSize / chunkSize);

  const body = {
    post_info: {
      title: input.title,
      privacy_level: input.privacyLevel ?? 'SELF_ONLY',
      disable_duet: input.disableDuet ?? false,
      disable_comment: input.disableComment ?? false,
      disable_stitch: input.disableStitch ?? false,
      video_cover_timestamp_ms: input.videoCoverTimestampMs ?? 1000,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: totalSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  };

  const res = await fetch(TIKTOK_INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`TikTok init failed — HTTP ${res.status}: ${text}`), { code: res.status });
  }

  const json = (await res.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  if (json.error?.code && json.error.code !== 'ok') {
    throw Object.assign(
      new Error(`TikTok API error — ${json.error.code}: ${json.error.message ?? 'unknown'} (log_id: ${json.error.log_id ?? 'none'})`),
      { code: json.error.code },
    );
  }

  const publishId = json.data?.publish_id;
  const uploadUrl = json.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error(`TikTok init did not return publish_id / upload_url: ${JSON.stringify(json)}`);
  }

  return { publishId, uploadUrl, chunkSize, totalChunkCount };
}

export async function uploadChunks(
  videoPath: string,
  uploadUrl: string,
  totalSize: number,
  chunkSize: number,
  totalChunkCount: number,
): Promise<void> {
  const fh = await open(videoPath, 'r');
  try {
    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, totalSize - 1);
      const length = end - start + 1;
      const buf = Buffer.allocUnsafe(length);
      await fh.read(buf, 0, length, start);

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Type': 'video/mp4',
          'Content-Length': String(length),
        },
        body: buf,
      });

      if (!res.ok) {
        const text = await res.text();
        throw Object.assign(
          new Error(`TikTok chunk upload failed (chunk ${i + 1}/${totalChunkCount}) — HTTP ${res.status}: ${text}`),
          { code: res.status },
        );
      }
    }
  } finally {
    await fh.close();
  }
}

export async function fetchStatus(cfg: ClientConfig, publishId: string): Promise<Record<string, unknown>> {
  const res = await fetch(TIKTOK_STATUS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Upload a video to TikTok via the Content Posting API.
 * Returns the publish_id. TikTok processes asynchronously — the upload
 * completing does NOT mean the video is live. Poll fetchStatus() to check.
 */
export async function uploadVideo(cfg: ClientConfig, input: UploadInput): Promise<UploadResult> {
  const fileInfo = await stat(input.videoPath);
  if (!fileInfo.isFile() || fileInfo.size === 0) {
    throw new Error(`Video file missing or empty: ${input.videoPath}`);
  }

  const { publishId, uploadUrl, chunkSize, totalChunkCount } = await initUpload(cfg, input, fileInfo.size);
  await uploadChunks(input.videoPath, uploadUrl, fileInfo.size, chunkSize, totalChunkCount);
  return { publishId, platform: 'tiktok' };
}
