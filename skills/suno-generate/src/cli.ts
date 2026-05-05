import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { pickProvider, downloadTrack } from './providers.js';

interface Args {
  prompt?: string;
  style?: string;
  title?: string;
  durationSeconds?: number;
  instrumental: boolean;
  modelVersion?: string;
  outputDir: string;
  count: number;
  dryRun: boolean;
}

const HELP = `suno-generate — generate backing music via Suno

Usage:
  suno-generate --prompt "warm introspective piano" --style "cinematic, minimal" --output-dir ./out

Required:
  --prompt <text>         Music description / mood
  --output-dir <path>     Directory to write MP3(s)

Optional:
  --style <text>          Tags / genre / style hint (e.g. "ambient, piano, 60 bpm")
  --title <text>          Track title
  --duration-seconds <n>  Target duration (some providers ignore)
  --instrumental          Make instrumental (default: true — voiceover project)
  --vocal                 Allow lyrics/vocals (overrides --instrumental)
  --model-version <str>   e.g. chirp-v4 (default: provider-specific)
  --count <n>             How many clips to keep (default: 1)
  --dry-run               Print what would be sent without calling the API

Environment:
  SUNO_PROVIDER           gateway | selfhosted (default: gateway)

  gateway mode:
    SUNO_GATEWAY_URL      API base URL (PiAPI, GoAPI, SunoAPI.org, etc.)
    SUNO_API_KEY          Bearer / x-api-key value

  selfhosted mode (gcui-art/suno-api):
    SUNO_SELFHOST_URL     e.g. http://localhost:3000
    SUNO_COOKIE           Your Suno web cookie

Output (stdout JSON):
  {
    "ok": true,
    "provider": "gateway",
    "outputs": ["./out/track-1.mp3", ...],
    "tracks": [{ "id", "title", "durationSeconds", "style" }, ...]
  }
`;

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { instrumental: true, count: 1, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    switch (flag) {
      case '--prompt': out.prompt = val; i++; break;
      case '--style': out.style = val; i++; break;
      case '--title': out.title = val; i++; break;
      case '--duration-seconds': out.durationSeconds = parseInt(val, 10); i++; break;
      case '--model-version': out.modelVersion = val; i++; break;
      case '--output-dir': out.outputDir = val; i++; break;
      case '--count': out.count = parseInt(val, 10); i++; break;
      case '--instrumental': out.instrumental = true; break;
      case '--vocal': out.instrumental = false; break;
      case '--dry-run': out.dryRun = true; break;
      case '--help': case '-h': process.stdout.write(HELP); process.exit(0);
    }
  }
  if (!out.prompt) { process.stderr.write('Missing --prompt\n' + HELP); process.exit(2); }
  if (!out.outputDir) { process.stderr.write('Missing --output-dir\n' + HELP); process.exit(2); }
  return out as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        provider: process.env.SUNO_PROVIDER ?? 'gateway',
        request: {
          prompt: args.prompt,
          style: args.style,
          title: args.title,
          instrumental: args.instrumental,
          durationSeconds: args.durationSeconds,
        },
      }) + '\n',
    );
    return;
  }

  const provider = pickProvider();

  const tracks = await provider.generate({
    prompt: args.prompt!,
    style: args.style,
    title: args.title,
    durationSeconds: args.durationSeconds,
    instrumental: args.instrumental,
    modelVersion: args.modelVersion,
  });

  if (tracks.length === 0) throw new Error('Provider returned no tracks');

  const keep = tracks.slice(0, args.count);
  await mkdir(args.outputDir, { recursive: true });

  const outputs: string[] = [];
  for (let i = 0; i < keep.length; i++) {
    const t = keep[i];
    const fileName = `track-${String(i + 1).padStart(2, '0')}.mp3`;
    const outPath = join(args.outputDir, fileName);
    await mkdir(dirname(outPath), { recursive: true });
    const bytes = await downloadTrack(t.audioUrl, outPath);
    outputs.push(outPath);
    process.stderr.write(`Downloaded ${bytes} bytes → ${outPath}\n`);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      provider: provider.name,
      outputs,
      tracks: keep.map((t) => ({
        id: t.id,
        title: t.title,
        durationSeconds: t.durationSeconds,
        style: t.style,
        modelVersion: t.modelVersion,
      })),
    }) + '\n',
  );
}

main().catch((err: unknown) => {
  process.stderr.write(
    JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + '\n',
  );
  process.exit(1);
});
