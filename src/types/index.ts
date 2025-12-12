/**
 * Input received by hooks from Claude Code via stdin
 */
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart' | 'SessionEnd';
  source?: 'startup' | 'clear' | 'compact' | 'resume';
  reason?: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

/**
 * Output returned by hooks to Claude Code via stdout
 */
export interface HookOutput {
  continue: boolean;
  suppressOutput: boolean;
}

/**
 * A single row in session_stats.md (either START or END event)
 */
export interface SessionRow {
  sessionId: string;
  project: string;
  event: 'START' | 'END';
  timestamp: string;        // ISO 8601 format
  model: string | null;
  duration: string | null;  // "HH:MM:SS" format, only for END
  claudeTime: string | null;
  cost: number | null;
  tokens: number | null;
  flags: string | null;     // e.g., "[Abnormal End]"
}

/**
 * Aggregated totals stored in the header of session_stats.md
 */
export interface StatsFileTotals {
  sessions: number;
  totalDuration: string;    // "HH:MM:SS"
  totalClaudeTime: string;  // "HH:MM:SS"
  totalCost: number;
  totalTokens: number;
}

/**
 * Parsed representation of session_stats.md
 */
export interface StatsFile {
  totals: StatsFileTotals;
  rows: SessionRow[];
}
