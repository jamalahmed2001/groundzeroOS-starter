import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Mock child_process.spawn — every call pulls the next scripted ffmpeg result
interface ScriptedResult { stderr: string; stdout?: string; exitCode?: number }
const ffmpegQueue: ScriptedResult[] = [];
const spawnCalls: string[][] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[]) => {
    spawnCalls.push(args);
    const next = ffmpegQueue.shift() ?? { stderr: '', exitCode: 0 };
    const proc = new EventEmitter() as EventEmitter & {
      stdout: PassThrough; stderr: PassThrough;
    };
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    // Fire data + close on next tick so listeners are attached
    setImmediate(() => {
      if (next.stdout) proc.stdout.write(next.stdout);
      if (next.stderr) proc.stderr.write(next.stderr);
      proc.stdout.end();
      proc.stderr.end();
      proc.emit('close', next.exitCode ?? 0);
    });
    return proc;
  }),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink:    vi.fn().mockResolvedValue(undefined),
  stat:      vi.fn().mockResolvedValue({ isFile: () => true, size: 12345 }),
  mkdir:     vi.fn().mockResolvedValue(undefined),
}));

import { masterSingle, concatenate } from '../src/client.js';

beforeEach(() => {
  ffmpegQueue.length = 0;
  spawnCalls.length = 0;
});

const FAKE_JSON_BLOCK = `
Some ffmpeg preamble...
[Parsed_loudnorm_0 @ 0x5555]
{
    "input_i" : "-23.10",
    "input_tp" : "-5.40",
    "input_lra" : "7.30",
    "input_thresh" : "-33.10",
    "output_i" : "-14.00",
    "output_tp" : "-1.00",
    "output_lra" : "7.20",
    "output_thresh" : "-24.01",
    "normalization_type" : "dynamic",
    "target_offset" : "0.15"
}
`;

describe('masterSingle', () => {
  it('runs two ffmpeg passes: measure + apply, and returns measured values', async () => {
    ffmpegQueue.push({ stderr: FAKE_JSON_BLOCK });  // pass 1 — measure
    ffmpegQueue.push({ stderr: 'summary ok' });      // pass 2 — apply

    const result = await masterSingle('./in.mp3', './out.mp3');

    expect(result.path).toBe('./out.mp3');
    expect(result.measured.input_i).toBe('-23.10');
    expect(result.measured.target_offset).toBe('0.15');
    expect(spawnCalls).toHaveLength(2);

    // Pass 1 args include -f null and print_format=json
    const pass1 = spawnCalls[0].join(' ');
    expect(pass1).toContain('print_format=json');
    expect(pass1).toContain('-f null');

    // Pass 2 args include measured_I/TP/LRA/thresh + offset + linear=true
    const pass2 = spawnCalls[1].join(' ');
    expect(pass2).toContain('measured_I=-23.10');
    expect(pass2).toContain('measured_TP=-5.40');
    expect(pass2).toContain('measured_LRA=7.30');
    expect(pass2).toContain('measured_thresh=-33.10');
    expect(pass2).toContain('offset=0.15');
    expect(pass2).toContain('linear=true');
  });

  it('applies custom target-lufs / true-peak / lra to both passes', async () => {
    ffmpegQueue.push({ stderr: FAKE_JSON_BLOCK });
    ffmpegQueue.push({ stderr: '' });

    await masterSingle('./in.mp3', './out.mp3', { targetLufs: -23, truePeakDb: -2, lra: 9 });

    expect(spawnCalls[0].join(' ')).toContain('I=-23:TP=-2:LRA=9');
    expect(spawnCalls[1].join(' ')).toContain('I=-23:TP=-2:LRA=9');
  });

  it('selects wav codec when opts.codec === "wav"', async () => {
    ffmpegQueue.push({ stderr: FAKE_JSON_BLOCK });
    ffmpegQueue.push({ stderr: '' });

    await masterSingle('./in.mp3', './out.wav', { codec: 'wav' });

    const pass2 = spawnCalls[1];
    expect(pass2).toContain('pcm_s16le');
    expect(pass2).not.toContain('libmp3lame');
  });

  it('throws config error when ffmpeg is not installed (ENOENT)', async () => {
    // Override the mock for this single call — simulate ENOENT
    const { spawn } = await import('node:child_process');
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      setImmediate(() => {
        const err = new Error('spawn ffmpeg ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        proc.emit('error', err);
      });
      return proc;
    });

    await expect(masterSingle('./in.mp3', './out.mp3')).rejects.toMatchObject({ code: 'config' });
  });

  it('throws when pass 1 stderr contains no JSON block', async () => {
    ffmpegQueue.push({ stderr: 'no json here, just garbage' });

    await expect(masterSingle('./in.mp3', './out.mp3'))
      .rejects.toThrow(/did not emit JSON/);
  });

  it('throws with ffmpeg exit code when pass 1 fails', async () => {
    ffmpegQueue.push({ stderr: 'fatal error', exitCode: 1 });

    await expect(masterSingle('./in.mp3', './out.mp3'))
      .rejects.toMatchObject({ code: 'ffmpeg_1' });
  });
});

describe('concatenate', () => {
  it('builds silence + concat list, re-encodes, returns segment count', async () => {
    ffmpegQueue.push({ stderr: '' });  // silence
    ffmpegQueue.push({ stderr: '' });  // concat

    const result = await concatenate(['./a.mp3', './b.mp3', './c.mp3'], './out.mp3');

    expect(result.segments).toBe(3);
    expect(result.gapMs).toBe(500);
    expect(result.path).toBe('./out.mp3');
    expect(spawnCalls).toHaveLength(2);

    // Silence pass uses anullsrc + mono
    const silenceArgs = spawnCalls[0].join(' ');
    expect(silenceArgs).toContain('anullsrc');
    expect(silenceArgs).toContain('cl=mono');

    // Concat pass uses -f concat -safe 0 and re-encodes (not -c copy)
    const concatArgs = spawnCalls[1].join(' ');
    expect(concatArgs).toContain('-f concat');
    expect(concatArgs).toContain('-safe 0');
    expect(concatArgs).toContain('libmp3lame');
    expect(concatArgs).not.toContain('-c copy');
  });

  it('custom gap-ms flows through to silence duration', async () => {
    ffmpegQueue.push({ stderr: '' });
    ffmpegQueue.push({ stderr: '' });

    await concatenate(['./a.mp3', './b.mp3'], './out.mp3', { gapMs: 1200 });

    const silenceArgs = spawnCalls[0].join(' ');
    // 1200ms = 1.200s
    expect(silenceArgs).toContain('1.200');
  });

  it('throws on empty input list', async () => {
    await expect(concatenate([], './out.mp3'))
      .rejects.toThrow(/non-empty/);
  });

  it('throws when an input file is missing', async () => {
    const fs = await import('node:fs/promises');
    (fs.stat as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isFile: () => false } as never);

    await expect(concatenate(['./missing.mp3'], './out.mp3'))
      .rejects.toThrow(/input not found/);
  });

  it('throws when ffmpeg produces an empty output file', async () => {
    ffmpegQueue.push({ stderr: '' });
    ffmpegQueue.push({ stderr: '' });

    const fs = await import('node:fs/promises');
    const statMock = fs.stat as unknown as ReturnType<typeof vi.fn>;
    // First N calls (input checks) return size 12345; final output check returns size 0
    statMock.mockImplementation(async (p: string) => {
      if (p === './out.mp3') return { isFile: () => true, size: 0 } as never;
      return { isFile: () => true, size: 12345 } as never;
    });

    await expect(concatenate(['./a.mp3', './b.mp3'], './out.mp3'))
      .rejects.toThrow(/produced no output/);
  });

  it('uses wav codec throughout when opts.codec === "wav"', async () => {
    ffmpegQueue.push({ stderr: '' });
    ffmpegQueue.push({ stderr: '' });

    await concatenate(['./a.wav', './b.wav'], './out.wav', { codec: 'wav' });

    const silenceArgs = spawnCalls[0].join(' ');
    const concatArgs = spawnCalls[1].join(' ');
    expect(silenceArgs).toContain('pcm_s16le');
    expect(concatArgs).toContain('pcm_s16le');
    expect(silenceArgs).not.toContain('libmp3lame');
    expect(concatArgs).not.toContain('libmp3lame');
  });
});
