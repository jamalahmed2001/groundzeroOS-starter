import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  open: vi.fn(),
  stat: vi.fn(),
}));

import { open, stat } from 'node:fs/promises';
import { uploadVideo } from '../src/client.js';

const openMock = open as unknown as ReturnType<typeof vi.fn>;
const statMock = stat as unknown as ReturnType<typeof vi.fn>;

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as typeof fetch;

const CFG = { accessToken: 'TOKEN' };

function mockInitOk(publishId = 'pub1', uploadUrl = 'https://upload.tiktok/u?x'): void {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { publish_id: publishId, upload_url: uploadUrl } }),
  });
}
function mockChunkOk(): void {
  fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' });
}

describe('tiktok-publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statMock.mockResolvedValue({ isFile: () => true, size: 3_000_000 });
    openMock.mockResolvedValue({
      read: vi.fn().mockResolvedValue({ bytesRead: 1024, buffer: Buffer.alloc(1024) }),
      close: vi.fn(),
    });
  });

  it('uploads a small video as a single chunk and returns publishId', async () => {
    mockInitOk('p-abc');
    mockChunkOk();
    const result = await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' });
    expect(result.publishId).toBe('p-abc');
    expect(result.platform).toBe('tiktok');

    // Init call + 1 chunk call = 2 fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Init body has correct source_info
    const initCall = fetchMock.mock.calls[0];
    const initBody = JSON.parse(initCall[1].body);
    expect(initBody.source_info.source).toBe('FILE_UPLOAD');
    expect(initBody.source_info.video_size).toBe(3_000_000);
    expect(initBody.source_info.total_chunk_count).toBe(1);
  });

  it('respects privacy level override', async () => {
    mockInitOk('p');
    mockChunkOk();
    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T', privacyLevel: 'PUBLIC_TO_EVERYONE' });
    const initBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(initBody.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE');
  });

  it('defaults to SELF_ONLY privacy (safe default)', async () => {
    mockInitOk('p');
    mockChunkOk();
    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' });
    const initBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(initBody.post_info.privacy_level).toBe('SELF_ONLY');
  });

  it('chunks large video into multiple PUT requests', async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true, size: 12_000_000 }); // 12 MB → 3 chunks at 5MB
    mockInitOk('p');
    mockChunkOk(); mockChunkOk(); mockChunkOk();

    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' });
    // init + 3 chunks = 4 fetches
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('sends Content-Range header on each chunk', async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true, size: 11_000_000 });
    mockInitOk('p');
    // 11 MB at 5 MB chunks = ceil(11 / 5) = 3 chunks
    mockChunkOk(); mockChunkOk(); mockChunkOk();

    await uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' });
    // chunk 1: bytes 0-5242879/11000000
    const c1 = fetchMock.mock.calls[1];
    expect(c1[0]).toBe('https://upload.tiktok/u?x');
    expect(c1[1].headers['Content-Range']).toMatch(/^bytes 0-5242879\/11000000$/);
    // final chunk: bytes 10485760-10999999/11000000
    const cLast = fetchMock.mock.calls[3];
    expect(cLast[1].headers['Content-Range']).toMatch(/^bytes 10485760-10999999\/11000000$/);
  });

  it('throws with auth error code on 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' }))
      .rejects.toMatchObject({ code: 401 });
  });

  it('surfaces TikTok API error code from response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: 'invalid_param', message: 'bad', log_id: 'abc' } }),
    });
    await expect(uploadVideo(CFG, { videoPath: './v.mp4', title: 'T' }))
      .rejects.toMatchObject({ code: 'invalid_param' });
  });

  it('rejects empty video file', async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true, size: 0 });
    await expect(uploadVideo(CFG, { videoPath: './empty.mp4', title: 'T' }))
      .rejects.toThrow(/missing or empty/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
