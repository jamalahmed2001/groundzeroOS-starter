// replan.ts — When a phase blocks, read the log and rewrite the task list.
//
// Flow:
//   1. Read log note (uses same path as writer.ts — must stay in sync)
//   2. Read phase note — tasks, acceptance criteria, blockers section
//   3. Call LLM: "phase failed, here's the evidence, propose a new task list"
//   4. Parse new tasks from LLM output
//   5. Inject tasks into AGENT_WRITABLE block (or ## Tasks if no block exists)
//      ↳ Critical: selectNextTask checks AGENT_WRITABLE first, so tasks written
//        only to ## Tasks are silently ignored when a managed block is present.
//   6. Clear ## Blockers section
//   7. Increment replan_count in frontmatter (max 2 replans per phase)
//   8. Set phase tag back to phase-ready
//   9. Append replan_done to log

import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { readPhaseNode } from '../vault/reader.js';
import { writeFile, setPhaseTag, appendToLog, resetAcceptanceCriteria, deriveLogNotePath } from '../vault/writer.js';
import { chatCompletion } from '../llm/client.js';
import { notify } from '../notify/notify.js';
import type { PhaseNode } from '../vault/reader.js';
import type { ControllerConfig } from '../config/load.js';

const MAX_REPLANS = 2;

const REPLAN_SYSTEM_PROMPT = `You are a technical project planner. A phase in an autonomous agent system has blocked.
Your job is to rewrite the task list so a fresh agent attempt can succeed.

Rules:
- Output ONLY the new task list as markdown checkboxes (- [ ] task)
- Each task must be concrete and independently executable by a CLI agent
- Break down any task that previously failed into smaller steps
- If the blocker was an environment issue, add a prerequisite verification task first
- Maximum 8 tasks
- Output ONLY the checkbox list — no headings, no commentary`;

export type ReplanResult = 'replanned' | 'max_reached' | 'no_api_key' | 'parse_error';

// Inject replanned tasks into the phase note.
//
// Priority: write into the AGENT_WRITABLE block if it exists — this is where
// selectNextTask looks first, so tasks written only to ## Tasks are silently
// ignored when a managed block is present.
//
// If no managed block exists, fall back to rewriting ## Tasks.
function injectReplanTasks(raw: string, newTasks: string[]): string {
  const PLAN_START = '<!-- AGENT_WRITABLE_START:phase-plan -->';
  const PLAN_END   = '<!-- AGENT_WRITABLE_END:phase-plan -->';
  const taskBlock  = newTasks.map(t => `- [ ] ${t.replace(/^-\s*\[\s*[x ]?\s*\]\s*/, '')}`).join('\n');

  const startIdx = raw.indexOf(PLAN_START);
  const endIdx   = raw.indexOf(PLAN_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace the managed block's content with the replanned task list.
    // The markers themselves are preserved so the block stays valid.
    return (
      raw.slice(0, startIdx + PLAN_START.length) +
      '\n\n## Replanned Tasks\n\n' +
      taskBlock +
      '\n\n' +
      raw.slice(endIdx)
    );
  }

  // No managed block — rewrite (or create) ## Tasks section
  if (/## Tasks/.test(raw)) {
    return raw.replace(
      /(## Tasks\n)([\s\S]*?)(\n## |\n---|$)/,
      (_match, heading, _old, suffix) => `${heading}\n${taskBlock}\n${suffix}`,
    );
  }

  const insertBefore = raw.indexOf('\n## Acceptance Criteria');
  if (insertBefore !== -1) {
    return raw.slice(0, insertBefore) + `\n## Tasks\n\n${taskBlock}` + raw.slice(insertBefore);
  }

  return raw + `\n## Tasks\n\n${taskBlock}\n`;
}

function clearBlockersSection(raw: string): string {
  return raw.replace(
    /(## Blockers\n)([\s\S]*?)(\n## |\n---|$)/,
    (_match, heading, _old, suffix) => `${heading}\n(none)\n${suffix}`
  );
}

export async function replanPhase(
  phaseNode: PhaseNode,
  runId: string,
  config: ControllerConfig
): Promise<ReplanResult> {
  const projectId  = String(phaseNode.frontmatter['project'] ?? '');
  const phaseLabel = String(phaseNode.frontmatter['phase_name'] ?? path.basename(phaseNode.path, '.md'));
  const phaseNum   = phaseNode.frontmatter['phase_number'] ?? '?';

  // Guard: max replans
  const replanCount = Number(phaseNode.frontmatter['replan_count'] ?? 0);
  if (replanCount >= MAX_REPLANS) {
    await notify({
      event: 'phase_blocked',
      projectId,
      phaseLabel,
      detail: `Max replans (${MAX_REPLANS}) reached — needs human review`,
      runId,
    }, config);
    return 'max_reached';
  }

  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) return 'no_api_key';

  // Re-read fresh node (may have changed since loop started)
  const fresh = readPhaseNode(phaseNode.path);
  if (!fresh.exists) return 'parse_error';

  // Read log note for failure evidence
  const logPath = deriveLogNotePath(phaseNode.path, fresh.frontmatter);
  let logContext = '';
  if (fs.existsSync(logPath)) {
    const logRaw = fs.readFileSync(logPath, 'utf-8');
    // Get last 1500 chars of log — most recent events
    logContext = logRaw.slice(-1500);
  }

  // Extract current tasks + acceptance criteria + blockers
  const currentTasks        = fresh.content.match(/## Tasks([\s\S]*?)(?=\n## |\s*$)/)?.[1]?.trim() ?? '';
  const acceptanceCriteria  = fresh.content.match(/## Acceptance Criteria([\s\S]*?)(?=\n## |\s*$)/)?.[1]?.trim() ?? '';
  const blockers            = fresh.content.match(/## Blockers([\s\S]*?)(?=\n## |\s*$)/)?.[1]?.trim() ?? '';

  await notify({
    event: 'replan_started',
    projectId,
    phaseLabel: `P${phaseNum} — ${phaseLabel}`,
    detail: `Replan attempt ${replanCount + 1}/${MAX_REPLANS}`,
    runId,
  }, config);

  const userPrompt = `Phase: P${phaseNum} — ${phaseLabel}

Current tasks (some failed):
${currentTasks}

Acceptance criteria (must still be met):
${acceptanceCriteria}

Blockers logged:
${blockers || '(see log)'}

Recent execution log:
${logContext || '(no log found)'}

Rewrite the task list so a fresh agent attempt can succeed. Output ONLY checkbox tasks.`;

  let output: string;
  try {
    output = await chatCompletion({
      model: config.llm.model,
      apiKey,
      baseUrl: config.llm.baseUrl,
      maxTokens: 1024,
      messages: [
        { role: 'system', content: config.prompts?.replan ?? REPLAN_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
  } catch (err) {
    appendToLog(phaseNode.path, {
      runId,
      event: 'replan_failed',
      detail: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return 'parse_error';
  }

  // Parse checkbox lines from output
  const newTasks = output
    .split('\n')
    .filter(line => /^\s*-\s*\[\s*[x ]?\s*\]/.test(line) || /^\s*-\s+\w/.test(line))
    .map(line => line.trim().replace(/^-\s*\[\s*[x ]?\s*\]\s*/, '').replace(/^-\s+/, ''))
    .filter(Boolean);

  if (newTasks.length === 0) {
    appendToLog(phaseNode.path, { runId, event: 'replan_failed', detail: 'LLM produced no tasks' });
    return 'parse_error';
  }

  // Rewrite the phase note
  const rawFile = fs.readFileSync(phaseNode.path, 'utf-8');
  const parsed  = matter(rawFile);

  // Update frontmatter
  parsed.data['replan_count'] = replanCount + 1;
  parsed.data['status']       = 'ready';

  let newContent = matter.stringify(parsed.content, parsed.data as Record<string, unknown>);
  newContent = injectReplanTasks(newContent, newTasks);
  newContent = clearBlockersSection(newContent);

  writeFile(phaseNode.path, newContent);

  // Reset acceptance criteria so they get re-ticked on next completion
  resetAcceptanceCriteria(phaseNode.path);

  // Set phase tag back to ready
  setPhaseTag(phaseNode.path, 'phase-ready');

  appendToLog(phaseNode.path, {
    runId,
    event: 'replan_done',
    detail: `Replan ${replanCount + 1}/${MAX_REPLANS}: ${newTasks.length} new tasks`,
  });

  await notify({
    event: 'replan_done',
    projectId,
    phaseLabel: `P${phaseNum} — ${phaseLabel}`,
    detail: `${newTasks.length} tasks rewritten (attempt ${replanCount + 1}/${MAX_REPLANS})`,
    runId,
  }, config);

  return 'replanned';
}
