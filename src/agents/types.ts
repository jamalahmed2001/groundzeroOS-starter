import type { AgentDriver } from '../config/load.js';
import { spawnClaudeCode } from './claudeCodeSpawn.js';
import { spawnCursor } from './cursorSpawn.js';

export interface AgentRequest {
  prompt: string;
  repoPath: string;
  addDirs?: string[];      // explicit --add-dir list; if set, used instead of repoPath for file access
  context?: string;        // phase note content + knowledge snippets
  systemPrompt?: string;   // standing operating contract passed via --append-system-prompt
  timeoutMs?: number;      // default: 600000 (10 min)
  model?: string;          // override model for this request (complexity routing)
}

export interface AgentResult {
  success: boolean;
  output: string;
  filesChanged: string[];
  error?: string;
  durationMs: number;
}

// Dispatch to the correct agent based on driver config.
export async function runAgent(driver: AgentDriver, request: AgentRequest): Promise<AgentResult> {
  switch (driver) {
    case 'claude-code':
      return spawnClaudeCode(request);
    case 'cursor':
      return spawnCursor(request);
    default: {
      const _exhaustive: never = driver;
      throw new Error(`Unknown agent driver: ${_exhaustive}`);
    }
  }
}
