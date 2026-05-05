import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as typeof fetch;

import { searchPubMed } from '../src/client.js';

function mockJsonOk(payload: unknown): void {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json:  async () => payload,
    text:  async () => JSON.stringify(payload),
  });
}
function mockXmlOk(xml: string): void {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json:  async () => ({}),
    text:  async () => xml,
  });
}
function mockHttpErr(status: number): void {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json:  async () => ({}),
    text:  async () => '',
  });
}

const SAMPLE_XML = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <ArticleTitle>Dialysis outcomes in elderly patients</ArticleTitle>
        <Abstract>
          <AbstractText>Background: we studied...</AbstractText>
        </Abstract>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

beforeEach(() => { fetchMock.mockReset(); });

describe('searchPubMed', () => {
  it('returns normalised articles from a single query', async () => {
    mockJsonOk({ esearchresult: { idlist: ['12345678'] } });
    mockXmlOk(SAMPLE_XML);

    const result = await searchPubMed(['dialysis elderly']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Dialysis outcomes in elderly patients',
      url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
      content: 'Background: we studied...',
      source: 'pubmed',
      pmid: '12345678',
    });
  });

  it('deduplicates PMIDs across multiple queries', async () => {
    mockJsonOk({ esearchresult: { idlist: ['111', '222'] } });
    mockXmlOk(SAMPLE_XML.replace(/12345678/g, '111').replace('elderly patients', 'younger adults'));
    mockJsonOk({ esearchresult: { idlist: ['222', '333'] } });  // 222 already seen
    mockXmlOk(SAMPLE_XML.replace(/12345678/g, '333'));

    await searchPubMed(['q1', 'q2']);
    // Two esearches + two efetches = 4 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Second efetch should only request PMID 333 (not 222)
    const secondEfetchUrl = fetchMock.mock.calls[3][0] as string;
    expect(secondEfetchUrl).toContain('id=333');
    expect(secondEfetchUrl).not.toContain('id=222');
  });

  it('returns empty for empty query list', async () => {
    expect(await searchPubMed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes api_key to esearch + efetch when provided', async () => {
    mockJsonOk({ esearchresult: { idlist: ['1'] } });
    mockXmlOk(SAMPLE_XML.replace(/12345678/g, '1'));

    await searchPubMed(['q'], { apiKey: 'abc' });
    expect(fetchMock.mock.calls[0][0]).toContain('api_key=abc');
    expect(fetchMock.mock.calls[1][0]).toContain('api_key=abc');
  });

  it('throws with HTTP status code when esearch fails', async () => {
    mockHttpErr(429);
    await expect(searchPubMed(['q'])).rejects.toMatchObject({ code: 429 });
  });

  it('respects maxPerQuery', async () => {
    mockJsonOk({ esearchresult: { idlist: ['1'] } });
    mockXmlOk(SAMPLE_XML.replace(/12345678/g, '1'));

    await searchPubMed(['q'], { maxPerQuery: 3 });
    expect(fetchMock.mock.calls[0][0]).toContain('retmax=3');
  });
});
