import { XMLParser } from 'fast-xml-parser';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const DEFAULT_MAX_PER_QUERY = 10;
const DEFAULT_TIMEOUT_MS = 15_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export interface Article {
  /** Title as published. */
  title: string;
  /** Canonical URL — `pubmed.ncbi.nlm.nih.gov/<pmid>/` when PMID is present. */
  url: string;
  /** Abstract text (may be empty for titles without indexed abstracts). */
  content: string;
  /** The source identifier — `pubmed` for everything from this skill. */
  source: 'pubmed';
  pmid: string;
}

export interface SearchOptions {
  /** Per-query result cap. Default 10. */
  maxPerQuery?: number;
  /** Request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Optional NCBI API key — bumps rate limit from 3/s to 10/s. */
  apiKey?: string;
  /** Custom User-Agent. Default `openclaw-pubmed-search/0.1`. */
  userAgent?: string;
}

interface ESearchResult {
  esearchresult?: { idlist?: string[] | string; count?: string };
}

interface PubMedArticleXml {
  MedlineCitation?: {
    PMID?: string | { '#text': string };
    Article?: {
      ArticleTitle?: string | { '#text': string };
      Abstract?: {
        AbstractText?: string | { '#text': string } | Array<string | { '#text': string }>;
      };
    };
  };
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function extractAbstract(abs: unknown): string {
  if (!abs) return '';
  if (typeof abs === 'string') return abs;
  if (Array.isArray(abs)) return abs.map(extractText).join(' ');
  return extractText(abs);
}

function withKey(params: URLSearchParams, apiKey?: string): URLSearchParams {
  if (apiKey) params.set('api_key', apiKey);
  return params;
}

async function fetchJson(url: string, opts: Required<Pick<SearchOptions, 'timeoutMs' | 'userAgent'>>): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': opts.userAgent },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} from ${url}`), { code: response.status });
  return response.json();
}

async function fetchXml(url: string, opts: Required<Pick<SearchOptions, 'timeoutMs' | 'userAgent'>>): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': opts.userAgent },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} from ${url}`), { code: response.status });
  return response.text();
}

async function esearch(term: string, opts: SearchOptions & Required<Pick<SearchOptions, 'timeoutMs' | 'userAgent' | 'maxPerQuery'>>): Promise<string[]> {
  const params = withKey(new URLSearchParams({
    db: 'pubmed',
    term,
    retmode: 'json',
    retmax: String(opts.maxPerQuery),
  }), opts.apiKey);

  const data = (await fetchJson(`${EUTILS_BASE}/esearch.fcgi?${params}`, opts)) as ESearchResult;
  const idList = data?.esearchresult?.idlist;
  if (!idList) return [];
  return Array.isArray(idList) ? idList : [idList];
}

async function efetch(pmids: string[], opts: SearchOptions & Required<Pick<SearchOptions, 'timeoutMs' | 'userAgent'>>): Promise<Article[]> {
  if (pmids.length === 0) return [];

  const params = withKey(new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
  }), opts.apiKey);

  const xml = await fetchXml(`${EUTILS_BASE}/efetch.fcgi?${params}`, opts);
  const parsed = xmlParser.parse(xml);

  const node = parsed?.PubmedArticleSet?.PubmedArticle;
  if (!node) return [];
  const articles: PubMedArticleXml[] = Array.isArray(node) ? node : [node];

  return articles
    .map((a) => {
      const c = a.MedlineCitation;
      if (!c?.Article?.ArticleTitle) return null;
      const pmid = extractText(c.PMID);
      const title = extractText(c.Article.ArticleTitle);
      const content = extractAbstract(c.Article.Abstract?.AbstractText);
      if (!title || !pmid) return null;
      return {
        title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        content,
        source: 'pubmed' as const,
        pmid,
      };
    })
    .filter((a): a is Article => a !== null);
}

/**
 * Runs each query through esearch → efetch. Deduplicates PMIDs across queries.
 * Errors on individual queries are surfaced via the Promise rejection (no silent
 * swallowing — projects decide how to handle per-query failures).
 */
export async function searchPubMed(queries: string[], opts: SearchOptions = {}): Promise<Article[]> {
  if (queries.length === 0) return [];
  const resolvedOpts = {
    maxPerQuery: opts.maxPerQuery ?? DEFAULT_MAX_PER_QUERY,
    timeoutMs:   opts.timeoutMs   ?? DEFAULT_TIMEOUT_MS,
    userAgent:   opts.userAgent   ?? 'openclaw-pubmed-search/0.1',
    apiKey:      opts.apiKey,
  };

  const all: Article[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const pmids = await esearch(q, resolvedOpts);
    const fresh = pmids.filter((id) => !seen.has(id));
    for (const id of fresh) seen.add(id);
    if (fresh.length > 0) {
      const articles = await efetch(fresh, resolvedOpts);
      all.push(...articles);
    }
  }
  return all;
}
