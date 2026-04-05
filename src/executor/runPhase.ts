import type { PhaseNode } from '../vault/reader.js';
import { readPhaseNode } from '../vault/reader.js';
import type { ControllerConfig } from '../config/load.js';
import { acquireLock } from '../lock/acquire.js';
import { releaseLock } from '../lock/release.js';
import { selectNextTask, acceptanceMet } from './selectTask.js';
import { tickTask, appendToLog, tickAcceptanceCriteria, backupPhaseFiles, writeHumanRequirement, writeCheckpoint, readCheckpoint, clearCheckpoint, deriveLogNotePath } from '../vault/writer.js';
import { runAgent } from '../agents/types.js';
import { notify } from '../notify/notify.js';
import { isShutdownRequested } from '../controller/loop.js';
import { classifyComplexity, modelForTier } from '../utils/complexityClassifier.js';
import { getRelevantKnowledge } from '../vault/knowledgeIndex.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export interface PhaseRunResult {
  status: 'completed' | 'blocked' | 'error' | 'lock_contention';
  tasksCompleted: number;
  blockers: string[];
  logNotePath: string;
  repoPath: string;
}

// Resolved context paths — agent reads these files directly via --add-dir
interface ContextPaths {
  repoPath: string;
  repoPathValid: boolean;
  overviewPath: string;
  knowledgePath: string;
  decisionsPath: string;
  researchPath: string;
  checkpointPath: string;
}

// Resolve paths to vault context files. Agent reads them natively — we just point it there.
function resolveContextPaths(projectId: string, bundleDir: string, phaseNum: string, phaseLabel: string): ContextPaths {
  let repoPath = '';
  let repoPathValid = false;

  // repo_path from Overview frontmatter
  const ovPath = path.join(bundleDir, `${projectId} - Overview.md`);
  if (fs.existsSync(ovPath)) {
    const ov = readPhaseNode(ovPath);
    const frontmatterRepoPath = String(ov.frontmatter['repo_path'] ?? '');
    if (frontmatterRepoPath && fs.existsSync(frontmatterRepoPath)) {
      repoPath = frontmatterRepoPath;
      repoPathValid = true;
    } else if (frontmatterRepoPath) {
      repoPath = frontmatterRepoPath; // exists in frontmatter but path doesn't exist on disk
    }
  }

  const knowledgePath = path.join(bundleDir, `${projectId} - Knowledge.md`);
  const decisionsPath = path.join(bundleDir, `${projectId} - Decisions.md`);
  const researchPath = path.join(bundleDir, 'Phases', `P${phaseNum} - ${phaseLabel} - Research.md`);
  const checkpointPath = path.join(bundleDir, 'Phases', `.gzos-continue-P${phaseNum} - ${phaseLabel}.md`);

  return {
    repoPath,
    repoPathValid,
    overviewPath: ovPath,
    knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : '',
    decisionsPath: fs.existsSync(decisionsPath) ? decisionsPath : '',
    researchPath: fs.existsSync(researchPath) ? researchPath : '',
    checkpointPath: fs.existsSync(checkpointPath) ? checkpointPath : '',
  };
}

function extractBacktickedCommand(taskLine: string): string | null {
  const m = taskLine.match(/`([^`]+)`/);
  return m ? m[1]!.trim() : null;
}

function isSafeShellCommand(cmd: string): boolean {
  // KISS safety gate: allow only a small set of common, mostly read-only commands.
  // Expand intentionally as we gain confidence.
  const head = cmd.trim().split(/\s+/)[0] ?? '';
  const allow = new Set(['ls', 'test', 'grep', 'rg', 'cat', 'sed', 'awk', 'echo', 'git', 'pnpm', 'npm', 'npx', 'node', 'timeout', 'mkdir', 'wc']);
  if (!allow.has(head)) return false;

  // Disallow obvious destructive ops
  if (/(^|\s)(rm|mv|cp|dd|mkfs|chmod|chown|sudo)(\s|$)/.test(cmd)) return false;
  return true;
}

function tryRunShellTask(taskLine: string, cwd: string): { ok: boolean; output: string } | null {
  const cmd = extractBacktickedCommand(taskLine);
  if (!cmd) return null;
  if (!isSafeShellCommand(cmd)) return null;

  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: process.env,
    });
    return { ok: true, output: output?.trim() ?? '' };
  } catch (err: any) {
    const stdout = err?.stdout ? String(err.stdout) : '';
    const stderr = err?.stderr ? String(err.stderr) : '';
    const out = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    return { ok: false, output: out || (err?.message ?? 'command failed') };
  }
}

interface PreflightResult {
  warnings: string[];
  fatal: boolean;
  fatalReason?: string;
}

function preflightCheck(phaseNode: PhaseNode, ctx: ContextPaths, allPhases: PhaseNode[]): PreflightResult {
  const warnings: string[] = [];

  // 1. Tasks exist?
  const hasTasks = /^\s*-\s*\[\s*[x ]?\s*\]/m.test(phaseNode.content);
  if (!hasTasks) {
    warnings.push('No task checkboxes found in phase note — run `gzos plan "<project>" <n>` to atomise tasks');
  }

  // 2. Repo path set and valid?
  if (!ctx.repoPathValid) {
    const reason = !ctx.repoPath
      ? `No repo_path set in the Overview note. Add repo_path to the frontmatter pointing to the code repository.\nWithout it, the agent has nowhere to write code.`
      : `Repo path does not exist: ${ctx.repoPath}\nCreate the directory or fix repo_path in the Overview note.`;
    return {
      warnings,
      fatal: true,
      fatalReason: reason,
    };
  }

  // 3. depends_on phases all completed?
  const deps = phaseNode.frontmatter['depends_on'];
  if (deps) {
    const depNums: number[] = Array.isArray(deps)
      ? (deps as unknown[]).map(d => Number(d)).filter(n => !isNaN(n) && n > 0)
      : [Number(deps)].filter(n => !isNaN(n) && n > 0);

    for (const depNum of depNums) {
      const dep = allPhases.find(p => Number(p.frontmatter['phase_number']) === depNum);
      if (!dep) {
        warnings.push(`depends_on P${depNum} but that phase doesn't exist`);
      } else {
        const depState = String(dep.frontmatter['state'] ?? dep.frontmatter['status'] ?? '');
        const depTags = Array.isArray(dep.frontmatter['tags']) ? dep.frontmatter['tags'] as string[] : [];
        const isCompleted = depState === 'completed' || depTags.includes('phase-completed');
        if (!isCompleted) {
          warnings.push(`depends_on P${depNum} ("${dep.frontmatter['phase_name'] ?? ''}") which is not yet completed [${depState || 'unknown'}]`);
        }
      }
    }
  }

  return { warnings, fatal: false };
}

// Main executor:
// 1. Backup phase files
// 2. acquireLock → lock_contention if fails
// 3. notify lock_acquired
// 4. Task loop: selectNextTask → (optional shell task) → rich prompt → runAgent → tickTask → appendToLog
// 5. Stuck detection: 3 consecutive failures → escalate
// 6. Agent failure → phase_blocked
// 7. No more tasks → acceptanceMet check → completed or blocked
export async function runPhase(
  phaseNode: PhaseNode,
  runId: string,
  config: ControllerConfig
): Promise<PhaseRunResult> {
  const projectId  = String(phaseNode.frontmatter['project'] ?? path.basename(path.dirname(path.dirname(phaseNode.path))));
  const phaseLabel = String(phaseNode.frontmatter['phase_name'] ?? path.basename(phaseNode.path, '.md'));
  const phaseNum   = String(phaseNode.frontmatter['phase_number'] ?? '?');
  const bundleDir  = path.dirname(path.dirname(phaseNode.path));
  const logNotePath = deriveLogNotePath(phaseNode.path, phaseNode.frontmatter);

  // 0. Backup phase files before acquiring lock
  try {
    const backupDir = backupPhaseFiles(phaseNode.path);
    console.log(`[gzos:debug] Backup created at: ${backupDir}`);
  } catch (backupErr) {
    console.warn('[gzos] Backup failed (non-fatal):', (backupErr as Error).message);
  }

  // 1. Acquire lock
  const lockResult = acquireLock(phaseNode.path, runId);
  if (!lockResult.ok) {
    if (lockResult.reason === 'schema_invalid') {
      console.error(`[gzos] Cannot execute phase — schema validation failed:`);
      for (const err of lockResult.errors) {
        console.error(`  • ${err}`);
      }
      console.error(`[gzos] Fix the phase note frontmatter and re-run. Use \`gzos heal\` to auto-repair project_id.`);
      return { status: 'error', tasksCompleted: 0, blockers: lockResult.errors, logNotePath, repoPath: bundleDir };
    }
    const reason = lockResult.reason === 'already_locked'
      ? `Locked by ${lockResult.lockedBy}`
      : `Not ready: ${lockResult.currentTag}`;
    return { status: 'lock_contention', tasksCompleted: 0, blockers: [reason], logNotePath, repoPath: bundleDir };
  }

  await notify({ event: 'lock_acquired', projectId, phaseLabel, runId }, config);
  appendToLog(phaseNode.path, { runId, event: 'lock_acquired' });

  const ctx = resolveContextPaths(projectId, bundleDir, phaseNum, phaseLabel);

  // Pre-flight: warn on common setup mistakes before spawning any agent
  {
    const { discoverAllPhases } = await import('../vault/discover.js');
    const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
    const preflight = preflightCheck(phaseNode, ctx, allPhases);

    if (preflight.warnings.length > 0) {
      for (const w of preflight.warnings) {
        console.warn(`[gzos:preflight] ⚠  ${w}`);
        appendToLog(phaseNode.path, { runId, event: 'phase_started', detail: `preflight warning: ${w}` });
      }
    }

    if (preflight.fatal) {
      appendToLog(phaseNode.path, { runId, event: 'phase_blocked', detail: preflight.fatalReason! });
      releaseLock(phaseNode.path, runId, 'phase-blocked');
      await notify({ event: 'phase_blocked', projectId, phaseLabel, detail: preflight.fatalReason!.slice(0, 80), runId }, config);
      return { status: 'blocked', tasksCompleted: 0, blockers: [preflight.fatalReason!], logNotePath, repoPath: ctx.repoPath };
    }
  }
  const blockers: string[] = [];
  let tasksCompleted = 0;
  let consecutiveFailures = 0;
  let lastFailureContext: string | undefined;
  let taskAttemptNumber = 1;
  const completedTasksList: string[] = [];

  // Check for a prior-run checkpoint and consume it
  const checkpoint = readCheckpoint(phaseNode.path);
  if (checkpoint) {
    clearCheckpoint(phaseNode.path);
    console.log(`[gzos] Resuming from checkpoint for P${phaseNum} — ${phaseLabel}`);
  }

  // 3. Task loop — wrapped in try/finally to guarantee lock release on unexpected errors
  try {
  while (true) {
    // Check for graceful shutdown between tasks
    if (isShutdownRequested()) {
      // Write a continue-here checkpoint before releasing
      const freshForCheckpoint = readPhaseNode(phaseNode.path);
      const nextTaskForCheckpoint = freshForCheckpoint.exists ? selectNextTask(freshForCheckpoint.content) : null;
      const totalTasks = freshForCheckpoint.exists
        ? freshForCheckpoint.content.split('\n').filter(l => /^\s*-\s*\[[ x]\]/i.test(l)).length
        : 0;

      const checkpointContent = [
        `# Continue Checkpoint — P${phaseNum} ${phaseLabel}`,
        ``,
        `**Status:** Interrupted cleanly at task ${tasksCompleted + 1} of ${totalTasks}`,
        `**Run ID:** ${runId}`,
        `**Interrupted:** ${new Date().toISOString()}`,
        ``,
        `## Completed Tasks`,
        completedTasksList.map(t => `- [x] ${t}`).join('\n') || '(none)',
        ``,
        `## Current Task (resume here)`,
        nextTaskForCheckpoint ?? '(all tasks done)',
        ``,
        `## Remaining Tasks`,
        `(run gzos run to continue from where this left off)`,
        ``,
        `## Decisions Made This Run`,
        `(check ${projectId} - Decisions.md for any decisions logged)`,
      ].join('\n');

      writeCheckpoint(phaseNode.path, checkpointContent);
      releaseLock(phaseNode.path, runId, 'phase-ready');
      await notify({ event: 'lock_released', projectId, phaseLabel, detail: 'Shutdown — returning to phase-ready', runId }, config);
      return { status: 'error', tasksCompleted, blockers: ['Shutdown requested'], logNotePath, repoPath: ctx.repoPath };
    }

    const freshNode = readPhaseNode(phaseNode.path);
    if (!freshNode.exists) break;

    const nextTask = selectNextTask(freshNode.content);
    if (nextTask === null) break;

    await notify({ event: 'task_started', projectId, phaseLabel, detail: nextTask.slice(0, 80), runId }, config);
    appendToLog(phaseNode.path, { runId, event: 'task_started', detail: nextTask });

    // Fast path: run simple shell tasks directly (deterministic) instead of invoking an agent.
    const shellResult = tryRunShellTask(nextTask, ctx.repoPath);
    if (shellResult) {
      if (shellResult.ok) {
        if (!tickTask(phaseNode.path, nextTask)) {
          console.warn('[gzos] Shell task succeeded but checkbox not found — skipping');
        }
        tasksCompleted++;
        consecutiveFailures = 0;
        completedTasksList.push(nextTask.replace(/^\s*-\s*\[[ x]\]\s*/i, '').trim());
        appendToLog(phaseNode.path, { runId, event: 'task_done', detail: `${nextTask}\n\n[command output]\n${shellResult.output}`.trim() });
        await notify({ event: 'task_done', projectId, phaseLabel, detail: nextTask.slice(0, 80), runId }, config);
        if (config.maxIterations && tasksCompleted >= 200) {
          appendToLog(phaseNode.path, { runId, event: 'task_blocked', detail: `Sanity guard: ${tasksCompleted} tasks completed, halting phase loop` });
          break;
        }
        // Continue to next task
        continue;
      }

      // Shell commands are deterministic — retrying without code changes produces the
      // same result. Block immediately so replan can restructure the task.
      appendToLog(phaseNode.path, { runId, event: 'task_blocked', detail: `${nextTask}\n\n[command output]\n${shellResult.output}`.trim() });
      releaseLock(phaseNode.path, runId, 'phase-blocked');
      await notify({ event: 'phase_blocked', projectId, phaseLabel, detail: `Shell task failed: ${nextTask.slice(0, 60)}`, runId }, config);
      return { status: 'blocked', tasksCompleted, blockers: [shellResult.output], logNotePath, repoPath: ctx.repoPath };
    }

    // Classify task complexity and route to appropriate model/timeout
    const tier = classifyComplexity(nextTask, phaseNode.frontmatter);
    const effectiveModel = modelForTier(tier, config.modelTiers);
    const timeoutMs = tier === 'heavy' ? 900_000 : tier === 'light' ? 300_000 : 600_000;
    if (effectiveModel !== config.llm?.model) {
      console.log(`[gzos:complexity] P${phaseNum} task classified as "${tier}" → ${effectiveModel}`);
    }

    // Lean prompt — point agent at vault files, it reads them natively
    const acceptanceCriteria = extractAcceptanceCriteria(freshNode.raw);
    // Retrieve namespaced knowledge — same project prioritised, cross-project only if highly relevant
    let relevantKnowledge = '';
    try {
      relevantKnowledge = getRelevantKnowledge(config.vaultRoot, config.projectsGlob, projectId, nextTask, 5, 1200);
    } catch { /* non-fatal */ }

    const prompt = buildPrompt({ projectId, phaseNum, phaseLabel, nextTask, phaseNotePath: phaseNode.path, ctx, failureContext: lastFailureContext, attemptNumber: taskAttemptNumber, checkpoint: checkpoint ?? undefined, acceptanceCriteria, relevantKnowledge });

    // Allow per-project override: agent_driver in Overview frontmatter
    let driver = config.agentDriver;
    try {
      const ov = readPhaseNode(path.join(bundleDir, `${projectId} - Overview.md`));
      const override = String(ov.frontmatter['agent_driver'] ?? '').trim();
      if (override === 'cursor' || override === 'claude-code') driver = override as any;
    } catch {}

    const agentResult = await runAgent(driver, {
      prompt,
      systemPrompt: buildSystemPrompt(projectId, ctx.repoPath),
      repoPath: ctx.repoPath,
      timeoutMs,
      model: effectiveModel,
    });

    // ── Agent result handling ─────────────────────────────────────────────────
    //
    // Three outcomes, in priority order:
    //   1. Hard failure (non-zero exit / timeout)     → retry, then block after 3×
    //   2. Agent self-reported BLOCKED: <reason>      → retry, then block after 3×
    //   3. Clean success                              → tick the task, continue
    //
    // Retry is structural: we do NOT tick the task on failure, so the next loop
    // iteration calls selectNextTask() and gets the same task back. The failure
    // context is threaded into the next attempt's prompt so the agent can adapt.

    // Detect a self-reported blocker (agent exits 0 but prints BLOCKED: <reason>)
    const selfReportedBlocker = agentResult.success
      ? (agentResult.output.match(/^BLOCKED:\s*(.+)$/m)?.[1] ?? null)
      : null;

    if (!agentResult.success || selfReportedBlocker) {
      consecutiveFailures++;
      const errorDetail = selfReportedBlocker ?? agentResult.error ?? 'Agent returned failure';
      lastFailureContext = errorDetail;
      blockers.push(errorDetail);

      appendToLog(phaseNode.path, {
        runId,
        event: 'task_failed',
        detail: `Attempt ${taskAttemptNumber}/${3}: ${errorDetail.slice(0, 300)}`,
      });
      await notify({ event: 'task_blocked', projectId, phaseLabel, detail: errorDetail.slice(0, 80), runId }, config);

      if (consecutiveFailures >= 3) {
        // Agent is genuinely stuck — write a human requirement and surface the phase
        const detail = `Agent stuck after ${consecutiveFailures} attempts on: ${nextTask.slice(0, 80)}`;
        appendToLog(phaseNode.path, { runId, event: 'phase_blocked', detail });
        writeHumanRequirement(
          phaseNode.path,
          `Agent stuck after ${consecutiveFailures} attempts on:\n${nextTask}\n\nLast error:\n${errorDetail}`,
        );
        releaseLock(phaseNode.path, runId, 'phase-blocked');
        await notify({ event: 'phase_blocked', projectId, phaseLabel, detail, runId }, config);
        return { status: 'blocked', tasksCompleted, blockers, logNotePath, repoPath: ctx.repoPath };
      }

      // Not yet stuck — task stays unchecked; loop retries it next iteration
      taskAttemptNumber++;
      continue;
    }

    // ── Task succeeded ────────────────────────────────────────────────────────
    consecutiveFailures = 0;
    lastFailureContext  = undefined;
    taskAttemptNumber  = 1;

    const ticked = tickTask(phaseNode.path, nextTask);
    if (!ticked) {
      // Task checkbox couldn't be found in the file (format mismatch or external edit).
      // Without ticking, selectNextTask would return the same task → infinite loop.
      // Treat as a blocking failure so the operator can inspect.
      const detail = 'Agent succeeded but task checkbox could not be ticked — possible format mismatch';
      console.warn(`[gzos] ${detail}`);
      appendToLog(phaseNode.path, { runId, event: 'task_blocked', detail });
      writeHumanRequirement(phaseNode.path, `${detail}\n\nTask: ${nextTask}`);
      releaseLock(phaseNode.path, runId, 'phase-blocked');
      return { status: 'blocked', tasksCompleted, blockers: [detail], logNotePath, repoPath: ctx.repoPath };
    }
    tasksCompleted++;
    completedTasksList.push(nextTask.replace(/^\s*-\s*\[\s*[x ]?\s*\]\s*/, '').trim());
    appendToLog(phaseNode.path, { runId, event: 'task_done', detail: nextTask, filesChanged: agentResult.filesChanged });
    await notify({ event: 'task_done', projectId, phaseLabel, detail: nextTask.slice(0, 80), runId }, config);
  }

  // 5. Tick acceptance criteria (tasks all passed → criteria are met by definition)
  //    then verify the section is fully checked before marking complete.
  tickAcceptanceCriteria(phaseNode.path);

  const finalNode = readPhaseNode(phaseNode.path);
  const content   = finalNode.exists ? finalNode.content : phaseNode.content;

  if (acceptanceMet(content)) {
    appendToLog(phaseNode.path, { runId, event: 'acceptance_verified' });
    releaseLock(phaseNode.path, runId, 'phase-completed');

    // Auto-tag the repo at the point of phase completion
    // Tag: gzos/P{n}-done — lets you roll back to "right after P3 completed"
    try {
      const tagName = `gzos/P${phaseNum}-done`;
      const tagMsg  = `gzos: P${phaseNum} — ${phaseLabel} completed`;
      execSync(`git tag -a "${tagName}" -m "${tagMsg}"`, {
        cwd: ctx.repoPath,
        stdio: 'ignore',
        timeout: 10_000,
      });
      console.log(`[gzos] Tagged repo: ${tagName}`);
    } catch {
      // Non-fatal — repo may not be a git repo, or tag already exists
    }

    // Knowledge extraction happens in the controller loop via consolidatePhase,
    // which runs immediately after this function returns 'completed'.
    await notify({ event: 'phase_completed', projectId, phaseLabel, detail: `${tasksCompleted} tasks done`, runId }, config);
    return { status: 'completed', tasksCompleted, blockers, logNotePath, repoPath: ctx.repoPath };
  }

  appendToLog(phaseNode.path, { runId, event: 'phase_blocked', detail: 'Acceptance criteria not met' });
  releaseLock(phaseNode.path, runId, 'phase-blocked');
  await notify({ event: 'phase_blocked', projectId, phaseLabel, detail: 'Acceptance criteria not met', runId }, config);
  return { status: 'blocked', tasksCompleted, blockers: [...blockers, 'Acceptance criteria not met'], logNotePath, repoPath: ctx.repoPath };

  } catch (err) {
    // Guarantee lock release on any unexpected error in the task loop
    console.error('[gzos] Unexpected error in task loop — releasing lock:', (err as Error).message);
    appendToLog(phaseNode.path, { runId, event: 'task_failed', detail: `Unexpected error: ${(err as Error).message}` });
    releaseLock(phaseNode.path, runId, 'phase-blocked');
    return { status: 'error', tasksCompleted, blockers: [(err as Error).message], logNotePath, repoPath: ctx.repoPath };
  }
}

// Produce a clean single-line commit message summary from a task (may be multi-line)
function summariseTask(taskLine: string): string {
  const lines = taskLine.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip the bare "- [ ]" line; prefer Files: or first descriptive line
  for (const line of lines) {
    if (/^\s*[-*]\s*\[\s*[x ]?\s*\]\s*$/.test(line)) continue; // bare checkbox
    // Strip markdown checkbox prefix
    const clean = line.replace(/^\s*[-*]\s*\[\s*[x ]?\s*\]\s*/i, '').replace(/`/g, "'").trim();
    if (clean) return clean.slice(0, 60);
  }
  return lines[0]?.replace(/^\s*[-*]\s*\[\s*[x ]?\s*\]\s*/i, '').trim().slice(0, 60) ?? 'task';
}

// Extract acceptance criteria checkboxes from raw phase content
function extractAcceptanceCriteria(raw: string): string {
  const m = raw.match(/## Acceptance Criteria([\s\S]*?)(?=\n##|\s*$)/);
  if (!m) return '';
  return m[1]!.trim()
    .split('\n')
    .filter(l => /^\s*-\s*\[/.test(l))
    .map(l => l.trim())
    .slice(0, 8)
    .join('\n');
}

// Standing system prompt — operating contract for the Claude Code agent
function buildSystemPrompt(projectId: string, repoPath: string): string {
  return [
    `You are an autonomous coding agent working on project "${projectId}".`,
    `Working directory: ${repoPath}`,
    `Rules:`,
    `- Complete ONLY the assigned task. No scope creep.`,
    `- Work entirely within ${repoPath}.`,
    `- Commit with the exact message in INSTRUCTIONS.`,
    `- If blocked: output exactly BLOCKED: <clear reason>`,
    `- No destructive commands without explicit instruction.`,
  ].join('\n');
}

// Lean prompt: point the agent at vault files, let it read them natively.
// Agent gets full context (not truncated snippets) by reading files directly.
function buildPrompt(opts: {
  projectId: string;
  phaseNum: string;
  phaseLabel: string;
  nextTask: string;
  phaseNotePath: string;
  ctx: ContextPaths;
  failureContext?: string;
  attemptNumber?: number;
  checkpoint?: string;
  acceptanceCriteria: string;
  relevantKnowledge?: string;
}): string {
  const { projectId, phaseNum, phaseLabel, nextTask, phaseNotePath, ctx, failureContext, attemptNumber, checkpoint, acceptanceCriteria, relevantKnowledge } = opts;

  const sep = '─'.repeat(40);
  const contextFiles: string[] = [
    `- Phase note: ${phaseNotePath}`,
    `- Project overview: ${ctx.overviewPath}`,
  ];
  if (ctx.knowledgePath) contextFiles.push(`- Knowledge (learnings, gotchas): ${ctx.knowledgePath}`);
  if (ctx.decisionsPath) contextFiles.push(`- Decisions register: ${ctx.decisionsPath}`);
  if (ctx.researchPath)  contextFiles.push(`- Research notes: ${ctx.researchPath}`);
  if (checkpoint)        contextFiles.push(`- Prior run checkpoint: ${ctx.checkpointPath}`);

  return [
    `Project: ${projectId} | Phase P${phaseNum}: ${phaseLabel}`,
    `Repo: ${ctx.repoPath}`,
    '',
    failureContext ? `${sep}\n⚠️  ATTEMPT ${attemptNumber ?? 2} OF 3 — PREVIOUS ATTEMPT FAILED\n${sep}\n${failureContext.slice(0, 800)}\n\nAnalyse this error before writing code. Do not repeat the same approach.\n` : '',
    `${sep}\nYOUR TASK\n${sep}`,
    nextTask,
    '',
    `${sep}\nCONTEXT (read before starting)\n${sep}`,
    ...contextFiles,
    '',
    relevantKnowledge ? `\n${sep}\nRELEVANT KNOWLEDGE (from this project and related work)\n${sep}\n${relevantKnowledge}\n` : '',
    `${sep}\nINSTRUCTIONS\n${sep}`,
    `1. Read the phase note and project overview to understand scope, constraints, and architecture.`,
    ctx.knowledgePath ? `2. Read the knowledge file for prior learnings and gotchas.` : '',
    `3. Complete ONLY the task above.`,
    `4. Work in: ${ctx.repoPath}`,
    `5. Commit: git commit -m "gzos: P${phaseNum} — ${summariseTask(nextTask)}"`,
    `6. If blocked: output BLOCKED: <reason>`,
    ctx.decisionsPath ? `7. If you make an architectural decision, append to: ${ctx.decisionsPath}\n   Format: | D{next_id} | P${phaseNum} | arch/pattern/library | <decision> | <choice> | <rationale> | Yes/No |` : '',
    acceptanceCriteria ? `\nVerify before committing — Acceptance Criteria:\n${acceptanceCriteria}` : '',
  ].filter(Boolean).join('\n');
}
