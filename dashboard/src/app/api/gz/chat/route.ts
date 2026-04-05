import { NextResponse } from 'next/server';
import { getVaultRoot, getAllProjects } from '@/lib/vault';
import { readConfig } from '@/lib/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function readFile(abs: string): string | null {
  try { return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null; }
  catch { return null; }
}

function buildProjectContext(vaultRoot: string, projectId?: string): string {
  const projects = getAllProjects(vaultRoot);
  if (projectId) {
    const p = projects.find(proj => proj.id === projectId);
    if (!p) return `Project "${projectId}" not found.`;

    const overviewRaw = readFile(path.resolve(vaultRoot, p.overviewPath));
    const bundleDir = path.dirname(path.resolve(vaultRoot, p.overviewPath));
    const knowledgeRaw = readFile(path.join(bundleDir, `${p.id} - Knowledge.md`));
    const decisionsRaw = readFile(path.join(bundleDir, `${p.id} - Decisions.md`));

    const phaseSummaries = p.phases.map(ph =>
      `  P${ph.phaseNum} — ${ph.phaseName} [${ph.status}] (${ph.tasksDone}/${ph.tasksTotal} tasks)${ph.nextTask ? ` next: ${ph.nextTask}` : ''}`
    ).join('\n');

    return [
      `# Project: ${p.id}`,
      overviewRaw ? `\n## Overview\n${overviewRaw.slice(0, 2000)}` : '',
      `\n## Phases (${p.phases.length})\n${phaseSummaries || '(none)'}`,
      knowledgeRaw ? `\n## Knowledge\n${knowledgeRaw.slice(0, 1500)}` : '',
      decisionsRaw ? `\n## Decisions\n${decisionsRaw.slice(0, 800)}` : '',
    ].filter(Boolean).join('\n');
  }

  // No specific project — give a summary of all
  const lines = projects.map(p => {
    const done = p.phases.filter(ph => ph.status === 'completed').length;
    const active = p.phases.filter(ph => ph.status === 'active').length;
    const blocked = p.phases.filter(ph => ph.status === 'blocked').length;
    return `- **${p.id}**: ${p.phases.length} phases (${done} done, ${active} active, ${blocked} blocked)`;
  });
  return `# All Projects\n\n${lines.join('\n')}`;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const body = await req.json() as { messages: ChatMessage[]; projectId?: string; repoPath?: string };
  const { messages, projectId, repoPath } = body;

  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 });
  }

  const cfg = readConfig();
  const vaultRoot = getVaultRoot();
  const context = buildProjectContext(vaultRoot, projectId);
  const driver = cfg.agent_driver ?? 'claude-code';

  // Build conversation history as prompt
  const lastMessages = messages.slice(-8);
  const conversationBlock = lastMessages
    .map(m => m.role === 'user' ? `Human: ${m.content}` : `Assistant: ${m.content}`)
    .join('\n\n');

  const systemPrompt = `You are a senior technical advisor embedded in GroundZeroOS, a project orchestration dashboard.

You have access to the project context below AND full read access to the repo via your tools (Read, Glob, Grep).

${context}

Your role:
- Answer questions about project scope, architecture, and progress
- Help the user reason about what to build next
- Suggest phase scope, acceptance criteria, and task breakdowns
- Flag risks or dependencies between phases
- Read actual code files when needed to give accurate answers
- Be concise and direct — the user is an experienced engineer

Do NOT make changes to any files. Read-only.`;

  const userMessage = lastMessages[lastMessages.length - 1]?.content ?? '';

  // Build the full prompt with conversation context
  const prompt = lastMessages.length > 1
    ? `Previous conversation:\n\n${conversationBlock.slice(0, -userMessage.length - 10)}\n\nNow answer this:\n\n${userMessage}`
    : userMessage;

  try {
    const cmd = driver === 'cursor' ? 'cursor' : 'claude';
    const addDir = repoPath || vaultRoot;

    const args = [
      '--dangerously-skip-permissions',
      '--output-format', 'text',
      '--print', prompt,
      '--add-dir', addDir,
      '--append-system-prompt', systemPrompt,
    ];

    const output = execSync(
      `${cmd} ${args.map(a => JSON.stringify(a)).join(' ')}`,
      {
        encoding: 'utf-8',
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
        cwd: addDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    // Strip ANSI codes
    const clean = output.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();
    return NextResponse.json({ reply: clean });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = ((e.stdout ?? '') + (e.stderr ?? '')).replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();
    if (output) return NextResponse.json({ reply: output });
    return NextResponse.json({ error: `Agent failed: ${e.message?.slice(0, 200)}` }, { status: 500 });
  }
}
