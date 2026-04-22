import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the googleapis + google-auth-library surface
const videosInsert = vi.fn();
const thumbnailsSet = vi.fn();
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })) },
    youtube: vi.fn().mockImplementation(() => ({
      videos: { insert: videosInsert },
      thumbnails: { set: thumbnailsSet },
    })),
  },
}));
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(),
}));
vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockImplementation((p: string) => `[STREAM:${p}]` as any),
}));
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ isFile: () => true, size: 1024 }),
  readFile: vi.fn(),
}));

import { uploadVideo } from '../src/client.js';

const CFG = {
  clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', channelId: 'UC123',
};

describe('youtube-publish uploadVideo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uploads video and returns videoId + URL', async () => {
    videosInsert.mockResolvedValueOnce({ data: { id: 'abc123' } });
    const res = await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T', description: 'd' });
    expect(res.videoId).toBe('abc123');
    expect(res.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(res.channelId).toBe('UC123');
    expect(videosInsert).toHaveBeenCalledTimes(1);
  });

  it('sets privacy to "private" when publishAt is provided', async () => {
    videosInsert.mockResolvedValueOnce({ data: { id: 'xyz' } });
    await uploadVideo(CFG, {
      videoPath: './v.mp4', title: 'T',
      publishAt: '2026-04-22T09:00:00Z', privacyStatus: 'public',
    });
    const call = videosInsert.mock.calls[0][0];
    expect(call.requestBody.status.privacyStatus).toBe('private');
    expect(call.requestBody.status.publishAt).toBe('2026-04-22T09:00:00Z');
  });

  it('respects privacy when publishAt is not set', async () => {
    videosInsert.mockResolvedValueOnce({ data: { id: 'a' } });
    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T', privacyStatus: 'unlisted' });
    expect(videosInsert.mock.calls[0][0].requestBody.status.privacyStatus).toBe('unlisted');
  });

  it('uploads thumbnail when provided', async () => {
    videosInsert.mockResolvedValueOnce({ data: { id: 'a' } });
    await uploadVideo(CFG, {
      videoPath: './v.mp4', title: 'T', thumbnailPath: './thumb.png',
    });
    expect(thumbnailsSet).toHaveBeenCalledWith({
      videoId: 'a',
      media: { body: '[STREAM:./thumb.png]' },
    });
  });

  it('skips thumbnail upload when not provided', async () => {
    videosInsert.mockResolvedValueOnce({ data: { id: 'a' } });
    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' });
    expect(thumbnailsSet).not.toHaveBeenCalled();
  });

  it('fails loudly when video file is empty', async () => {
    const fsp = await import('node:fs/promises');
    (fsp.stat as any).mockResolvedValueOnce({ isFile: () => true, size: 0 });
    await expect(uploadVideo(CFG, { videoPath: './empty.mp4', title: 'T' }))
      .rejects.toThrow(/missing or empty/);
    expect(videosInsert).not.toHaveBeenCalled();
  });

  it('fails when API returns no video id', async () => {
    videosInsert.mockResolvedValueOnce({ data: {} });
    await expect(uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' }))
      .rejects.toThrow(/no video ID/);
  });
});
