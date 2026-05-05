import { google, type youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface ClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  channelId?: string;
}

export function createOAuth2(cfg: ClientConfig): OAuth2Client {
  const c = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  c.setCredentials({ refresh_token: cfg.refreshToken });
  return c;
}

export function createYouTubeClient(cfg: ClientConfig): youtube_v3.Youtube {
  return google.youtube({ version: 'v3', auth: createOAuth2(cfg) });
}

export interface UploadInput {
  videoPath: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;            // default "22" (People & Blogs)
  privacyStatus?: 'public' | 'private' | 'unlisted';  // default "private"
  publishAt?: string;             // ISO timestamp for scheduled publishing — implies privacy: 'private'
  madeForKids?: boolean;
  thumbnailPath?: string;
}

export interface UploadResult {
  videoId: string;
  url: string;
  channelId?: string;
}

/**
 * Upload a video to YouTube. Automatically handles refresh-token-driven auth.
 * Returns the published video ID + URL. Does NOT block for processing — YouTube
 * finishes the transcode asynchronously.
 */
export async function uploadVideo(cfg: ClientConfig, input: UploadInput): Promise<UploadResult> {
  const yt = createYouTubeClient(cfg);

  // Validate the video file up front so we fail fast rather than half-way through upload
  const fileInfo = await stat(input.videoPath);
  if (!fileInfo.isFile() || fileInfo.size === 0) {
    throw new Error(`Video file missing or empty: ${input.videoPath}`);
  }

  const snippet: youtube_v3.Schema$VideoSnippet = {
    title: input.title,
    description: input.description ?? '',
    tags: input.tags,
    categoryId: input.categoryId ?? '22',
    channelId: cfg.channelId,
  };

  const status: youtube_v3.Schema$VideoStatus = {
    privacyStatus: input.publishAt ? 'private' : (input.privacyStatus ?? 'private'),
    madeForKids: input.madeForKids ?? false,
    selfDeclaredMadeForKids: input.madeForKids ?? false,
  };
  if (input.publishAt) {
    status.publishAt = input.publishAt;
  }

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: { snippet, status },
    media: { body: createReadStream(input.videoPath) },
  });

  const videoId = res.data.id;
  if (!videoId) {
    throw new Error('YouTube upload succeeded but no video ID returned');
  }

  // Optional thumbnail — upload separately (YouTube API requirement)
  if (input.thumbnailPath) {
    await yt.thumbnails.set({
      videoId,
      media: { body: createReadStream(input.thumbnailPath) },
    });
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    channelId: cfg.channelId,
  };
}
