import { readFile, writeFile, stat, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { buildFeed, type ChannelConfig, type EpisodeItem } from './feed.js';

interface Args {
  channelFile?: string;
  episodeFile?: string;
  feedFile: string;
  audioFile?: string;
  output?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    switch (flag) {
      case '--channel':
        out.channelFile = val;
        i++;
        break;
      case '--episode':
        out.episodeFile = val;
        i++;
        break;
      case '--feed':
        out.feedFile = val;
        i++;
        break;
      case '--audio':
        out.audioFile = val;
        i++;
        break;
      case '--output':
        out.output = val;
        i++;
        break;
      case '--help':
      case '-h':
        process.stdout.write(HELP);
        process.exit(0);
    }
  }
  if (!out.feedFile) {
    process.stderr.write('Missing --feed <path>\n' + HELP);
    process.exit(2);
  }
  return out as Args;
}

const HELP = `rss-publish --channel channel.json --episode episode.json --feed feed.xml [--audio audio.mp3] [--output feed.xml]

Generates (or updates) a podcast RSS 2.0 + iTunes feed XML file.

--channel    JSON file with channel config (title, link, description, author, email, language, category, imageUrl, explicit, type)
--episode    JSON file with episode item (episodeId, title, description, audioUrl, durationSeconds, [audioBytes], [link], [guid], [pubDate], [imageUrl], [episodeNumber], [season])
--feed       Existing feed XML to merge into (read). If missing, starts fresh.
--audio      (Optional) path to the MP3 — used to measure audioBytes if not supplied in --episode.
--output     Where to write the updated feed. Defaults to the --feed path (in-place update).

Channel JSON example:
{
  "title": "Example Podcast Title",
  "link": "https://mani.plus",
  "description": "A British, heartfelt podcast ...",
  "author": "Example Author",
  "email": "hello@mani.plus",
  "language": "en-GB",
  "category": "Health & Fitness",
  "imageUrl": "https://mani.plus/cover.png",
  "explicit": "false",
  "type": "episodic"
}

Episode JSON example:
{
  "episodeId": "2026-04-22-pregnancy-after-transplant",
  "title": "A New Beginning",
  "description": "Assalamu alaikum ...",
  "audioUrl": "https://mani.plus/episodes/2026-04-22.mp3",
  "durationSeconds": 762,
  "pubDate": "2026-04-22T08:00:00Z",
  "episodeNumber": 8
}
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.channelFile || !args.episodeFile) {
    process.stderr.write(JSON.stringify({ ok: false, error: 'need --channel and --episode' }) + '\n');
    process.exit(2);
  }

  const channel = JSON.parse(await readFile(args.channelFile, 'utf-8')) as ChannelConfig;
  const episodeRaw = JSON.parse(await readFile(args.episodeFile, 'utf-8')) as Partial<EpisodeItem> & {
    pubDate?: string;
  };

  if (!episodeRaw.episodeId || !episodeRaw.title || !episodeRaw.audioUrl) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: 'episode JSON must include episodeId, title, audioUrl',
      }) + '\n',
    );
    process.exit(2);
  }

  let audioBytes = episodeRaw.audioBytes ?? 0;
  if (!audioBytes && args.audioFile) {
    try {
      const info = await stat(args.audioFile);
      audioBytes = info.size;
    } catch {
      audioBytes = 0;
    }
  }

  const item: EpisodeItem = {
    episodeId: episodeRaw.episodeId,
    title: episodeRaw.title,
    description: episodeRaw.description ?? '',
    audioUrl: episodeRaw.audioUrl,
    audioBytes,
    durationSeconds: episodeRaw.durationSeconds ?? 0,
    link: episodeRaw.link,
    guid: episodeRaw.guid,
    pubDate: episodeRaw.pubDate ? new Date(episodeRaw.pubDate) : new Date(),
    imageUrl: episodeRaw.imageUrl,
    episodeNumber: episodeRaw.episodeNumber,
    season: episodeRaw.season,
  };

  let existingXml: string | undefined;
  try {
    existingXml = await readFile(args.feedFile, 'utf-8');
  } catch {
    existingXml = undefined;
  }

  const { xml, totalItems } = buildFeed(channel, item, existingXml);

  const outPath = args.output ?? args.feedFile;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, xml, 'utf-8');

  process.stdout.write(
    JSON.stringify({
      ok: true,
      feed: outPath,
      totalItems,
      newItem: { episodeId: item.episodeId, title: item.title, audioBytes, durationSeconds: item.durationSeconds },
    }) + '\n',
  );
}

main().catch((err: unknown) => {
  process.stderr.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + '\n');
  process.exit(1);
});
