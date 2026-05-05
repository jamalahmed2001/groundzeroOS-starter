// TikTok-style animated ASS subtitle generator
// Input: word-level transcript (Whisper-style), output: ASS file ready for ffmpeg subtitles filter

export type Word = { word: string; start: number; end: number; speaker?: string };
export type Chunk = { words: Word[]; start: number; end: number; emphasis_idx?: number; speaker?: string };

export type StyleConfig = {
  font: string;
  font_size: number;
  primary_fill: string;      // "#FFFFFF"
  primary_stroke: string;    // "#000000"
  stroke_width: number;
  emphasis_fill: string;     // "#FFDF1A"
  margin_bottom_pct: number; // 17 → 17% from bottom
  pop_in_ms: number;
  pop_in_scale_from: number; // 0.8
  speaker_chip: boolean;
  speaker_chip_font_size: number;
  speaker_colours: Record<string, string>;  // { narrator: "#FFFFFF", hal: "#FF6B4A", merl: "#E8A765", ... }
  resolution_w: number;
  resolution_h: number;
};

const defaultStyle: StyleConfig = {
  font: 'DejaVu Sans Bold',
  font_size: 68,
  primary_fill: '#FFFFFF',
  primary_stroke: '#000000',
  stroke_width: 4,
  emphasis_fill: '#FFDF1A',
  margin_bottom_pct: 17,
  pop_in_ms: 100,
  pop_in_scale_from: 0.8,
  speaker_chip: true,
  speaker_chip_font_size: 32,
  speaker_colours: { narrator: '#FFFFFF', default: '#E8A765' },
  resolution_w: 1080,
  resolution_h: 1920,
};

// ASS uses BGR ordering in &HBBGGRR& format
function toAssColour(hex: string): string {
  const h = hex.replace('#', '');
  const r = h.substring(0, 2);
  const g = h.substring(2, 4);
  const b = h.substring(4, 6);
  return `&H00${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

// Chunk words into 2-3 word groups at natural breaks
export function chunkWords(words: Word[], maxChunkSize = 3): Chunk[] {
  if (!words.length) return [];
  const chunks: Chunk[] = [];
  let current: Word[] = [];
  const ACCENT_PUNCT = /[.!?,;:—–]$/;
  const PAUSE_GAP_S = 0.25;  // 250ms silence triggers chunk break

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);
    const nextW = words[i + 1];
    const shouldBreak = (
      current.length >= maxChunkSize ||
      ACCENT_PUNCT.test(w.word) ||
      (nextW && (nextW.start - w.end) > PAUSE_GAP_S) ||
      (nextW && nextW.speaker && w.speaker && nextW.speaker !== w.speaker)
    );
    if (shouldBreak || i === words.length - 1) {
      // Pick emphasis word: longest word in chunk, or last word if ends with punct
      let emphIdx = 0;
      let maxLen = 0;
      for (let j = 0; j < current.length; j++) {
        const cleanLen = current[j].word.replace(/[^\w]/g, '').length;
        if (cleanLen > maxLen) { maxLen = cleanLen; emphIdx = j; }
      }
      chunks.push({
        words: current,
        start: current[0].start,
        end: current[current.length - 1].end,
        emphasis_idx: emphIdx,
        speaker: current[0].speaker,
      });
      current = [];
    }
  }
  return chunks;
}

export function generateAss(chunks: Chunk[], style: StyleConfig = defaultStyle): string {
  const marginV = Math.floor((style.margin_bottom_pct / 100) * style.resolution_h);
  const chipMarginV = marginV + style.font_size + 20;

  const lines: string[] = [];
  lines.push('[Script Info]');
  lines.push('Title: My Show Subtitle Track');
  lines.push('ScriptType: v4.00+');
  lines.push('Collisions: Normal');
  lines.push(`PlayResX: ${style.resolution_w}`);
  lines.push(`PlayResY: ${style.resolution_h}`);
  lines.push('WrapStyle: 2');
  lines.push('');
  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  lines.push(`Style: Default,${style.font},${style.font_size},${toAssColour(style.primary_fill)},&H000000FF,${toAssColour(style.primary_stroke)},&H00000000,-1,0,0,0,100,100,0,0,1,${style.stroke_width},0,2,40,40,${marginV},1`);
  lines.push(`Style: Emphasis,${style.font},${style.font_size},${toAssColour(style.emphasis_fill)},&H000000FF,${toAssColour(style.primary_stroke)},&H00000000,-1,0,0,0,100,100,0,0,1,${style.stroke_width},0,2,40,40,${marginV},1`);
  if (style.speaker_chip) {
    lines.push(`Style: SpeakerChip,${style.font},${style.speaker_chip_font_size},${toAssColour(style.speaker_colours.default || '#E8A765')},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,2,40,40,${chipMarginV},1`);
  }
  lines.push('');
  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  const popFrom = Math.floor(style.pop_in_scale_from * 100);
  let lastSpeaker = '';

  for (const chunk of chunks) {
    const start = toAssTime(chunk.start);
    const end = toAssTime(chunk.end);
    const textParts: string[] = [];
    for (let i = 0; i < chunk.words.length; i++) {
      const w = chunk.words[i];
      const isEmph = i === chunk.emphasis_idx;
      // \fad(in,out) + \t(start_ms, end_ms, \fscx100\fscy100) for pop-in
      const popTag = `{\\fscx${popFrom}\\fscy${popFrom}\\t(0,${style.pop_in_ms},\\fscx100\\fscy100)\\fad(80,80)}`;
      const colourTag = isEmph ? `{\\c${toAssColour(style.emphasis_fill)}}` : '';
      const resetTag = isEmph ? `{\\c${toAssColour(style.primary_fill)}}` : '';
      // Per-word chunks would require rendering each word as its own dialogue line at its own timing.
      // For simplicity, we render the whole chunk together with the emphasis word colour-flipped.
      textParts.push(`${i === 0 ? popTag : ''}${colourTag}${w.word}${resetTag}`);
    }
    const text = textParts.join(' ');
    lines.push(`Dialogue: 1,${start},${end},Default,,0,0,0,,${text}`);

    // Speaker chip
    if (style.speaker_chip && chunk.speaker && chunk.speaker !== 'narrator' && chunk.speaker !== lastSpeaker) {
      const chipColour = style.speaker_colours[chunk.speaker.toLowerCase()] || style.speaker_colours.default || '#E8A765';
      const chipText = `{\\c${toAssColour(chipColour)}\\fad(80,80)}${chunk.speaker.toUpperCase()}`;
      lines.push(`Dialogue: 0,${start},${end},SpeakerChip,,0,0,0,,${chipText}`);
      lastSpeaker = chunk.speaker;
    }
  }

  return lines.join('\n');
}

export { defaultStyle };
