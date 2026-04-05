import matter from 'gray-matter';
import type { PhaseNode, VaultBundle } from '../vault/reader.js';
import { readPhaseNode } from '../vault/reader.js';
import type { ControllerConfig } from '../config/load.js';
import { notify } from '../notify/notify.js';
import { appendToLog, writeFile, deriveLogNotePath } from '../vault/writer.js';
import { chatCompletion } from '../llm/client.js';
import path from 'path';
import fs from 'fs';

const CONSOLIDATE_SYSTEM_PROMPT = `You are a knowledge curator. Given a phase log and phase note from a software project, extract structured learnings into three categories.

The phase may be completed or blocked/failed — extract knowledge from BOTH outcomes.

Output ONLY a valid JSON object — no prose, no markdown fences:
{
  "learnings": ["useful pattern or technique that worked — 1-2 sentences each, 2-5 items"],
  "decisions": ["architectural or design decision made — format: 'Chose X over Y because Z', 1-3 items or empty array"],
  "gotchas": ["something that failed, surprised, or blocked progress — format: 'X fails when Y, use Z instead', 1-3 items or empty array"]
}

Rules:
- Be concrete and specific — not vague generalities
- decisions: capture choices that would affect future phases (library, pattern, schema, approach)
- gotchas: capture failure modes, API quirks, constraints, blockers discovered during execution
- learnings: general reusable techniques and approaches
- For blocked/failed phases: focus on gotchas and what caused the block
- If a category has nothing worth capturing, return an empty array for it`;

// P3: read phase log, summarise learnings via LLM, append to Knowledge.md.
export async function consolidatePhase(
  phaseNode: PhaseNode,
  bundle: VaultBundle,
  runId: string,
  config: ControllerConfig
): Promise<void> {
  const projectId = String(phaseNode.frontmatter['project'] ?? bundle.projectId);
  const phaseLabel = String(phaseNode.frontmatter['phase_name'] ?? path.basename(phaseNode.path, '.md'));
  const phaseNumber = phaseNode.frontmatter['phase_number'] ?? 0;

  const logNotePath = deriveLogNotePath(phaseNode.path, phaseNode.frontmatter);
  const logNode = readPhaseNode(logNotePath);
  const logContent = logNode.exists ? logNode.raw : `No log for: ${phaseLabel}`;

  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    appendToLog(phaseNode.path, { runId, event: 'consolidate_done', detail: 'Skipped: no API key' });
    return;
  }

  try {
    const rawOutput = await chatCompletion({
      model: config.llm.model,
      apiKey,
      baseUrl: config.llm.baseUrl,
      maxTokens: 1024,
      messages: [
        { role: 'system', content: config.prompts?.consolidate ?? CONSOLIDATE_SYSTEM_PROMPT },
        { role: 'user', content: `Phase: ${phaseLabel}\n\nPhase note:\n${phaseNode.raw}\n\nExecution log:\n${logContent}\n\nExtract learnings.` },
      ],
    });

    // Parse structured JSON output
    let extracted: { learnings: string[]; decisions: string[]; gotchas: string[] };
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]+\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { learnings: [], decisions: [], gotchas: [] };
    } catch {
      // Fallback: treat raw output as a single learning
      extracted = { learnings: [rawOutput.trim()], decisions: [], gotchas: [] };
    }

    const knowledgePath = bundle.knowledge.path;
    const knowledgeNode = readPhaseNode(knowledgePath);

    let knowledgeContent: string;
    let knowledgeFrontmatter: Record<string, unknown>;

    if (knowledgeNode.exists) {
      knowledgeContent = knowledgeNode.content;
      knowledgeFrontmatter = knowledgeNode.frontmatter;
    } else {
      knowledgeContent = '# Knowledge\n\n';
      knowledgeFrontmatter = { type: 'knowledge', project: projectId };
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const phaseRef = `_${timestamp} — P${phaseNumber}: ${phaseLabel}_`;

    // Append each non-empty category to its own section
    function appendSection(content: string, heading: string, items: string[]): string {
      if (items.length === 0) return content;
      const block = `\n\n${phaseRef}\n${items.map(i => `- ${i}`).join('\n')}`;
      if (new RegExp(`## ${heading}`).test(content)) {
        return content.replace(
          new RegExp(`(## ${heading}[\\s\\S]*?)(\\n##|$)`),
          `$1${block}\n$2`
        );
      }
      return content.trimEnd() + `\n\n## ${heading}\n${block}\n`;
    }

    knowledgeContent = appendSection(knowledgeContent, 'Learnings', extracted.learnings);
    knowledgeContent = appendSection(knowledgeContent, 'Decisions', extracted.decisions);
    knowledgeContent = appendSection(knowledgeContent, 'Gotchas', extracted.gotchas);

    writeFile(knowledgePath, matter.stringify(knowledgeContent, knowledgeFrontmatter));

    // Attempt to write broadly-applicable items to cross-project knowledge (best-effort)
    const crossProjectPath = path.join(config.vaultRoot, '08 - System', 'Cross-Project Knowledge.md');
    const allItems = [...extracted.learnings, ...extracted.gotchas];
    if (fs.existsSync(crossProjectPath) && allItems.length > 0) {
      try {
        const crossPrompt = `You are reviewing learnings from project "${projectId}". Identify any items that would be useful to other unrelated projects (general patterns, debugging approaches, architectural principles). Return ONLY items that are truly general — skip project-specific details. Format as bullet points starting with "- ". If nothing is broadly applicable, return empty string.\n\nItems:\n${allItems.map(i => `- ${i}`).join('\n')}`;
        const crossResult = await chatCompletion({
          model: config.llm.model,
          apiKey,
          baseUrl: config.llm.baseUrl,
          maxTokens: 300,
          messages: [{ role: 'user', content: crossPrompt }],
        });
        if (crossResult.trim()) {
          const entry = `\n### From ${projectId} (${timestamp})\n\n${crossResult}\n`;
          fs.appendFileSync(crossProjectPath, entry, 'utf-8');
        }
      } catch { /* non-fatal */ }
    }

    const sections = [
      extracted.learnings.length > 0 ? `${extracted.learnings.length} learnings` : '',
      extracted.decisions.length > 0 ? `${extracted.decisions.length} decisions` : '',
      extracted.gotchas.length > 0   ? `${extracted.gotchas.length} gotchas`   : '',
    ].filter(Boolean).join(', ');

    appendToLog(phaseNode.path, { runId, event: 'consolidate_done', detail: `Knowledge updated: ${sections || 'nothing extracted'}` });
    await notify({ event: 'consolidate_done', projectId, phaseLabel, detail: 'Phase consolidated', runId }, config);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    appendToLog(phaseNode.path, { runId, event: 'consolidate_done', detail: `Failed: ${detail}` });
  }
}
