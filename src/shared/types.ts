// Shared type definitions for GroundZeroOS.
// Both CLI and dashboard import from here — this is the single source of truth.

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export interface SchemaViolation {
  path:     string;
  noteType: 'phase' | 'overview' | 'hub' | 'kanban' | 'log';
  errors:   string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// FSM
// ---------------------------------------------------------------------------

export type PhaseState = 'backlog' | 'planning' | 'ready' | 'active' | 'blocked' | 'completed';

export type PhaseTag =
  | 'phase-backlog'
  | 'phase-planning'
  | 'phase-ready'
  | 'phase-active'
  | 'phase-blocked'
  | 'phase-completed';

// ---------------------------------------------------------------------------
// Vault nodes
// ---------------------------------------------------------------------------

export interface PhaseNode {
  path: string;
  exists: boolean;
  frontmatter: Record<string, unknown>;
  content: string;  // body after frontmatter
  raw: string;      // full file text
}

export interface VaultBundle {
  projectId: string;
  bundleDir: string;
  overview: PhaseNode;
  docsHub: PhaseNode;
  kanban: PhaseNode;
  knowledge: PhaseNode;
  repoContext: PhaseNode;
  agentLogHub: PhaseNode;
  phases: PhaseNode[];
  logsDir: string;
}

// ---------------------------------------------------------------------------
// Project / Phase (shared between CLI status --json and dashboard)
// ---------------------------------------------------------------------------

export interface GZPhase {
  path: string;
  phaseNum: number;
  phaseName: string;
  status: PhaseState;
  lockedBy?: string;
  lockedAt?: string;
  tasksDone: number;
  tasksTotal: number;
  nextTask?: string;
  milestone?: string;
  risk?: string;
  dependsOn?: number[];
  blockedReason?: string;
}

export interface GZProject {
  id: string;
  overviewPath: string;
  repoPath?: string;
  linearProjectId?: string;
  status: string;
  phases: GZPhase[];
  phaseCount: number;
}

export interface StatusSnapshot {
  timestamp: string;
  projects: GZProject[];
}

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

export type LogEventType =
  | 'lock_acquired' | 'lock_released'
  | 'task_started' | 'task_done' | 'task_blocked' | 'task_failed'
  | 'state_transition'
  | 'stale_lock_cleared'
  | 'phase_completed' | 'phase_blocked'
  | 'acceptance_verified'
  | 'atomise_started' | 'atomise_done'
  | 'replan_started' | 'replan_done' | 'replan_failed'
  | 'linear_import_done' | 'linear_uplink_done'
  | 'consolidate_done'
  | 'schema_violation' | 'lock_expired' | 'lock_force_cleared' | 'phase_started';

export interface LogEntry {
  runId: string;
  event: LogEventType;
  detail?: string;
  filesChanged?: string[];
}

export interface AuditEvent {
  ts:             string;
  event:          LogEventType;
  phaseNotePath?: string;
  projectId?:     string;
  runId?:         string;
  pid?:           number;
  hostname?:      string;
  detail?:        string;
}

// ---------------------------------------------------------------------------
// Dashboard-specific (also exported here so dashboard doesn't need its own)
// ---------------------------------------------------------------------------

export interface RunEntry {
  project: string;
  phaseName: string;
  phaseNum: number;
  path: string;
  modifiedAt: string;
  sizeKb: number;
  lastEvent?: string;
  lastDetail?: string;
  phaseStatus?: string;
}

export interface VaultFileNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: VaultFileNode[];
}

export interface DailyPlan {
  date: string;
  raw: string;
  exists: boolean;
}

export interface InboxItem {
  text: string;
  done: boolean;
  ts?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'project' | 'phase' | 'hub';
  status?: PhaseState;
  path: string;
  color?: string;
  hubLevel?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AgentDriver = 'cursor' | 'claude-code';

export interface ControllerConfig {
  vaultRoot: string;
  projectsGlob: string;
  reposRoot?: string;
  staleLockThresholdMs: number;
  maxIterations: number;
  agentDriver: AgentDriver;
  llm: {
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
  modelTiers: {
    light: string;
    standard: string;
    heavy: string;
  };
  linear?: {
    apiKey: string;
    teamId: string;
  };
  notify: {
    stdout: boolean;

    // OpenClaw Gateway — `openclaw message send --target <E.164> --message <text>`
    // Requires openclaw CLI installed + logged in. Or set OPENCLAW_NOTIFY_TARGET env var.
    openclaw?: {
      target: string;      // E.164 phone number, e.g. "+4477..."
      channel?: string;
      profile?: string;
      accountId?: string;
    };

    // Legacy: CallMeBot WhatsApp (kept for backward compat, not recommended)
    whatsapp?: {
      apiUrl: string;
      recipient: string;
    };
  };
  prompts?: {
    executor?: string;
    decompose?: string;
    atomise?: string;
    extend?: string;
    replan?: string;
    consolidate?: string;
  };
}
