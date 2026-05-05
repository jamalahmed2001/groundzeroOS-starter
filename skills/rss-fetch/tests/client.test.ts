import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as typeof fetch;

import { fetchFeeds } from '../src/client.js';

function mockXmlOk(xml: string): void {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    text: async () => xml,
  });
}
function mockHttpErr(status: number): void {
  fetchMock.mockResolvedValueOnce({ ok: false, status, text: async () => '' });
}

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Article 1</title>
      <link>https://example.com/a1</link>
      <description>First article</description>
      <pubDate>Wed, 01 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article 2</title>
      <link>https://example.com/a2</link>
      <content:encoded>Full content here</content:encoded>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom1"/>
    <summary>Atom summary</summary>
    <updated>2026-04-01T10:00:00Z</updated>
  </entry>
</feed>`;

beforeEach(() => { fetchMock.mockReset(); });

describe('fetchFeeds', () => {
  it('parses RSS 2.0 items with title, link, description, pubDate', async () => {
    mockXmlOk(RSS_XML);

    const { items, errors } = await fetchFeeds(['https://example.com/rss.xml']);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Article 1',
      url: 'https://example.com/a1',
      content: 'First article',
      source: 'https://example.com/rss.xml',
      published: '2026-04-01T10:00:00.000Z',
    });
    expect(items[1].content).toBe('Full content here');  // prefers content:encoded
  });

  it('parses Atom feeds with nested link/title/summary', async () => {
    mockXmlOk(ATOM_XML);

    const { items } = await fetchFeeds(['https://example.com/atom']);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Atom Post',
      url: 'https://example.com/atom1',
      content: 'Atom summary',
      source: 'https://example.com/atom',
      published: '2026-04-01T10:00:00.000Z',
    });
  });

  it('returns errors array for failed feeds, continues with the rest', async () => {
    mockHttpErr(503);
    mockXmlOk(RSS_XML);

    const { items, errors } = await fetchFeeds([
      'https://bad.example.com/rss',
      'https://good.example.com/rss',
    ]);
    expect(items).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ url: 'https://bad.example.com/rss' });
    expect(errors[0].message).toMatch(/503/);
  });

  it('empty URL list returns empty results', async () => {
    const { items, errors } = await fetchFeeds([]);
    expect(items).toEqual([]);
    expect(errors).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the per-feed URL as the item source', async () => {
    mockXmlOk(RSS_XML);
    mockXmlOk(ATOM_XML);

    const { items } = await fetchFeeds([
      'https://first.example/rss',
      'https://second.example/atom',
    ]);
    expect(items[0].source).toBe('https://first.example/rss');
    expect(items[items.length - 1].source).toBe('https://second.example/atom');
  });
});
