import { stdin } from 'process';
import path from 'path';
import { execSync } from 'child_process';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow, findStartRow } from '../lib/stats-file.js';
import { calculateDuration } from '../lib/formatters.js';

interface CcusageSession {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  modelsUsed: string[];
}

/**
 * Get session metrics from ccusage CLI
 */
function getSessionMetrics(): CcusageSession | null {
  try {
    // Use ccusage CLI to get session data
    const output = execSync('npx ccusage@latest session --json 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const data = JSON.parse(output);
    if (data && data.sessions && data.sessions.length > 0) {
      // Get the most recent session (should be the current one)
      const session = data.sessions[data.sessions.length - 1];
      return {
        sessionId: session.sessionId || '',
        totalCost: session.totalCost || 0,
        totalTokens: session.totalTokens || 0,
        modelsUsed: session.modelsUsed || []
      };
    }
  } catch (error) {
    // ccusage may not be available or may fail - that's OK
    console.error('[cc-session-track] Could not get ccusage metrics (this is OK)');
  }
  return null;
}

async function sessionEndHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, 'session_stats.md');
  const projectName = path.basename(input.cwd);
  const endTime = new Date().toISOString();

  // Find matching START row
  const startRow = findStartRow(statsPath, input.session_id);

  // Get metrics from ccusage
  const metrics = getSessionMetrics();

  // Calculate duration if we have a start time
  const duration = startRow
    ? calculateDuration(startRow.timestamp, endTime)
    : null;

  // Determine model - prefer ccusage data, fallback to start row
  const model = metrics?.modelsUsed[0] || startRow?.model || null;

  // Record END row
  const endRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'END',
    timestamp: endTime,
    model,
    duration,
    claudeTime: null, // ccusage doesn't provide this directly
    cost: metrics?.totalCost || null,
    tokens: metrics?.totalTokens || null,
    flags: startRow ? null : '[No Start Found]'
  };

  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error('[cc-session-track] Error recording session end:', error);
  }

  // Output success response
  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

// Entry point - read JSON from stdin
let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionEndHook(parsed);
  } catch (error) {
    console.error('[cc-session-track] Hook error:', error);
    // Always output valid JSON even on error
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
