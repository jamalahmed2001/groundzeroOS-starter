import type { ControllerConfig } from '../config/load.js';
import { chatCompletion } from './client.js';
import { spawnClaudeCode } from '../agents/claudeCodeSpawn.js';

/**
 * Planning always gets the heavy model tier.
 *
 * Decomposing a codebase into phases and atomising tasks into concrete steps
 * is the hardest cognitive work in the pipeline — it requires understanding
 * architecture, existing patterns, and making sound decomposition decisions.
 * This is worth the best model available.
 *
 * Execution uses tier-based routing (light/standard/heavy per task complexity)
 * because each task has a detailed spec to follow and a cheaper model suffices.
 */
function planningModel(config: ControllerConfig): string {
  // Planning always uses the heavy tier — it requires the best reasoning available.
  // light/standard are for execution tasks that have a concrete spec to follow.
  return config.modelTiers.heavy;
}

/**
 * Route a planning LLM call to the best available model:
 *
 *   claude-code + valid repoPath → spawnClaudeCode with --add-dir
 *     The agent has live filesystem access and can read, grep, and explore
 *     the repo before writing the plan. Far better than a static file tree.
 *     Uses the heavy model tier (Opus by default).
 *
 *   otherwise → chatCompletion (OpenRouter)
 *     Falls back to direct API call with the file tree embedded in the prompt.
 *     Also uses the heavy model tier.
 */
export async function planningCall(opts: {
  config: ControllerConfig;
  repoPath: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  const { config, repoPath, systemPrompt, userPrompt, maxTokens } = opts;
  const model = planningModel(config);

  if (config.agentDriver === 'claude-code' && repoPath) {
    // Strip vendor prefix for the Claude CLI (expects bare model IDs)
    const result = await spawnClaudeCode({
      prompt: userPrompt,
      repoPath,
      systemPrompt,
      timeoutMs: 600_000, // planning reads files + reasons — 10 min ceiling
      model,
    });
    if (!result.success) {
      throw new Error(`Planning agent failed: ${result.error ?? result.output.slice(0, 300)}`);
    }
    return result.output;
  }

  // Fallback: direct OpenRouter call with the heavy model
  const apiKey = config.llm.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('planningCall: no API key — set OPENROUTER_API_KEY');

  return chatCompletion({
    model,
    apiKey,
    baseUrl: config.llm.baseUrl,
    maxTokens: maxTokens ?? 4000, // heavier model, more budget for richer plans
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
}

/** True when planning calls will go through the agent driver (no OpenRouter key needed). */
export function planningUsesAgent(config: ControllerConfig, repoPath: string): boolean {
  return config.agentDriver === 'claude-code' && Boolean(repoPath);
}
