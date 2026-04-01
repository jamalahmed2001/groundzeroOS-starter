import path from 'path';
import fs from 'fs';
import { readRawFile } from '../vault/reader.js';

// Re-export types from shared for backward compatibility
export type { AgentDriver, ControllerConfig } from '../shared/types.js';
import type { AgentDriver, ControllerConfig } from '../shared/types.js';

// Canonical config shape: snake_case only.
// camelCase fallbacks kept for backward compat but will be removed in a future release.
interface RawConfig {
  vault_root?: string;
  vaultRoot?: string;              // deprecated: use vault_root
  projects_glob?: string;
  projectsGlob?: string;          // deprecated
  repos_root?: string;
  reposRoot?: string;              // deprecated
  stale_lock_threshold_ms?: number;
  staleLockThresholdMs?: number;   // deprecated
  max_iterations?: number;
  maxIterations?: number;          // deprecated
  agent_driver?: string;
  agentDriver?: string;            // deprecated
  llm?: {
    model?: string;
    api_key?: string;
    apiKey?: string;               // deprecated
    base_url?: string;
    baseUrl?: string;              // deprecated
  };
  model_tiers?: {
    light?: string;
    standard?: string;
    heavy?: string;
  };
  modelTiers?: {                   // deprecated
    light?: string;
    standard?: string;
    heavy?: string;
  };
  linear?: {
    api_key?: string;
    apiKey?: string;               // deprecated
    team_id?: string;
    teamId?: string;               // deprecated
  };
  notify?: {
    stdout?: boolean;
    whatsapp?: {
      api_url?: string;
      apiUrl?: string;             // deprecated
      recipient?: string;
    };
    openclaw?: {
      target?: string;
      channel?: string;
      profile?: string;
      account_id?: string;
      accountId?: string;          // deprecated
    };
  };
}

// Load .env file into process.env (simple parser — no dotenv dependency needed).
// Only sets keys that are not already in process.env (env vars take precedence).
function loadDotEnv(cwd: string): void {
  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key   = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); // strip quotes
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Load config from groundzero.config.json (and .env for secrets).
// GROUNDZERO_VAULT_ROOT env always overrides vault_root in file.
// Throws with a clear human-readable message if required fields are missing.
export function loadConfig(configPath?: string): ControllerConfig {
  // Load .env first so env vars are available for the rest of this function
  loadDotEnv(process.cwd());

  const resolvedPath = configPath ?? path.resolve(process.cwd(), 'groundzero.config.json');

  let raw: RawConfig = {};
  const content = readRawFile(resolvedPath);
  if (content !== null) {
    raw = JSON.parse(content) as RawConfig;
  }

  const vaultRoot =
    process.env['GROUNDZERO_VAULT_ROOT'] ??
    raw.vault_root ??
    raw.vaultRoot;

  if (!vaultRoot) {
    throw new Error(
      '\n[gzos] vault_root is required.\n\n' +
      '  Option A: Set it in groundzero.config.json\n' +
      '    { "vault_root": "/path/to/your/obsidian/vault" }\n\n' +
      '  Option B: Set GROUNDZERO_VAULT_ROOT in your .env file\n' +
      '    GROUNDZERO_VAULT_ROOT=/path/to/your/obsidian/vault\n\n' +
      '  Run: gzos doctor  — to check all configuration\n'
    );
  }

  const agentDriverRaw  = raw.agent_driver ?? raw.agentDriver ?? 'claude-code';
  const agentDriver: AgentDriver = agentDriverRaw === 'cursor' ? 'cursor' : 'claude-code';

  const linear = raw.linear
    ? {
        apiKey: raw.linear.api_key ?? raw.linear.apiKey ?? process.env['LINEAR_API_KEY'] ?? '',
        teamId: raw.linear.team_id ?? raw.linear.teamId ?? process.env['LINEAR_TEAM_ID'] ?? '',
      }
    : undefined;

  // WhatsApp: merge env vars (WHATSAPP_RECIPIENT, WHATSAPP_API_KEY) into config
  const envWhatsappRecipient = process.env['WHATSAPP_RECIPIENT'];
  const envWhatsappApiKey = process.env['WHATSAPP_API_KEY'];

  let whatsapp: ControllerConfig['notify']['whatsapp'];
  if (raw.notify?.whatsapp) {
    whatsapp = {
      apiUrl: raw.notify.whatsapp.api_url ?? raw.notify.whatsapp.apiUrl ?? '',
      recipient: envWhatsappRecipient ?? raw.notify.whatsapp.recipient ?? '',
    };
  } else if (envWhatsappRecipient && envWhatsappApiKey) {
    whatsapp = {
      apiUrl: `https://api.callmebot.com/whatsapp.php?apikey=${envWhatsappApiKey}`,
      recipient: envWhatsappRecipient,
    };
  }

  const modelTiers = raw.model_tiers ?? raw.modelTiers;
  const reposRoot = raw.repos_root ?? raw.reposRoot;

  // OpenClaw: merge env vars into config
  const envOpenClawTarget = process.env['OPENCLAW_NOTIFY_TARGET'];
  const envOpenClawChannel = process.env['OPENCLAW_NOTIFY_CHANNEL'];
  const envOpenClawProfile = process.env['OPENCLAW_PROFILE'];
  const envOpenClawAccountId = process.env['OPENCLAW_ACCOUNT_ID'];

  const rawOpenClaw = raw.notify?.openclaw;
  const openclaw = (rawOpenClaw?.target ?? envOpenClawTarget)
    ? {
        target: (rawOpenClaw?.target ?? envOpenClawTarget) as string,
        channel: rawOpenClaw?.channel ?? envOpenClawChannel,
        profile: rawOpenClaw?.profile ?? envOpenClawProfile,
        accountId: rawOpenClaw?.account_id ?? rawOpenClaw?.accountId ?? envOpenClawAccountId,
      }
    : undefined;

  return {
    vaultRoot,
    projectsGlob: raw.projects_glob ?? raw.projectsGlob ?? '01 - Projects/**',
    reposRoot,
    staleLockThresholdMs: raw.stale_lock_threshold_ms ?? raw.staleLockThresholdMs ?? 300_000,
    maxIterations: raw.max_iterations ?? raw.maxIterations ?? 20,
    agentDriver,
    modelTiers,
    llm: {
      model: raw.llm?.model ?? 'anthropic/claude-sonnet-4-6',
      // Secrets: env vars override config (so they stay out of git)
      apiKey:
        process.env['OPENROUTER_API_KEY'] ??
        process.env['ANTHROPIC_API_KEY'] ??
        raw.llm?.api_key ??
        raw.llm?.apiKey,
      baseUrl: raw.llm?.base_url ?? raw.llm?.baseUrl ?? process.env['OPENROUTER_BASE_URL'],
    },
    linear,
    notify: {
      stdout: raw.notify?.stdout ?? true,
      whatsapp,
      openclaw,
    },
  };
}
