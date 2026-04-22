import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export interface ChannelConfig {
  title: string;
  link: string;
  description: string;
  author: string;
  email: string;
  language?: string;
  category?: string;
  imageUrl?: string;
  explicit?: 'true' | 'false' | 'clean';
  type?: 'episodic' | 'serial';
}

export interface EpisodeItem {
  episodeId: string;
  title: string;
  description: string;
  audioUrl: string;
  audioBytes: number;
  durationSeconds: number;
  link?: string;
  guid?: string;
  pubDate?: Date;
  imageUrl?: string;
  episodeNumber?: number;
  season?: number;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

export function toRFC2822(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = days[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mon = months[date.getUTCMonth()];
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${d}, ${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} +0000`;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item',
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: false,
});

function buildItemObject(item: EpisodeItem, channel: ChannelConfig): object {
  const pubDate = item.pubDate ?? new Date();
  const link = item.link ?? `${channel.link.replace(/\/$/, '')}/episodes/${item.episodeId}`;
  const guid = item.guid ?? link;
  const obj: Record<string, unknown> = {
    title: item.title,
    link,
    description: item.description,
    guid: { '#text': guid, '@_isPermaLink': 'false' },
    pubDate: toRFC2822(pubDate),
    enclosure: {
      '@_url': item.audioUrl,
      '@_length': String(item.audioBytes),
      '@_type': 'audio/mpeg',
    },
    'itunes:duration': formatDuration(item.durationSeconds),
    'itunes:summary': item.description,
    'itunes:explicit': channel.explicit ?? 'false',
  };
  if (item.imageUrl ?? channel.imageUrl) {
    obj['itunes:image'] = { '@_href': item.imageUrl ?? channel.imageUrl };
  }
  if (item.episodeNumber !== undefined) obj['itunes:episode'] = String(item.episodeNumber);
  if (item.season !== undefined) obj['itunes:season'] = String(item.season);
  return obj;
}

function buildFeedObject(channel: ChannelConfig, items: object[]): object {
  const channelObj: Record<string, unknown> = {
    title: channel.title,
    link: channel.link,
    description: channel.description,
    language: channel.language ?? 'en',
    'itunes:type': channel.type ?? 'episodic',
    'itunes:author': channel.author,
    'itunes:explicit': channel.explicit ?? 'false',
    'itunes:owner': {
      'itunes:name': channel.author,
      'itunes:email': channel.email,
    },
    item: items,
  };
  if (channel.imageUrl) channelObj['itunes:image'] = { '@_href': channel.imageUrl };
  if (channel.category) channelObj['itunes:category'] = { '@_text': channel.category };
  return {
    rss: {
      '@_version': '2.0',
      '@_xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
      channel: channelObj,
    },
  };
}

function serializeFeed(feedObject: object): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build(feedObject) as string}`;
}

function extractGuid(item: object): string {
  const raw = (item as { guid?: unknown }).guid;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null && '#text' in raw) {
    return String((raw as { '#text': unknown })['#text']);
  }
  return String(raw);
}

export function parseExistingItems(xml: string): object[] {
  try {
    const parsed = xmlParser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    const items = parsed?.rss?.channel?.item;
    if (!items) return [];
    return Array.isArray(items) ? (items as object[]) : [items as object];
  } catch {
    return [];
  }
}

export function buildFeed(
  channel: ChannelConfig,
  newItem: EpisodeItem,
  existingXml?: string,
): { xml: string; totalItems: number } {
  const newItemObj = buildItemObject(newItem, channel);
  const newGuid = extractGuid(newItemObj);

  const existing = existingXml ? parseExistingItems(existingXml) : [];
  const deduped = existing.filter((it) => extractGuid(it) !== newGuid);

  const allItems = [newItemObj, ...deduped];
  const feedObject = buildFeedObject(channel, allItems);
  return { xml: serializeFeed(feedObject), totalItems: allItems.length };
}
