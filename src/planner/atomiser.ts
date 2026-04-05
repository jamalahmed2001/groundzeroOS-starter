import matter from 'gray-matter';
import fs from 'fs';
import path from 'path';
import type { PhaseNode } from '../vault/reader.js';
import { readPhaseNode } from '../vault/reader.js';
import type { ControllerConfig } from '../config/load.js';
import { notify } from '../notify/notify.js';
import { setPhaseTag, appendToLog, writeFile } from '../vault/writer.js';
import { planningCall, planningUsesAgent } from '../llm/planningRouter.js';
import { spawnClaudeCode } from '../agents/claudeCodeSpawn.js';
import { scanRepoFiles, validatePlanFilePaths } from '../vault/repoScanner.js';

const PLAN_START = '<!-- AGENT_WRITABLE_START:phase-plan -->';
const PLAN_END   = '<!-- AGENT_WRITABLE_END:phase-plan -->';

const ATOMISE_SYSTEM_PROMPT = `You are a senior technical architect creating an implementation task plan for an AI coding agent.

Given a phase description and repo file structure, produce a numbered task plan with 4-8 parent tasks.

Output format — wrap everything between the markers exactly as shown:

<!-- AGENT_WRITABLE_START:phase-plan -->

## Implementation Plan

### [T1] Task name (3-6 words, action-oriented)
**Files:** \`path/to/file.ts\`, \`path/to/other.ts\`
**Steps:**
1. Concrete step
2. Concrete step
**Validation:** How to verify this is done (e.g. "npm test passes", "curl /api/foo returns 200")
**DoD:** One measurable binary done condition

- [ ] [T1.1] Sub-task — imperative verb, specific file/symbol if known
- [ ] [T1.2] Sub-task — imperative verb, specific file/symbol if known

### [T2] Next task name
**Files:** \`path/to/file.ts\`
**Steps:**
1. Step
**Validation:** ...
**DoD:** ...

- [ ] [T2.1] Sub-task
- [ ] [T2.2] Sub-task

<!-- AGENT_WRITABLE_END:phase-plan -->

Rules:
- Sub-tasks MUST be checkboxes (- [ ]) — these are the actual work items the agent will execute
- Steps must be concrete and specific — not vague ("implement", "add") but precise ("add POST /api/x handler in src/routes/x.ts")
- Each sub-task must be independently executable by a coding agent with no ambiguity
- Do not include tasks about writing documentation or tests unless the phase explicitly requires it
- Output ONLY the implementation plan block — nothing else, no prose before or after

GROUNDING RULES (critical — prevents hallucinated file paths):
- **Files:** lines MUST reference files that exist in the repo tree above, OR be explicitly marked "(new)" for files to create
- Do NOT invent file paths — if the repo tree doesn't show a file, do not reference it unless you are creating it
- Base your task structure on what ACTUALLY exists in the repo — read the tree carefully before planning
- If the phase requires work in areas not visible in the tree, describe what to find in the Steps rather than guessing paths
- Validation steps must use commands that actually exist in the repo (check package.json scripts, Makefile targets, etc.)`;

const ATOMISE_WRITE_SYSTEM_PROMPT = `You are a senior technical architect creating an implementation task plan for an AI coding agent.

You will be asked to:
1. Read a phase note to understand what needs to be built
2. Explore the repo to understand existing patterns and structure
3. Write an implementation task plan DIRECTLY into the phase note file

CRITICAL: You MUST write the plan to the file using your Edit or Write tools. Do NOT output the plan to stdout.

Plan format — write this exact structure between the managed markers in the file:

<!-- AGENT_WRITABLE_START:phase-plan -->

## Implementation Plan

### [T1] Task name (3-6 words, action-oriented)
**Files:** \`path/to/file.ts\`, \`path/to/other.ts\`
**Steps:**
1. Concrete step
2. Concrete step
**Validation:** How to verify (e.g. "npm test passes", "curl /api/foo returns 200")
**DoD:** One measurable binary done condition

- [ ] [T1.1] Sub-task — imperative verb, specific file/symbol if known
- [ ] [T1.2] Sub-task — imperative verb, specific file/symbol if known

### [T2] Next task name
...

<!-- AGENT_WRITABLE_END:phase-plan -->

Rules:
- Sub-tasks MUST be checkboxes (- [ ]) — these are actual work items the agent will execute
- Steps must be concrete — not "implement" but "add POST /api/x in src/routes/x.ts"
- File paths MUST exist in the repo (use Glob/Grep to verify before writing)
- 4-8 parent tasks maximum
- Do NOT add tasks about writing documentation or tests unless the phase explicitly requires it
- When done writing the plan, also update the frontmatter: add phase-ready to tags, set state: ready`;

function buildAgentWritePrompt(opts: {
  phaseNotePath: string;
  repoPath: string;
  phaseLabel: string;
  phaseNum: unknown;
  projectId: string;
  userPrompt: string;
}): string {
  return `Phase note to update: ${opts.phaseNotePath}
Repo to explore: ${opts.repoPath}

## Your task

1. Read the phase note at ${opts.phaseNotePath}
2. Explore the repo — read key source files, check package.json for scripts and dependencies, understand existing patterns
3. Write the implementation task plan directly into the phase note between these markers:
   <!-- AGENT_WRITABLE_START:phase-plan -->
   ...your plan here...
   <!-- AGENT_WRITABLE_END:phase-plan -->
4. After writing the plan, update the frontmatter:
   - Set state: ready
   - Ensure tags includes phase-ready (replace phase-backlog or phase-planning)

## Phase context

${opts.userPrompt}`;
}

// scanRepoFiles imported from ../vault/repoScanner.js

// Derive the bundle dir from a phase node path (Phases/ is one level inside bundle dir)
function bundleDirFromPhase(phasePath: string): string {
  return path.dirname(path.dirname(phasePath));
}

// Find the repo path: try overview frontmatter first, then config reposRoot fuzzy match
function resolveRepoPath(phaseNode: PhaseNode, projectId: string, config: ControllerConfig): string {
  const bundleDir = bundleDirFromPhase(phaseNode.path);
  const overviewGlob = fs.readdirSync(bundleDir).find(f => f.includes('Overview') && f.endsWith('.md'));
  if (overviewGlob) {
    const overviewNode = readPhaseNode(path.join(bundleDir, overviewGlob));
    const explicit = String(overviewNode.frontmatter['repo_path'] ?? '').trim();
    if (explicit && fs.existsSync(explicit)) return explicit;
  }

  // Fuzzy fallback via reposRoot
  const reposRoot = config.reposRoot;
  if (reposRoot && fs.existsSync(reposRoot)) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
    const needle = norm(projectId);
    const entries = fs.readdirSync(reposRoot, { withFileTypes: true });
    let best: { p: string; s: number } | null = null;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const candidate = norm(ent.name);
      let score = 0;
      if (candidate === needle) score = 100;
      else if (candidate.includes(needle) || needle.includes(candidate)) score = 60;
      if (score > 0 && (!best || score > best.s)) best = { p: path.join(reposRoot, ent.name), s: score };
    }
    if (best) return best.p;
  }

  return '';
}

function injectPlanBlock(content: string, planBlock: string): string {
  // Replace existing plan block if present
  const startIdx = content.indexOf(PLAN_START);
  const endIdx   = content.indexOf(PLAN_END);
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + planBlock + content.slice(endIdx + PLAN_END.length);
  }

  // Insert before ## Acceptance Criteria if it exists
  const acMatch = content.match(/\n## Acceptance Criteria/);
  if (acMatch) {
    const idx = content.indexOf('\n## Acceptance Criteria');
    return content.slice(0, idx) + '\n\n' + planBlock + content.slice(idx);
  }

  // Append after ## Tasks section if present
  const tasksMatch = content.match(/\n## Tasks[\s\S]*?(?=\n##|$)/);
  if (tasksMatch) {
    const afterTasks = content.indexOf('\n## Tasks') + tasksMatch[0].length;
    return content.slice(0, afterTasks) + '\n\n' + planBlock + content.slice(afterTasks);
  }

  // Fallback: append at end
  return content.trimEnd() + '\n\n' + planBlock + '\n';
}

function extractPlanBlock(llmOutput: string): string | null {
  const startIdx = llmOutput.indexOf(PLAN_START);
  const endIdx   = llmOutput.indexOf(PLAN_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  return llmOutput.slice(startIdx, endIdx + PLAN_END.length).trim();
}

export async function atomisePhase(
  phaseNode: PhaseNode,
  runId: string,
  config: ControllerConfig
): Promise<'ready' | 'failed'> {
  const projectId = String(
    phaseNode.frontmatter['project'] ??
    path.basename(bundleDirFromPhase(phaseNode.path))
  );
  const phaseLabel = String(
    phaseNode.frontmatter['phase_name'] ??
    path.basename(phaseNode.path, '.md')
  );
  const phaseNum = phaseNode.frontmatter['phase_number'];

  setPhaseTag(phaseNode.path, 'phase-planning');
  appendToLog(phaseNode.path, { runId, event: 'atomise_started' });
  await notify({ event: 'atomise_started', projectId, phaseLabel, runId }, config);

  const repoPath = resolveRepoPath(phaseNode, projectId, config);

  // Only need an API key when not routing through the agent driver
  if (!planningUsesAgent(config, repoPath)) {
    const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: 'Failed: no API key (set OPENROUTER_API_KEY)' });
      setPhaseTag(phaseNode.path, 'phase-backlog');
      return 'failed';
    }
  }

  const repoTree = scanRepoFiles(repoPath);

  // Read Overview for current project scope and agent constraints
  // (Overview is the source of truth — may have been updated since phase was created)
  const bundleDir = bundleDirFromPhase(phaseNode.path);
  let overviewContext = '';
  try {
    const ovFile = fs.readdirSync(bundleDir).find(f => f.includes('Overview') && f.endsWith('.md'));
    if (ovFile) {
      const ovNode = readPhaseNode(path.join(bundleDir, ovFile));
      const scope = ovNode.content.match(/## (?:Scope|Goals?|Description|Overview)\b([\s\S]*?)(?=\n##|\s*$)/i)?.[1]?.trim() ?? '';
      const constraints = ovNode.content.match(/## Agent Constraints([\s\S]*?)(?=\n##|\s*$)/)?.[1]?.trim() ?? '';
      overviewContext = [
        scope ? `Project scope:\n${scope.slice(0, 800)}` : '',
        constraints ? `Agent constraints:\n${constraints.slice(0, 400)}` : '',
      ].filter(Boolean).join('\n\n');
    }
  } catch { /* non-fatal */ }

  // Summarise sibling phases so atomiser doesn't duplicate their work
  let siblingContext = '';
  try {
    const phasesDir = path.join(bundleDir, 'Phases');
    if (fs.existsSync(phasesDir)) {
      const siblingFiles = fs.readdirSync(phasesDir)
        .filter(f => f.match(/^P\d+/i) && f.endsWith('.md') && f !== path.basename(phaseNode.path))
        .slice(0, 15);
      const summaries = siblingFiles.map(f => {
        const sib = readPhaseNode(path.join(phasesDir, f));
        const num = sib.frontmatter['phase_number'] ?? '?';
        const name = sib.frontmatter['phase_name'] ?? f;
        const tags = Array.isArray(sib.frontmatter['tags']) ? sib.frontmatter['tags'] as string[] : [];
        const stateTag = tags.find((t: string) => t.startsWith('phase-')) ?? String(sib.frontmatter['status'] ?? 'unknown');
        return `P${num}: "${name}" [${stateTag}]`;
      });
      if (summaries.length > 0) {
        siblingContext = `Other phases in this project (do not duplicate their work):\n${summaries.join('\n')}`;
      }
    }
  } catch { /* non-fatal */ }

  // Build a focused context from the phase note
  const phaseContext = phaseNode.content.trim();

  // When the agent driver has repo access, tell it to explore; otherwise pass static tree
  const repoSection = planningUsesAgent(config, repoPath)
    ? [
        `You have full read access to the repo at ${repoPath}.`,
        ``,
        `BEFORE writing the plan:`,
        `1. Read key source files to understand existing patterns and architecture`,
        `2. Check package.json (or equivalent) for existing scripts, dependencies, and test framework`,
        `3. Identify the actual file structure — do NOT guess paths`,
        ``,
        `Then generate the implementation plan grounded in what you found.`,
      ].join('\n')
    : `Repo file structure (${repoPath || 'path unknown'}):\n${repoTree}`;

  const userPrompt = `Project: ${projectId}
Phase: P${phaseNum} — ${phaseLabel}
${overviewContext ? `\n${overviewContext}\n` : ''}${siblingContext ? `\n${siblingContext}\n` : ''}
${phaseContext}

---

${repoSection}

Generate the implementation task plan for this phase.`;

  try {
    // Branch A: agent driver can write directly to the vault
    if (planningUsesAgent(config, repoPath)) {
      const agentPrompt = buildAgentWritePrompt({
        phaseNotePath: phaseNode.path,
        repoPath,
        phaseLabel,
        phaseNum,
        projectId,
        userPrompt,
      });

      const result = await spawnClaudeCode({
        prompt: agentPrompt,
        repoPath,
        systemPrompt: config.prompts?.atomise ?? ATOMISE_WRITE_SYSTEM_PROMPT,
        timeoutMs: 180_000,
        model: config.llm.model,
      });

      if (result.success) {
        // Verify the managed block landed in the file
        const written = fs.readFileSync(phaseNode.path, 'utf8');
        const blockStart = written.indexOf(PLAN_START);
        const blockEnd   = written.indexOf(PLAN_END);
        if (blockStart !== -1 && blockEnd !== -1 && blockEnd > blockStart) {
          // Agent wrote successfully — post-validate paths, set tag, done
          const planSection = written.slice(blockStart, blockEnd + PLAN_END.length);
          const missingFiles = validatePlanFilePaths(planSection, repoPath);
          if (missingFiles.length > 0) {
            const warning = `<!-- gzos: WARNING — These file paths were not found in the repo and may be hallucinated:\n${missingFiles.map(f => `- ${f}`).join('\n')}\nConsider verifying before execution. -->`;
            const withWarning = written.replace(PLAN_END, `${PLAN_END}\n\n${warning}`);
            fs.writeFileSync(phaseNode.path, withWarning, 'utf8');
            appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: `Plan written directly by agent with ${missingFiles.length} unverified file path(s): ${missingFiles.join(', ')}` });
          }

          setPhaseTag(phaseNode.path, 'phase-ready');
          if (missingFiles.length === 0) {
            appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: 'Task plan written directly by agent, phase set to ready' });
          }
          await notify({ event: 'atomise_done', projectId, phaseLabel, runId }, config);

          return 'ready';
        }
        // Block not found — fall through to OpenRouter path
        console.warn('[gzos] Agent did not write plan block — falling back to LLM text output');
      }
      // On failure, fall through to OpenRouter path
    }

    // Branch B: OpenRouter path (unchanged existing code)
    const output = await planningCall({
      config,
      repoPath,
      systemPrompt: config.prompts?.atomise ?? ATOMISE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 3500,
    });

    const planBlock = extractPlanBlock(output);
    if (!planBlock) {
      // Try to salvage: wrap output in markers if it looks like a task list
      const hasTasks = output.includes('- [ ]') || output.includes('[T1]') || output.includes('### [T');
      if (!hasTasks) {
        appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: 'Failed: no plan block in LLM output' });
        setPhaseTag(phaseNode.path, 'phase-backlog');
        return 'failed';
      }
      // Wrap it
      const wrapped = `${PLAN_START}\n\n${output.trim()}\n\n${PLAN_END}`;
      const updatedContent = injectPlanBlock(phaseNode.content, wrapped);
      writeFile(phaseNode.path, matter.stringify(updatedContent, phaseNode.frontmatter as Record<string, unknown>));
    } else {
      const updatedContent = injectPlanBlock(phaseNode.content, planBlock);
      writeFile(phaseNode.path, matter.stringify(updatedContent, phaseNode.frontmatter as Record<string, unknown>));
    }

    // Post-generation validation: check if referenced files actually exist
    const finalContent = fs.readFileSync(phaseNode.path, 'utf8');
    const planStartIdx = finalContent.indexOf(PLAN_START);
    const planEndIdx = finalContent.indexOf(PLAN_END);
    const planSection = (planStartIdx !== -1 && planEndIdx !== -1)
      ? finalContent.slice(planStartIdx, planEndIdx + PLAN_END.length)
      : '';
    const missingFiles = validatePlanFilePaths(planSection, repoPath);
    if (missingFiles.length > 0) {
      const warning = `<!-- gzos: WARNING — These file paths were not found in the repo and may be hallucinated:\n${missingFiles.map(f => `- ${f}`).join('\n')}\nConsider verifying before execution. -->`;
      // Append warning after the plan block
      const withWarning = finalContent.replace(PLAN_END, `${PLAN_END}\n\n${warning}`);
      fs.writeFileSync(phaseNode.path, withWarning, 'utf8');
      appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: `Plan written with ${missingFiles.length} unverified file path(s): ${missingFiles.join(', ')}` });
    }

    setPhaseTag(phaseNode.path, 'phase-ready');
    if (missingFiles.length === 0) {
      appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: 'Task plan written, phase set to ready' });
    }
    await notify({ event: 'atomise_done', projectId, phaseLabel, runId }, config);

    return 'ready';
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    appendToLog(phaseNode.path, { runId, event: 'atomise_done', detail: `Failed: ${detail}` });
    setPhaseTag(phaseNode.path, 'phase-backlog');
    return 'failed';
  }
}
