import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as typeof fetch;

import { uploadVideo, createContainer, pollContainer, publishContainer } from '../src/client.js';

const CFG = { igUserId: '17841000000000000', accessToken: 'PAGE_TOKEN' };

function mockJsonOk(payload: unknown): void {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload, text: async () => JSON.stringify(payload) });
}
function mockHttpErr(status: number, text: string): void {
  fetchMock.mockResolvedValueOnce({ ok: false, status, text: async () => text, json: async () => ({}) });
}

describe('instagram-publish', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('creates container → polls FINISHED → publishes → returns media id + URL', async () => {
    mockJsonOk({ id: 'container-1' });          // create
    mockJsonOk({ status_code: 'FINISHED' });    // poll
    mockJsonOk({ id: 'media-9' });              // publish

    const result = await uploadVideo(
      CFG,
      { videoUrl: 'https://cdn.example/v.mp4', caption: 'hi' },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );

    expect(result.containerId).toBe('container-1');
    expect(result.mediaId).toBe('media-9');
    expect(result.url).toBe('https://www.instagram.com/reel/media-9/');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('passes caption, cover, share-to-feed correctly in the create-container body', async () => {
    mockJsonOk({ id: 'c1' });
    mockJsonOk({ status_code: 'FINISHED' });
    mockJsonOk({ id: 'm1' });

    await uploadVideo(
      CFG,
      {
        videoUrl: 'https://cdn/v.mp4',
        caption: 'Episode 8',
        coverUrl: 'https://cdn/cover.jpg',
        shareToFeed: true,
        thumbOffsetMs: 1500,
      },
      { pollIntervalMs: 1, timeoutMs: 1000 },
    );

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get('media_type')).toBe('REELS');
    expect(body.get('video_url')).toBe('https://cdn/v.mp4');
    expect(body.get('caption')).toBe('Episode 8');
    expect(body.get('cover_url')).toBe('https://cdn/cover.jpg');
    expect(body.get('thumb_offset')).toBe('1500');
    expect(body.get('share_to_feed')).toBe('true');
    expect(body.get('access_token')).toBe('PAGE_TOKEN');
  });

  it('polls repeatedly while status is IN_PROGRESS', async () => {
    mockJsonOk({ id: 'c1' });
    mockJsonOk({ status_code: 'IN_PROGRESS' });
    mockJsonOk({ status_code: 'IN_PROGRESS' });
    mockJsonOk({ status_code: 'FINISHED' });
    mockJsonOk({ id: 'm1' });

    await uploadVideo(CFG, { videoUrl: 'u' }, { pollIntervalMs: 1, timeoutMs: 2000 });
    // 1 create + 3 poll + 1 publish = 5 fetches
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('throws policy error when status becomes ERROR', async () => {
    mockJsonOk({ id: 'c1' });
    mockJsonOk({ status_code: 'ERROR', error: { message: 'bad format' } });

    await expect(
      uploadVideo(CFG, { videoUrl: 'u' }, { pollIntervalMs: 1, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'policy' });
  });

  it('throws timeout error when poll exceeds deadline without FINISHED', async () => {
    mockJsonOk({ id: 'c1' });
    // Every poll returns IN_PROGRESS
    for (let i = 0; i < 50; i++) mockJsonOk({ status_code: 'IN_PROGRESS' });

    await expect(
      uploadVideo(CFG, { videoUrl: 'u' }, { pollIntervalMs: 1, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('classifies 401 on create as auth error', async () => {
    mockHttpErr(401, '{"error":{"message":"invalid token","code":190}}');
    await expect(createContainer(CFG, { videoUrl: 'u' })).rejects.toMatchObject({ code: 401 });
  });

  it('throws when create-container returns no id', async () => {
    mockJsonOk({});  // no id, no error
    await expect(createContainer(CFG, { videoUrl: 'u' })).rejects.toThrow(/no ID/);
  });

  it('publish surfaces Graph error.code', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: 190, message: 'invalid OAuth access token' } }),
      text: async () => '',
    });
    await expect(publishContainer(CFG, 'container-1')).rejects.toMatchObject({ code: 190 });
  });
});
