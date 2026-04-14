#!/usr/bin/env node
// onyx monthly-consolidate
// LLM-based monthly consolidation of Daily Plans into a single Monthly Overview note.
//
// Goals:
// - Produce a human-readable monthly review (no links back to daily notes)
// - Safe to delete daily notes after
// - Optional: move source dailies into archive ("prune") rather than hard delete

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../config/load.js';
import { chatCompletion } from '../llm/client.js';

function parseMonthArg(args: string[]): { month?: string; rest: string[] } {
  const idx = args.findIndex(a => /^\d{4}-\d{2}$/.test(a));
  if (idx >= 0) {
    const month = args[idx];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
    return { month, rest };
  }
  return { month: undefined, rest: args };
}

function prevMonthYYYYMM(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m! - 1), 1));
  return dt.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function readDailyFiles(vaultRoot: string, ym: string): string[] {
  const planningDir = path.join(vaultRoot, '04 - Planning');
  const legacyDir = path.join(vaultRoot, '09 - Archive', 'Daily Archive (Legacy)');

  const wantedPrefix = `Daily - ${ym}-`;

  const fromDir = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.startsWith(wantedPrefix) && f.endsWith('.md'))
      .map(f => path.join(dir, f))
      .sort();
  };

  const primary = fromDir(planningDir);
  if (primary.length > 0) return primary;
  return fromDir(legacyDir);
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + '\n---'.length);
}

function reduceNoise(md: string): string {
  // remove prayer times blocks + schedule blocks + budgets blocks (common headings)
  const s = stripFrontmatter(md);
  const blocksToDrop = [
    /##\s+Prayer Times[\s\S]*?(?=\n##\s|$)/gi,
    /##\s+Schedule\s*\(mode:[\s\S]*?(?=\n##\s|$)/gi,
    /##\s+Project Time Budgets[\s\S]*?(?=\n##\s|$)/gi,
  ];
  let out = s;
  for (const re of blocksToDrop) out = out.replace(re, '');
  // remove stray UP lines
  out = out.replace(/^UP:\s.*$/gmi, '');
  return out.trim();
}

type ChunkSummary = {
  dateRange: string;
  achievements: string[];
  decisions: string[];
  learnings: string[];
  gotchas: string[];
  openLoops: string[];
};

async function summariseChunk(config: ReturnType<typeof loadConfig>, label: string, chunk: { file: string; content: string }[]): Promise<ChunkSummary> {
  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('No LLM api key configured (OPENROUTER_API_KEY or onyx config)');

  const chunkText = chunk.map(c => {
    const base = path.basename(c.file, '.md');
    const day = base.replace('Daily - ', '');
    // Cap per file to avoid huge prompts
    const clipped = c.content.slice(0, 8000);
    return `\n\n=== ${day} ===\n${clipped}`;
  }).join('');

  const system = `You are a ruthless monthly-review consolidator.
Return ONLY valid JSON (no markdown fences):
{
  "dateRange": "YYYY-MM-DD..YYYY-MM-DD",
  "achievements": ["..."],
  "decisions": ["Chose X over Y because Z"],
  "learnings": ["..."],
  "gotchas": ["X fails when Y; use Z"],
  "openLoops": ["..." ]
}
Rules:
- Be concrete, keep items short but specific.
- Extract implicit learnings/decisions even if not explicitly labelled.
- No filler.`;

  const user = `Month: ${label}\n\nDaily plans (chunk):${chunkText}\n\nExtract consolidation JSON.`;

  const raw = await chatCompletion({
    model: config.llm.model,
    apiKey,
    baseUrl: config.llm.baseUrl,
    maxTokens: 1200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const match = raw.match(/\{[\s\S]+\}/);
  if (!match) {
    // Fallback: preserve signal instead of failing the whole consolidation.
    return {
      dateRange: 'unknown',
      achievements: [],
      decisions: [],
      learnings: [raw.trim().slice(0, 400)],
      gotchas: [],
      openLoops: [],
    };
  }
  try {
    return JSON.parse(match[0]) as ChunkSummary;
  } catch {
    return {
      dateRange: 'unknown',
      achievements: [],
      decisions: [],
      learnings: [match[0].trim().slice(0, 400)],
      gotchas: [],
      openLoops: [],
    };
  }
}

async function mergeSummaries(config: ReturnType<typeof loadConfig>, label: string, ym: string, summaries: ChunkSummary[]): Promise<string> {
  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('No LLM api key configured (OPENROUTER_API_KEY or onyx config)');

  const febTemplatePath = path.join(config.vaultRoot, '09 - Archive', 'February 2026 - Monthly Overview.md');
  const template = fs.existsSync(febTemplatePath) ? fs.readFileSync(febTemplatePath, 'utf-8') : '';

  const payload = JSON.stringify(summaries);

  const system = `You are compiling an Obsidian monthly overview.
Write a human-readable monthly review that preserves all important information after daily plans are deleted.
Do NOT include links back to the daily notes.
Keep it tight, skimmable, and structured.
Use the February 2026 overview as style reference when helpful.`;

  const user = `Target month: ${label} (${ym})

Style reference (February 2026 overview):
${template.slice(0, 12000)}

Extracted chunk summaries JSON:
${payload}

Now write the final consolidated monthly overview as markdown.
IMPORTANT:
- Do NOT include YAML frontmatter.
- Do NOT include the title heading or navigation section (I will add them).
- Do NOT wrap the output in code fences.

Include sections:
- 📊 Monthly Summary
- 🎯 Key Achievements
- 🧠 Strategic Decisions
- 🔄 Recurring Patterns
- 💡 Key Learnings
- ⚠️ Gotchas
- Open loops / Next month handoff

Output markdown only.`;

  let md = await chatCompletion({
    model: config.llm.model,
    apiKey,
    baseUrl: config.llm.baseUrl,
    maxTokens: 2200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  // Strip common markdown fences if the model wraps the answer.
  md = md.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // Remove any frontmatter the model may have included.
  md = md.replace(/^---[\s\S]*?---\s*/m, '').trim();

  // Remove duplicated title + navigation if the model still included them.
  md = md.replace(new RegExp(`^#\\s+${label.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\s+-\\s+Monthly\\s+Overview\\s*\\n+`, 'i'), '');
  md = md.replace(/^##\s+🔗\s+Navigation[\s\S]*?---\s*/i, '');

  // Ensure some frontmatter exists (minimal)
  const frontmatter = `---\ntags: [monthly-review, consolidated]\ngraph_domain: review\ncreated: ${new Date().toISOString().slice(0, 10)}\nstatus: complete\nproject: Monthly Planning\n---\n\n`;
  const title = `# ${label} - Monthly Overview\n\n`;
  const nav = `## 🔗 Navigation\n\n**UP:** [[04 - Planning/Monthly Overviews Hub.md|Monthly Overviews Hub]]\n\n---\n\n`;

  return frontmatter + title + nav + md + (md.endsWith('\n') ? '' : '\n');
}

function ensureHubLink(vaultRoot: string, outName: string): void {
  const hub = path.join(vaultRoot, '04 - Planning', 'Monthly Overviews Hub.md');
  if (!fs.existsSync(hub)) return;
  const link = `- [[09 - Archive/${outName}]]`;
  const text = fs.readFileSync(hub, 'utf-8');
  if (text.includes(link)) return;
  const replaced = text.replace(/## Monthly Overviews\n/, `## Monthly Overviews\n\n${link}\n`);
  fs.writeFileSync(hub, replaced, 'utf-8');
}

function pruneDailies(vaultRoot: string, ym: string, files: string[], hardDelete: boolean): void {
  if (hardDelete) {
    for (const f of files) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    return;
  }
  const dest = path.join(vaultRoot, '09 - Archive', 'Daily Archive', ym);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    const base = path.basename(f);
    const target = path.join(dest, base);
    fs.renameSync(f, fs.existsSync(target) ? path.join(dest, `${base}.${Date.now()}`) : target);
  }
}

export async function runMonthlyConsolidate(args: string[]): Promise<void> {
  const { month, rest } = parseMonthArg(args);
  const ym = month ?? prevMonthYYYYMM();
  const label = monthLabel(ym);

  const prune = rest.includes('--prune');
  const hardDelete = rest.includes('--delete-dailies');
  const keepNoise = rest.includes('--keep-noise');

  const config = loadConfig();
  const vaultRoot = config.vaultRoot;

  const dailyFiles = readDailyFiles(vaultRoot, ym);
  if (dailyFiles.length === 0) {
    console.log(`[onyx] No daily plans found for ${ym}`);
    return;
  }

  const daily = dailyFiles.map(f => ({
    file: f,
    content: keepNoise ? stripFrontmatter(fs.readFileSync(f, 'utf-8')) : reduceNoise(fs.readFileSync(f, 'utf-8')),
  }));

  // Chunk to avoid token blowups
  const chunkSize = 6;
  const chunks: { file: string; content: string }[][] = [];
  for (let i = 0; i < daily.length; i += chunkSize) chunks.push(daily.slice(i, i + chunkSize));

  const summaries: ChunkSummary[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[onyx] Summarising chunk ${i + 1}/${chunks.length}…`);
    summaries.push(await summariseChunk(config, label, chunks[i]!));
  }

  console.log('[onyx] Merging summaries…');
  const finalMd = await mergeSummaries(config, label, ym, summaries);

  const outName = `${label} - Monthly Overview.md`;
  const outPath = path.join(vaultRoot, '09 - Archive', outName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, finalMd, 'utf-8');

  // Guardrail: only prune/delete dailies if the monthly file exists and looks non-trivial.
  const size = fs.statSync(outPath).size;
  if (size < 2000) {
    throw new Error(`[onyx] Monthly overview too small (${size} bytes) — refusing to prune dailies.`);
  }

  ensureHubLink(vaultRoot, outName);

  if (prune) {
    pruneDailies(vaultRoot, ym, dailyFiles, hardDelete);
    const mode = hardDelete ? 'DELETED' : 'MOVED';
    console.log(`[onyx] ${mode} ${dailyFiles.length} daily plans (${ym})`);
  }

  console.log(`[onyx] ✅ Wrote: ${outPath}`);
}
