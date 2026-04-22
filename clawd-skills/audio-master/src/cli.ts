#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { masterSingle, concatenate, duck, type MasterOptions, type DuckOptions } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

function classifyErr(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === 'config') return 'config';
  if (typeof code === 'string' && code.startsWith('ffmpeg_')) return 'upstream';
  return 'unknown';
}

function parseNum(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) emitErrAndExit('config', `${name} must be a number, got ${v}`);
  return n;
}

function parseCodec(v: string | undefined): 'mp3' | 'wav' | undefined {
  if (v === undefined) return undefined;
  if (v !== 'mp3' && v !== 'wav') emitErrAndExit('config', `--codec must be mp3|wav, got ${v}`);
  return v;
}

async function runMaster(values: Record<string, string | boolean | undefined>): Promise<void> {
  if (!values.input) emitErrAndExit('config', '--input <path> required for master');
  if (!values.output) emitErrAndExit('config', '--output <path> required for master');

  const opts: MasterOptions = {
    targetLufs: parseNum(values['target-lufs'] as string | undefined, '--target-lufs'),
    truePeakDb: parseNum(values['true-peak-db'] as string | undefined, '--true-peak-db'),
    lra:        parseNum(values['lra'] as string | undefined, '--lra'),
    sampleRate: parseNum(values['sample-rate'] as string | undefined, '--sample-rate'),
    codec:      parseCodec(values['codec'] as string | undefined),
  };

  const result = await masterSingle(values.input as string, values.output as string, opts);
  process.stdout.write(JSON.stringify({
    ok: true,
    op: 'master',
    path: result.path,
    measured: {
      input_i:      result.measured.input_i,
      input_tp:     result.measured.input_tp,
      input_lra:    result.measured.input_lra,
      input_thresh: result.measured.input_thresh,
      target_offset: result.measured.target_offset,
    },
  }) + '\n');
}

async function runDuck(values: Record<string, string | boolean | undefined>): Promise<void> {
  if (!values.voice) emitErrAndExit('config', '--voice <path> required for duck');
  if (!values.music) emitErrAndExit('config', '--music <path> required for duck');
  if (!values.output) emitErrAndExit('config', '--output <path> required for duck');

  const opts: DuckOptions = {
    musicFullDb:    parseNum(values['music-full-db']   as string | undefined, '--music-full-db'),
    musicDuckDb:    parseNum(values['music-duck-db']   as string | undefined, '--music-duck-db'),
    attackMs:       parseNum(values['attack-ms']       as string | undefined, '--attack-ms'),
    releaseMs:      parseNum(values['release-ms']      as string | undefined, '--release-ms'),
    tailSeconds:    parseNum(values['tail-seconds']    as string | undefined, '--tail-seconds'),
    fadeInSeconds:  parseNum(values['fade-in-seconds'] as string | undefined, '--fade-in-seconds'),
    fadeOutSeconds: parseNum(values['fade-out-seconds'] as string | undefined, '--fade-out-seconds'),
    loopMusic:      values['no-loop'] ? false : true,
    sampleRate:     parseNum(values['sample-rate'] as string | undefined, '--sample-rate'),
    codec:          parseCodec(values['codec'] as string | undefined),
  };

  const result = await duck(
    values.voice as string,
    values.music as string,
    values.output as string,
    opts,
  );
  process.stdout.write(JSON.stringify({
    ok: true,
    op: 'duck',
    path: result.path,
    voice: result.voicePath,
    music: result.musicPath,
  }) + '\n');
}

async function runConcat(values: Record<string, string | boolean | undefined>): Promise<void> {
  if (!values.inputs) emitErrAndExit('config', '--inputs <a,b,c> required for concat');
  if (!values.output) emitErrAndExit('config', '--output <path> required for concat');

  const inputs = (values.inputs as string).split(',').map(s => s.trim()).filter(Boolean);
  if (inputs.length === 0) emitErrAndExit('config', '--inputs must list at least one file');

  const opts: MasterOptions = {
    sampleRate: parseNum(values['sample-rate'] as string | undefined, '--sample-rate'),
    codec:      parseCodec(values['codec'] as string | undefined),
    gapMs:      parseNum(values['gap-ms'] as string | undefined, '--gap-ms'),
  };

  const result = await concatenate(inputs, values.output as string, opts);
  process.stdout.write(JSON.stringify({
    ok: true,
    op: 'concat',
    path: result.path,
    segments: result.segments,
    gap_ms: result.gapMs,
  }) + '\n');
}

async function main(): Promise<void> {
  const subcmd = process.argv[2];
  const argv = process.argv.slice(3);

  if (!subcmd || subcmd === '-h' || subcmd === '--help') {
    process.stdout.write([
      'audio-master <subcommand> [options]',
      '',
      'Subcommands:',
      '  master  Two-pass ffmpeg loudnorm to target LUFS.',
      '    --input <path> --output <path>',
      '    [--target-lufs -14] [--true-peak-db -1] [--lra 11]',
      '    [--sample-rate 44100] [--codec mp3|wav]',
      '',
      '  concat  Join multiple mastered files into one, with silence gaps.',
      '    --inputs <a,b,c> --output <path>',
      '    [--gap-ms 500] [--sample-rate 44100] [--codec mp3|wav]',
      '',
      '  duck    Mix voice over music with sidechain ducking.',
      '    --voice <path> --music <path> --output <path>',
      '    [--music-full-db 0] [--music-duck-db -12]',
      '    [--attack-ms 120] [--release-ms 800]',
      '    [--tail-seconds 3] [--fade-in-seconds 2] [--fade-out-seconds 3]',
      '    [--no-loop] [--sample-rate 44100] [--codec mp3|wav]',
      '',
    ].join('\n'));
    process.exit(0);
  }

  if (subcmd !== 'master' && subcmd !== 'concat' && subcmd !== 'duck') {
    emitErrAndExit('config', `unknown subcommand: ${subcmd} — expected 'master', 'concat', or 'duck'`);
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      'input':            { type: 'string' },
      'inputs':           { type: 'string' },
      'output':           { type: 'string' },
      'voice':            { type: 'string' },
      'music':            { type: 'string' },
      'target-lufs':      { type: 'string' },
      'true-peak-db':     { type: 'string' },
      'lra':              { type: 'string' },
      'sample-rate':      { type: 'string' },
      'codec':            { type: 'string' },
      'gap-ms':           { type: 'string' },
      'music-full-db':    { type: 'string' },
      'music-duck-db':    { type: 'string' },
      'attack-ms':        { type: 'string' },
      'release-ms':       { type: 'string' },
      'tail-seconds':     { type: 'string' },
      'fade-in-seconds':  { type: 'string' },
      'fade-out-seconds': { type: 'string' },
      'no-loop':          { type: 'boolean' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  try {
    if (subcmd === 'master')      await runMaster(values);
    else if (subcmd === 'concat') await runConcat(values);
    else                          await runDuck(values);
  } catch (err) {
    const kind = classifyErr(err);
    const message = err instanceof Error ? err.message : String(err);
    emitErrAndExit(kind, message);
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
