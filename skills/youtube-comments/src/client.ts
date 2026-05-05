import { google, type youtube_v3 } from 'googleapis';

export interface ReadConfig {
  /** YouTube Data API v3 API key — read-only operations. */
  apiKey: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  /** Parent comment ID — undefined for top-level threads. */
  parentId?: string;
  likeCount: number;
}

function readClient(cfg: ReadConfig): youtube_v3.Youtube {
  return google.youtube({ version: 'v3', auth: cfg.apiKey });
}

function oauthClient(cfg: OAuthConfig): youtube_v3.Youtube {
  const auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  auth.setCredentials({ refresh_token: cfg.refreshToken });
  return google.youtube({ version: 'v3', auth });
}

/**
 * Fetches top-level comment threads for a video.
 * Optionally filters by `sinceIso` — returns only comments more recent.
 * `max` caps the total count (pages until reached or exhausted).
 */
export async function fetchComments(
  cfg: ReadConfig,
  opts: { videoId: string; max?: number; sinceIso?: string },
): Promise<Comment[]> {
  const yt = readClient(cfg);
  const since = opts.sinceIso ? Date.parse(opts.sinceIso) : 0;
  const max = opts.max ?? 100;
  const out: Comment[] = [];
  let pageToken: string | undefined;

  while (out.length < max) {
    const resp = await yt.commentThreads.list({
      part: ['snippet'],
      videoId: opts.videoId,
      maxResults: Math.min(100, max - out.length),
      pageToken,
      textFormat: 'plainText',
    });

    for (const thread of resp.data.items ?? []) {
      const snip = thread.snippet?.topLevelComment?.snippet;
      if (!snip) continue;
      const published = snip.publishedAt ?? '';
      if (since && Date.parse(published) < since) continue;
      out.push({
        id: thread.snippet?.topLevelComment?.id ?? thread.id ?? '',
        author: snip.authorDisplayName ?? '',
        text: snip.textOriginal ?? snip.textDisplay ?? '',
        timestamp: published,
        likeCount: snip.likeCount ?? 0,
      });
      if (out.length >= max) break;
    }

    pageToken = resp.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return out;
}

/**
 * Posts a reply to a specific comment.
 * Requires OAuth2 creds with the `youtube.force-ssl` scope.
 */
export async function postReply(
  cfg: OAuthConfig,
  opts: { commentId: string; text: string },
): Promise<{ id: string; text: string }> {
  const yt = oauthClient(cfg);
  const resp = await yt.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId: opts.commentId,
        textOriginal: opts.text,
      },
    },
  });
  const id = resp.data.id;
  if (!id) throw new Error('YouTube comments.insert returned no ID');
  return { id, text: resp.data.snippet?.textOriginal ?? opts.text };
}
