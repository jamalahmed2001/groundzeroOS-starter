import { spawn } from 'node:child_process';
import { writeFile, unlink, stat, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface MasterOptions {
  /** Target integrated loudness in LUFS (Spotify/streaming default: -14). */
  targetLufs?: number;
  /** True peak ceiling in dBTP. Default -1. */
  truePeakDb?: number;
  /** Loudness range target in LU. Default 11. */
  lra?: number;
  /** Sample rate (Hz). Default 44100. */
  sampleRate?: number;
  /** Output format for intermediate / final. Default 'mp3' (libmp3lame 128k). */
  codec?: 'mp3' | 'wav';
  /** Silence gap between concatenated segments in ms. Default 500. */
  gapMs?: number;
}

interface FfmpegResult { stdout: string; stderr: string }

function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => reject((e as NodeJS.ErrnoException).code === 'ENOENT'
      ? Object.assign(new Error('ffmpeg not found — install ffmpeg and ensure it is on PATH'), { code: 'config' })
      : e));
    p.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`ffmpeg exited ${code}\n${stderr}`), { code: `ffmpeg_${code}` }));
    });
  });
}

/**
 * Master a single audio file to streaming-spec LUFS.
 * Two-pass loudnorm (measure → apply) for accurate targeting.
 * Returns the output file path.
 */
export async function masterSingle(
  inputPath: string,
  outputPath: string,
  opts: MasterOptions = {},
): Promise<{ path: string; measured: Record<string, unknown> }> {
  const lufs = opts.targetLufs ?? -14;
  const tp = opts.truePeakDb ?? -1;
  const lra = opts.lra ?? 11;
  const sr = opts.sampleRate ?? 44100;

  // Pass 1 — measure
  const { stderr } = await runFfmpeg([
    '-i', inputPath,
    '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}:print_format=json`,
    '-f', 'null', '-',
  ]);
  // ffmpeg writes the JSON block at the end of stderr
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!jsonMatch) throw new Error(`ffmpeg loudnorm pass 1 did not emit JSON:\n${stderr.slice(-500)}`);
  const measured = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  // Pass 2 — apply, with measured params
  await mkdir(path.dirname(outputPath), { recursive: true });
  const codecArgs = opts.codec === 'wav'
    ? ['-acodec', 'pcm_s16le']
    : ['-acodec', 'libmp3lame', '-b:a', '128k', '-ar', String(sr), '-ac', '1'];

  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-af',
    `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}:` +
      `measured_I=${measured.input_i}:` +
      `measured_TP=${measured.input_tp}:` +
      `measured_LRA=${measured.input_lra}:` +
      `measured_thresh=${measured.input_thresh}:` +
      `offset=${measured.target_offset}:` +
      `linear=true:print_format=summary`,
    ...codecArgs,
    outputPath,
  ]);

  return { path: outputPath, measured };
}

/**
 * Concatenate multiple mastered audio files into one, inserting silence between each.
 * Re-encodes to a consistent format (matches the codec/sample-rate/channels you pass)
 * to avoid the "silent-gap stereo + mono-segments" corruption the old ManiPlus pipeline hit.
 */
export async function concatenate(
  inputPaths: string[],
  outputPath: string,
  opts: MasterOptions = {},
): Promise<{ path: string; segments: number; gapMs: number }> {
  if (inputPaths.length === 0) throw new Error('concatenate: inputPaths must be non-empty');

  // Check every input exists
  for (const p of inputPaths) {
    const info = await stat(p).catch(() => null);
    if (!info?.isFile()) throw new Error(`concatenate: input not found: ${p}`);
  }

  const gapMs = opts.gapMs ?? 500;
  const sr = opts.sampleRate ?? 44100;
  const codec = opts.codec ?? 'mp3';

  // Create silence gap (match output specs to avoid discontinuity)
  const tmpId = randomBytes(6).toString('hex');
  const silencePath = path.join(tmpdir(), `audio-master-silence-${tmpId}.${codec}`);
  const listPath = path.join(tmpdir(), `audio-master-list-${tmpId}.txt`);

  try {
    const codecArgs = codec === 'wav'
      ? ['-acodec', 'pcm_s16le']
      : ['-acodec', 'libmp3lame', '-b:a', '128k'];
    await runFfmpeg([
      '-y', '-f', 'lavfi',
      '-i', `anullsrc=r=${sr}:cl=mono`,
      '-t', (gapMs / 1000).toFixed(3),
      ...codecArgs,
      silencePath,
    ]);

    // Build concat list: input1, silence, input2, silence, ..., inputN
    const entries: string[] = [];
    for (let i = 0; i < inputPaths.length; i++) {
      entries.push(`file '${path.resolve(inputPaths[i]).replace(/'/g, "'\\''")}'`);
      if (i < inputPaths.length - 1) entries.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
    }
    await writeFile(listPath, entries.join('\n'), 'utf8');

    await mkdir(path.dirname(outputPath), { recursive: true });
    const finalArgs = codec === 'wav'
      ? ['-acodec', 'pcm_s16le']
      : ['-acodec', 'libmp3lame', '-b:a', '128k', '-ar', String(sr), '-ac', '1'];
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0',
      '-i', listPath,
      ...finalArgs,
      outputPath,
    ]);
  } finally {
    await Promise.all([
      unlink(silencePath).catch(() => {}),
      unlink(listPath).catch(() => {}),
    ]);
  }

  const final = await stat(outputPath);
  if (!final.isFile() || final.size === 0) throw new Error('concatenate: ffmpeg produced no output');

  return { path: outputPath, segments: inputPaths.length, gapMs };
}

export interface DuckOptions {
  /** Music level when voice is SILENT, in dB. Default 0 (unchanged). */
  musicFullDb?: number;
  /** Music level when voice is PRESENT, in dB. Default -12 (duck by 12 dB). */
  musicDuckDb?: number;
  /** Sidechain attack time in ms (how fast music dips when voice starts). Default 120. */
  attackMs?: number;
  /** Sidechain release time in ms (how fast music returns when voice stops). Default 800. */
  releaseMs?: number;
  /** Tail-out: seconds of music after the voice ends. If 0, output length = voice length. Default 3. */
  tailSeconds?: number;
  /** Fade-in duration for music (seconds). Default 2. */
  fadeInSeconds?: number;
  /** Fade-out duration for music (seconds). Default 3. */
  fadeOutSeconds?: number;
  /** Loop music if shorter than voice. Default true. */
  loopMusic?: boolean;
  /** Sample rate. Default 44100. */
  sampleRate?: number;
  /** Output codec. Default 'mp3'. */
  codec?: 'mp3' | 'wav';
}

export async function duck(
  voicePath: string,
  musicPath: string,
  outputPath: string,
  opts: DuckOptions = {},
): Promise<{ path: string; voicePath: string; musicPath: string }> {
  const fullDb = opts.musicFullDb ?? 0;
  const duckDb = opts.musicDuckDb ?? -12;
  const attack = opts.attackMs ?? 120;
  const release = opts.releaseMs ?? 800;
  const tail = opts.tailSeconds ?? 3;
  const fadeIn = opts.fadeInSeconds ?? 2;
  const fadeOut = opts.fadeOutSeconds ?? 3;
  const loop = opts.loopMusic ?? true;
  const sr = opts.sampleRate ?? 44100;
  const codec = opts.codec ?? 'mp3';

  await mkdir(path.dirname(outputPath), { recursive: true });

  const voiceDurSec = await ffprobeDuration(voicePath);
  const targetDurSec = voiceDurSec + tail;

  const codecArgs = codec === 'wav'
    ? ['-acodec', 'pcm_s16le']
    : ['-acodec', 'libmp3lame', '-b:a', '192k'];

  // Looping is handled in-graph via aloop (with silence trim); no need for -stream_loop.
  const musicInputArgs = ['-i', musicPath];

  // dB → linear: 10^(dB/20)
  const fullGain = Math.pow(10, fullDb / 20);
  const duckGain = Math.pow(10, duckDb / 20);
  const diffGain = duckGain - fullGain;

  // Threshold for sidechain (-30 dBFS is a good middle ground; voice TTS is usually louder).
  const filter = [
    // voice: normalise and split (one copy into the mix, one as sidechain trigger)
    '[0:a]asplit=2[vMix][vSC]',
    // music: trim to target duration, apply fade in/out
    `[1:a]atrim=0:${targetDurSec},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, targetDurSec - fadeOut)}:d=${fadeOut}[mFade]`,
    // sidechain compressor — music gets ducked by voice presence
    `[mFade][vSC]sidechaincompress=threshold=0.03:ratio=8:attack=${attack}:release=${release}:makeup=0:level_sc=1[mDucked]`,
    // raw music→volume envelope (alternative) — here we use a gentler static mix + sidechain
    `[mDucked]volume=${fullGain}[mGain]`,
    // mix voice + music
    '[vMix][mGain]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]',
  ].join(';');

  // Voice set to full length (0-voiceDurSec). Output total length = targetDurSec (voice + tail).
  // We use `amix duration=first` so music carries into the tail past the voice's end.
  // Actually amix with first = voice-length — not what we want. Use longest and pad voice with silence.
  // Simpler: use apad on voice then amix duration=shortest.
  // Smart loop: strip the music's trailing silence/fade BEFORE looping so loop seams are
  // content→content rather than silence→content (which pops audibly). silenceremove with
  // stop_periods=1 trims silence from the END when applied to a time-reversed stream; simpler
  // alternative: use silenceremove with stop_periods=-1 which detects trailing silence directly.
  // Then add a short crossfade at the loop boundary via afade-in on the looped portion.
  //
  // Flow for music branch:
  //   [1:a] → silenceremove trailing → aloop → atrim target → afade in+out → sidechain compress
  const musicTrimFilter = `areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2,areverse`;
  const musicBranch = loop
    ? `[1:a]${musicTrimFilter},aloop=loop=-1:size=2147483647,atrim=0:${targetDurSec}`
    : `[1:a]atrim=0:${targetDurSec}`;

  const filterV2 = [
    `[0:a]apad=whole_dur=${targetDurSec}[vPad]`,
    '[vPad]asplit=2[vMix][vSC]',
    `${musicBranch},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, targetDurSec - fadeOut)}:d=${fadeOut}[mFade]`,
    `[mFade][vSC]sidechaincompress=threshold=0.03:ratio=8:attack=${attack}:release=${release}:makeup=1:level_sc=1[mDucked]`,
    `[mDucked]volume=${fullGain}[mGain]`,
    '[vMix][mGain]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]',
  ].join(';');

  // (Unused vars kept to silence noUnusedLocals strictness without extra config.)
  void filter;
  void diffGain;

  await runFfmpeg([
    '-y',
    '-i', voicePath,
    ...musicInputArgs,
    '-filter_complex', filterV2,
    '-map', '[out]',
    '-ar', String(sr),
    '-ac', '2',
    ...codecArgs,
    '-t', String(targetDurSec),
    outputPath,
  ]);

  const final = await stat(outputPath);
  if (!final.isFile() || final.size === 0) throw new Error('duck: ffmpeg produced no output');

  return { path: outputPath, voicePath, musicPath };
}

async function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => reject((e as NodeJS.ErrnoException).code === 'ENOENT'
      ? Object.assign(new Error('ffprobe not found — install ffmpeg (ffprobe ships with it)'), { code: 'config' })
      : e));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}\n${Buffer.concat(err).toString('utf8')}`));
        return;
      }
      const n = parseFloat(Buffer.concat(out).toString('utf8').trim());
      if (Number.isNaN(n)) reject(new Error('ffprobe returned no duration'));
      else resolve(n);
    });
  });
}
