#!/usr/bin/env bun
// subtitle-burner CLI — take an input video + scripts + audio, generate TikTok-style ASS, burn into video
// Usage:
//   subtitle-burner --video in.mp4 --scripts scripts.json --output out.mp4 [--aspect 9:16] [--style default|alt]
//   scripts.json: [{ text: "Alright alright", speaker: "hal", audioPath: "/path/to/p1-s05-hal.mp3" }, ...]

import { transcribeWithWordTimestamps, alignScriptToWhisper } from './whisper.ts';
import { chunkWords, generateAss, defaultStyle } from './ass-gen.ts';
import { writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type ScriptSeg = { text: string; speaker: string; audioPath?: string; startHint?: number; endHint?: number };

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1];
    args[k] = v;
    i++;
  }
}

const video = args.video;
const scriptsPath = args.scripts;
const output = args.output;
const aspect = args.aspect || '9:16';
const styleName = args.style || 'default';
const chunkSize = args['chunk-size'] ? parseInt(args['chunk-size'], 10) : 3;
const popInMs = args['pop-in-ms'] ? parseInt(args['pop-in-ms'], 10) : 100;
const noSpeakerChip = args['no-speaker-chip'] !== undefined;
const endPadMs = args['end-pad-ms'] ? parseInt(args['end-pad-ms'], 10) : 120;

if (!video || !output) {
  console.error('Usage: subtitle-burner --video in.mp4 --output out.mp4 [--scripts scripts.json] [--aspect 9:16] [--style default] [--chunk-size 3] [--pop-in-ms 100] [--end-pad-ms 120] [--no-speaker-chip]');
  process.exit(1);
}

const [w, h] = aspect === '9:16' ? [1080, 1920] : [1280, 720];

function runCmd(cmd: string, cmdArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('exit', code => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${err}`));
    });
  });
}

async function main() {
  // 1. Extract audio from the video for Whisper
  const audioTmp = join(tmpdir(), `sb-audio-${Date.now()}.wav`);
  await runCmd('ffmpeg', ['-y', '-i', video, '-vn', '-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1', audioTmp]);
  process.stderr.write(`  ✓ extracted audio\n`);

  // 2. Run Whisper for word timestamps
  const whisperWords = await transcribeWithWordTimestamps(audioTmp);
  process.stderr.write(`  ✓ whisper returned ${whisperWords.length} words\n`);

  // 3. Read scripts and align
  let words = whisperWords;
  if (scriptsPath) {
    const scriptsRaw = await readFile(scriptsPath, 'utf-8');
    const scripts: ScriptSeg[] = JSON.parse(scriptsRaw);
    words = alignScriptToWhisper(whisperWords, scripts);
    process.stderr.write(`  ✓ aligned ${words.length} script words to whisper timing\n`);
  }

  // 4. Chunk into N-word groups (default 3, CLI --chunk-size overrides; 1 = per-word reveal)
  const chunks = chunkWords(words, chunkSize);
  // Extend each chunk end by endPadMs so last word doesn't disappear before speech trails off
  for (const c of chunks) {
    c.end = c.end + (endPadMs / 1000);
  }
  process.stderr.write(`  ✓ chunked into ${chunks.length} TikTok-style groups (chunkSize=${chunkSize}, endPad=${endPadMs}ms)\n`);

  // 5. Generate ASS
  const style = { ...defaultStyle, resolution_w: w, resolution_h: h, pop_in_ms: popInMs };
  if (aspect === '16:9') {
    style.font_size = 48;
    style.speaker_chip_font_size = 24;
  }
  if (noSpeakerChip) {
    style.speaker_chip = false;
  }
  // Per-speaker colours for Example Show (v18 locked palette)
  if (styleName === 'default') {
    style.speaker_colours = {
      narrator: '#FFFFFF',
      merl: '#E8A765',    // amber
      hal: '#FF6B4A',     // coral (gorilla energy)
      booker: '#B8D87A',  // pale leaf green
      arlo: '#D4A4DF',    // soft lilac
      cass: '#C49A6C',    // sand
      rem: '#FF9A52',     // orange (bandana red adjacent)
      otto: '#7BB2D6',    // cool blue (sunglasses vibe)
      pip: '#A0A0A0',     // grey
      ras: '#E8D26A',     // golden
      default: '#E8A765',
    };
  }

  const ass = generateAss(chunks, style);
  const assTmp = join(tmpdir(), `sb-subs-${Date.now()}.ass`);
  await writeFile(assTmp, ass);
  process.stderr.write(`  ✓ wrote ASS to ${assTmp}\n`);

  // 6. Burn subtitles into video
  await runCmd('ffmpeg', [
    '-y', '-i', video,
    '-vf', `subtitles=${assTmp}:force_style='FontName=${style.font}'`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'copy',
    output,
  ]);
  process.stderr.write(`  ✓ burned subtitles → ${output}\n`);

  // 7. Print chunk summary
  console.log(JSON.stringify({ ok: true, chunks: chunks.length, output, assPath: assTmp }));
}

main().catch(e => { console.error(e); process.exit(1); });
