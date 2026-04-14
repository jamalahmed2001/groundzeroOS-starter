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

// Prompt used to evaluate whether new learnings add genuinely new knowledge to the cross-project principles file.
// Returns a JSON array of new principles to add, or [] if everything is already covered.
const CROSS_PROJECT_DEDUP_PROMPT = `You are maintaining a living principles document for a software engineering team.

Given new learnings from a project phase, identify any that represent GENUINELY NEW principles not already captured in the existing document.

EXISTING PRINCIPLES (do not repeat or rephrase these):
---
{EXISTING}
---

NEW LEARNINGS FROM {PROJECT}:
{ITEMS}

A new principle is worth adding if:
- It names a failure mode or pattern NOT already covered above
- It is universal enough to apply to a different project in a different domain
- It would change how a future team member approaches a problem

Do NOT add a principle if:
- It is the same idea as an existing one, even if worded differently
- It is too project-specific to generalise
- It is a restatement of an obvious software practice (e.g., "write tests")

Output ONLY a JSON array. Each object must have:
{
  "name": "5-7 word principle title",
  "rule": "One sharp, universal sentence stating the principle",
  "why": "The failure mode it prevents — what concretely goes wrong without it",
  "first_seen": "{PROJECT} — brief one-line context of what happened"
}

If nothing is genuinely new, return exactly: []`;

// Format a single principle for appending to the cross-project document.
function formatPrinciple(p: { name: string; rule: string; why: string; first_seen: string }): string {
  return `\n---\n\n### ${p.name}\n\n**Rule:** ${p.rule}\n\n**Why it matters:** ${p.why}\n\n**First seen:** ${p.first_seen}\n`;
}

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

    // Attempt to write genuinely new cross-project principles (with deduplication)
    await maybePropagateToGlobalPrinciples({
      config,
      apiKey,
      projectId,
      timestamp,
      learnings: extracted.learnings,
      gotchas: extracted.gotchas,
    });

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

/**
 * Checks whether any new learnings represent genuinely novel cross-project principles
 * not already captured in the global principles file. Only appends if the LLM confirms
 * the principle is new — never blindly appends.
 */
async function maybePropagateToGlobalPrinciples({
  config, apiKey, projectId, timestamp, learnings, gotchas,
}: {
  config: ControllerConfig;
  apiKey: string;
  projectId: string;
  timestamp: string;
  learnings: string[];
  gotchas: string[];
}): Promise<void> {
  const crossProjectPath = path.join(config.vaultRoot, '08 - System', 'Cross-Project Knowledge.md');
  const allItems = [...learnings, ...gotchas];

  if (!fs.existsSync(crossProjectPath) || allItems.length === 0) return;

  try {
    // Read current principles to pass as deduplication context
    const existingContent = fs.readFileSync(crossProjectPath, 'utf-8');
    // Extract just the principle names and rules to keep the context concise
    const principleNames = [...existingContent.matchAll(/^### (.+)$/gm)].map(m => m[1]).join('\n');

    const prompt = CROSS_PROJECT_DEDUP_PROMPT
      .replace('{EXISTING}', principleNames || '(none yet)')
      .replace(/{PROJECT}/g, projectId)
      .replace('{ITEMS}', allItems.map(i => `- ${i}`).join('\n'));

    const result = await chatCompletion({
      model: config.llm.model,
      apiKey,
      baseUrl: config.llm.baseUrl,
      maxTokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse the JSON array of new principles
    let newPrinciples: Array<{ name: string; rule: string; why: string; first_seen: string }> = [];
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        newPrinciples = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return; // malformed output — skip rather than append noise
    }

    if (!Array.isArray(newPrinciples) || newPrinciples.length === 0) return;

    // Append only genuinely new principles, each in the canonical format
    const additions = newPrinciples
      .filter(p => p && typeof p.name === 'string' && typeof p.rule === 'string')
      .map(p => formatPrinciple(p))
      .join('');

    if (additions.trim()) {
      // Add under a dated section header so new additions are discoverable
      const sectionHeader = `\n\n---\n\n## New Principles — ${timestamp} (from ${projectId})\n`;
      fs.appendFileSync(crossProjectPath, sectionHeader + additions, 'utf-8');
    }
  } catch {
    // Non-fatal — cross-project propagation failing must never block phase consolidation
  }
}
