import type { AgentRequest, AgentResult } from './types.js';
import { buildPrompt, spawnAgentProcess } from './spawnAgent.js';

// Spawn Claude Code CLI:
//   claude --dangerously-skip-permissions --output-format text --print <prompt> --add-dir <repoPath>
export async function spawnClaudeCode(request: AgentRequest): Promise<AgentResult> {
  const fullPrompt = buildPrompt(request);

  // Claude CLI uses bare model IDs — strip vendor prefix from OpenRouter format
  // e.g. "anthropic/claude-haiku-4-5-20251001" → "claude-haiku-4-5-20251001"
  const claudeModel = request.model?.replace(/^[^/]+\//, '');

  // addDirs: explicit list takes priority; fall back to single repoPath for backward compat
  const dirsToAdd = request.addDirs ?? (request.repoPath ? [request.repoPath] : []);
  const addDirArgs = dirsToAdd.flatMap(d => ['--add-dir', d]);

  const args = [
    '--dangerously-skip-permissions',
    '--output-format', 'text',
    '--print', fullPrompt,
    ...addDirArgs,
    ...(claudeModel ? ['--model', claudeModel] : []),
    ...(request.systemPrompt ? ['--append-system-prompt', request.systemPrompt] : []),
  ];

  return spawnAgentProcess('claude', args, request);
}
