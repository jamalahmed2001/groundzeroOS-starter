#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './client.js';

interface CliFlags {
  text?: string;
  'text-file'?: string;
  'segments-file'?: string;
  'voice-id'?: string;
  'model-id'?: string;
  stability?: string;
  'similarity-boost'?: string;
  output?: string;
  'output-dir'?: string;
  'output-format'?: string;
  retries?: string;
  'api-key'?: string;
  help?: boolean;
}

function emitErrAndExit(error: string, message: string, extra?: Record<string, unknown>): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message, ...(extra ?? {}) }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const status = (err as { statusCode: number }).statusCode;
    if (status === 401 || status === 403) return 'auth';
    if (status === 402) return 'quota';
    if (status === 422) return 'policy';
    if (status === 429) return 'rate_limit';
    if (status >= 500) return 'upstream';
  }
  return 'unknown';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      text: { type: 'string' },
      'text-file': { type: 'string' },
      'segments-file': { type: 'string' },
      'voice-id': { type: 'string' },
      'model-id': { type: 'string', default: 'eleven_multilingual_v2' },
      stability: { type: 'string', default: '0.5' },
      'similarity-boost': { type: 'string', default: '0.75' },
      output: { type: 'string' },
      'output-dir': { type: 'string' },
      'output-format': { type: 'string', default: 'mp3_44100_128' },
      retries: { type: 'string', default: '3' },
      'api-key': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: CliFlags };

  if (values.help) {
    process.stdout.write('See SKILL.md for full usage. Quick form:\n');
    process.stdout.write('  elevenlabs-tts --text "..." --voice-id <id> --output out.mp3\n');
    process.stdout.write('  elevenlabs-tts --segments-file segs.json --voice-id <id> --output-dir ./out/\n');
    process.exit(0);
  }

  const apiKey = values['api-key'] ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) emitErrAndExit('config', 'Missing ELEVENLABS_API_KEY (or --api-key)');

  const voiceId = values['voice-id'];
  if (!voiceId) emitErrAndExit('config', '--voice-id is required');

  const modes = [values.text, values['text-file'], values['segments-file']].filter(Boolean);
  if (modes.length !== 1) {
    emitErrAndExit('config', 'Provide exactly one of --text, --text-file, --segments-file');
  }

  const client = createClient({
    apiKey,
    maxRetries: Number(values.retries ?? 3),
  });

  const baseReq = {
    voiceId,
    modelId: values['model-id'],
    stability: Number(values.stability),
    similarityBoost: Number(values['similarity-boost']),
    outputFormat: values['output-format'],
  };

  try {
    // Segments mode — array of {id, text} -> multiple files
    if (values['segments-file']) {
      const segRaw = await readFile(values['segments-file'], 'utf8');
      const segments = JSON.parse(segRaw) as Array<{ id: string; text: string }>;
      if (!Array.isArray(segments) || segments.length === 0) {
        emitErrAndExit('config', 'segments-file must be a non-empty JSON array of {id, text}');
      }
      const outDir = values['output-dir'];
      if (!outDir) emitErrAndExit('config', '--output-dir required when using --segments-file');
      await mkdir(outDir, { recursive: true });

      const outputs: string[] = [];
      let totalChars = 0;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const pad = String(i + 1).padStart(2, '0');
        const outPath = path.join(outDir, `${pad}-${seg.id}.mp3`);
        const audio = await client.synthesize({ ...baseReq, text: seg.text });
        await writeFile(outPath, audio);
        outputs.push(outPath);
        totalChars += seg.text.length;
      }
      process.stdout.write(JSON.stringify({
        ok: true,
        outputs,
        voice_id: voiceId,
        model_id: baseReq.modelId,
        total_chars: totalChars,
        segments: segments.length,
      }) + '\n');
      return;
    }

    // Single-text modes
    let text: string;
    if (values['text-file']) {
      text = await readFile(values['text-file'], 'utf8');
    } else {
      text = values.text!;
    }

    if (!values.output) emitErrAndExit('config', '--output required when using --text or --text-file');

    const audio = await client.synthesize({ ...baseReq, text });
    await mkdir(path.dirname(values.output), { recursive: true });
    await writeFile(values.output, audio);

    process.stdout.write(JSON.stringify({
      ok: true,
      outputs: [values.output],
      voice_id: voiceId,
      model_id: baseReq.modelId,
      total_chars: text.length,
      bytes: audio.length,
    }) + '\n');
  } catch (err) {
    const kind = classifyErr(err);
    const message = err instanceof Error ? err.message : String(err);
    emitErrAndExit(kind, message);
  }
}

main().catch((err) => {
  emitErrAndExit('unknown', err instanceof Error ? err.message : String(err));
});
