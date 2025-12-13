// ABOUTME: SessionStart hook that records when a Claude Code session begins
// ABOUTME: Also detects and auto-closes orphaned sessions from crashes

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { detectAndCloseOrphans } from '../lib/orphan-detector.js';

async function sessionStartHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, 'session_stats.md');
  const projectName = path.basename(input.cwd);

  // Detect and close any orphaned sessions first
  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[cc-session-track] Closed ${closedOrphans.length} orphaned session(s)`);
    }
  } catch (error) {
    console.error('[cc-session-track] Error detecting orphans:', error);
  }

  // Record new session start
  const startRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'START',
    timestamp: new Date().toISOString(),
    model: null, // Will be captured on END from ccusage
    duration: null,
    claudeTime: null,
    cost: null,
    tokens: null,
    flags: null,
    machineId: getMachineId()
  };

  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error('[cc-session-track] Error recording session start:', error);
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
    await sessionStartHook(parsed);
  } catch (error) {
    console.error('[cc-session-track] Hook error:', error);
    // Always output valid JSON even on error
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
