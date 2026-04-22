import { describe, expect, it, vi, beforeEach } from 'vitest';

const listMock = vi.fn();
const insertMock = vi.fn();
const setCredentialsMock = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: vi.fn(() => ({
      commentThreads: { list: listMock },
      comments: { insert: insertMock },
    })),
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: setCredentialsMock })),
    },
  },
}));

import { fetchComments, postReply } from '../src/client.js';

beforeEach(() => {
  listMock.mockReset();
  insertMock.mockReset();
  setCredentialsMock.mockReset();
});

const READ_CFG = { apiKey: 'test-key' };
const OAUTH_CFG = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

describe('fetchComments', () => {
  it('returns top-level comments with id, author, text, timestamp', async () => {
    listMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            snippet: {
              topLevelComment: {
                id: 'cmt-1',
                snippet: {
                  authorDisplayName: 'Fatima',
                  textOriginal: 'Love the episode',
                  publishedAt: '2026-04-01T12:00:00Z',
                  likeCount: 3,
                },
              },
            },
          },
        ],
        nextPageToken: undefined,
      },
    });

    const result = await fetchComments(READ_CFG, { videoId: 'vid-abc' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'cmt-1',
      author: 'Fatima',
      text: 'Love the episode',
      timestamp: '2026-04-01T12:00:00Z',
      likeCount: 3,
    });
  });

  it('respects --max and stops paginating once reached', async () => {
    listMock.mockResolvedValueOnce({
      data: {
        items: Array.from({ length: 100 }, (_, i) => ({
          snippet: {
            topLevelComment: {
              id: `cmt-${i}`,
              snippet: { authorDisplayName: `u${i}`, textOriginal: `t${i}`, publishedAt: '2026-04-01T00:00:00Z', likeCount: 0 },
            },
          },
        })),
        nextPageToken: 'page-2',
      },
    });

    const result = await fetchComments(READ_CFG, { videoId: 'vid-abc', max: 50 });
    expect(result).toHaveLength(50);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('filters by sinceIso — excludes older comments', async () => {
    listMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            snippet: {
              topLevelComment: {
                id: 'old',
                snippet: { authorDisplayName: 'a', textOriginal: 'old', publishedAt: '2025-01-01T00:00:00Z', likeCount: 0 },
              },
            },
          },
          {
            snippet: {
              topLevelComment: {
                id: 'new',
                snippet: { authorDisplayName: 'b', textOriginal: 'new', publishedAt: '2026-04-15T00:00:00Z', likeCount: 0 },
              },
            },
          },
        ],
      },
    });

    const result = await fetchComments(READ_CFG, { videoId: 'vid-abc', sinceIso: '2026-01-01T00:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new');
  });

  it('paginates across multiple pages via nextPageToken', async () => {
    listMock
      .mockResolvedValueOnce({
        data: {
          items: [
            { snippet: { topLevelComment: { id: '1', snippet: { authorDisplayName: 'a', textOriginal: 't1', publishedAt: '2026-04-01T00:00:00Z', likeCount: 0 } } } },
          ],
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            { snippet: { topLevelComment: { id: '2', snippet: { authorDisplayName: 'b', textOriginal: 't2', publishedAt: '2026-04-01T00:00:00Z', likeCount: 0 } } } },
          ],
        },
      });

    const result = await fetchComments(READ_CFG, { videoId: 'vid-abc', max: 10 });
    expect(result).toHaveLength(2);
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});

describe('postReply', () => {
  it('calls comments.insert with parentId + textOriginal and returns reply id', async () => {
    insertMock.mockResolvedValueOnce({
      data: { id: 'reply-1', snippet: { textOriginal: 'thanks!' } },
    });

    const result = await postReply(OAUTH_CFG, { commentId: 'cmt-1', text: 'thanks!' });
    expect(result).toEqual({ id: 'reply-1', text: 'thanks!' });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      part: ['snippet'],
      requestBody: { snippet: { parentId: 'cmt-1', textOriginal: 'thanks!' } },
    }));
  });

  it('throws when the API returns no id', async () => {
    insertMock.mockResolvedValueOnce({ data: {} });
    await expect(postReply(OAUTH_CFG, { commentId: 'cmt-1', text: 'x' }))
      .rejects.toThrow(/no ID/);
  });

  it('surfaces API errors verbatim', async () => {
    insertMock.mockRejectedValueOnce(Object.assign(new Error('quota exceeded'), { code: 403 }));
    await expect(postReply(OAUTH_CFG, { commentId: 'cmt-1', text: 'x' }))
      .rejects.toMatchObject({ code: 403 });
  });
});
