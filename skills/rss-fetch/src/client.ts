import { XMLParser } from 'fast-xml-parser';

const DEFAULT_TIMEOUT_MS = 15_000;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface FeedItem {
  title: string;
  url: string;
  content: string;
  /** The feed URL this item came from. */
  source: string;
  /** Parsed publication timestamp (ISO). Empty when the feed doesn't provide one. */
  published?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  userAgent?: string;
}

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  'content:encoded'?: string;
}

interface AtomEntry {
  title?: string | { '#text': string };
  link?: string | { '@_href': string } | Array<{ '@_href': string }>;
  summary?: string;
  content?: string | { '#text': string };
  updated?: string;
  published?: string;
}

function extractAtomLink(link: AtomEntry['link']): string {
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) return link[0]?.['@_href'] ?? '';
  if (link && typeof link === 'object') return link['@_href'] ?? '';
  return '';
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function normaliseDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const ts = Date.parse(input);
  return Number.isNaN(ts) ? input : new Date(ts).toISOString();
}

function parseFeedXml(xml: string, sourceUrl: string): FeedItem[] {
  const parsed = xmlParser.parse(xml);

  // RSS 2.0
  const rssItems: RssItem[] | RssItem | undefined = parsed?.rss?.channel?.item;
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    return items
      .filter((it) => it.title && it.link)
      .map((it) => ({
        title:   String(it.title ?? ''),
        url:     String(it.link ?? ''),
        content: String(it['content:encoded'] ?? it.description ?? ''),
        source:  sourceUrl,
        published: normaliseDate(it.pubDate),
      }));
  }

  // Atom
  const atomEntries: AtomEntry[] | AtomEntry | undefined = parsed?.feed?.entry;
  if (atomEntries) {
    const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    return entries
      .filter((e) => e.title && e.link)
      .map((e) => ({
        title:   extractText(e.title),
        url:     extractAtomLink(e.link),
        content: extractText(e.content) || extractText(e.summary) || '',
        source:  sourceUrl,
        published: normaliseDate(e.published ?? e.updated),
      }));
  }

  return [];
}

/**
 * Fetch and parse many RSS/Atom feeds in parallel. Uses Promise.allSettled —
 * individual feed failures are reported via the `errors` array in the result
 * rather than rejecting the whole operation.
 */
export async function fetchFeeds(
  urls: string[],
  opts: FetchOptions = {},
): Promise<{ items: FeedItem[]; errors: Array<{ url: string; message: string }> }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = opts.userAgent ?? 'openclaw-rss-fetch/0.1';

  const settled = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
      const xml = await response.text();
      return { url, items: parseFeedXml(xml, url) };
    }),
  );

  const items: FeedItem[] = [];
  const errors: Array<{ url: string; message: string }> = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') items.push(...result.value.items);
    else errors.push({ url: urls[i], message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  return { items, errors };
}
