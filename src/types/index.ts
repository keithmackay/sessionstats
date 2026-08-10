// ABOUTME: TypeScript interfaces for sessionstats plugin
// ABOUTME: Defines hook I/O, session rows, stats file structure, and per-project/plugin config

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart' | 'SessionEnd';
  source?: 'startup' | 'clear' | 'compact' | 'resume';
  reason?: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

export interface HookOutput {
  continue: boolean;
  suppressOutput: boolean;
}

export interface ModelUsage {
  model: string;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cost: number | null;
}

export interface SessionRow {
  sessionId: string;
  project: string;
  event: 'START' | 'END';
  timestamp: string;
  duration: string | null;
  models: ModelUsage[];
  apiMessages: number | null;
  userMessages: number | null;
  toolCalls: number | null;
  subagentCount: number | null;
  cacheHitRate: number | null;
  flags: string | null;
  machineId: string | null;
}

export interface StatsFileTotals {
  sessions: number;
  totalDuration: string;
  totalCost: number;
  totalTokens: number;
}

export interface StatsFile {
  schemaVersion: number;
  totals: StatsFileTotals;
  rows: SessionRow[];
}

export interface ProjectConfig {
  schemaVersion: number;
  projectName: string;
  tags: string[];
  userEmail: string | null;
  postToWeb: boolean;
  needsSetupConfirmation?: boolean;
}

export interface PluginConfig {
  websiteUrl: string | null;
  scanRoots: string[];
}
