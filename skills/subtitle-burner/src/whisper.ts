// Whisper word-timestamp extraction via fal-ai/wizper (or fal-ai/whisper)
import { resolveKey } from '../../fal/src/accounts.js';
import { submit, awaitCompletion, uploadFile } from '../../fal/src/client.js';
import { Word } from './ass-gen.ts';

export async function transcribeWithWordTimestamps(audioPath: string, accountRef = 'default'): Promise<Word[]> {
  const key = await resolveKey(accountRef);
  const audioUrl = await uploadFile(key, audioPath);
  const submitted = await submit(key, 'fal-ai/whisper', {
    audio_url: audioUrl,
    task: 'transcribe',
    chunk_level: 'word',
    language: 'en',
  });
  const result: any = await awaitCompletion(key, submitted, { timeoutMs: 600000, pollIntervalMs: 4000, onStatus: () => {} });
  // fal-ai/whisper returns { text, chunks: [{text, timestamp: [start, end]}] } at word level when chunk_level=word
  const chunks = result?.chunks || [];
  const words: Word[] = chunks.map((c: any) => ({
    word: (c.text || '').trim(),
    start: c.timestamp?.[0] ?? 0,
    end: c.timestamp?.[1] ?? 0,
  })).filter((w: Word) => w.word.length > 0);
  return words;
}

// Align Whisper timing to a known script text (replace mis-heard words with canonical script)
// scriptSegments is list of { text, speaker, start_hint?, end_hint? } — ordered
// Returns Words with speaker attribution
export function alignScriptToWhisper(
  whisperWords: Word[],
  scriptSegments: Array<{ text: string; speaker: string; startHint?: number; endHint?: number }>,
): Word[] {
  // Simple approach: split each script segment into words, then allocate whisper timestamps proportionally within that segment's whisper-detected span
  const out: Word[] = [];
  let whisperIdx = 0;
  for (const seg of scriptSegments) {
    const scriptWords = seg.text.split(/\s+/).filter(Boolean);
    // Find whisper words within this segment's time range (using hints if provided)
    const segStart = seg.startHint ?? (whisperIdx < whisperWords.length ? whisperWords[whisperIdx].start : 0);
    let segWhisper: Word[] = [];
    while (whisperIdx < whisperWords.length) {
      const w = whisperWords[whisperIdx];
      if (seg.endHint && w.start >= seg.endHint) break;
      segWhisper.push(w);
      whisperIdx++;
      if (segWhisper.length >= scriptWords.length) break;
    }
    // Distribute script words across the whisper span
    if (!segWhisper.length) continue;
    const spanStart = segWhisper[0].start;
    const spanEnd = segWhisper[segWhisper.length - 1].end;
    const spanDur = Math.max(spanEnd - spanStart, 0.1);
    const perWord = spanDur / scriptWords.length;
    for (let i = 0; i < scriptWords.length; i++) {
      out.push({
        word: scriptWords[i],
        start: spanStart + i * perWord,
        end: spanStart + (i + 1) * perWord,
        speaker: seg.speaker,
      });
    }
  }
  return out;
}
