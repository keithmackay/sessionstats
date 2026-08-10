// ABOUTME: SessionEnd hook — parses the transcript + subagents via token-engine (no ccusage), records END
// ABOUTME: Applies project config's tags/postToWeb to the row for future reporting/upload

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { findStartRow } from '../lib/stats-parser.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { calculateDuration } from '../lib/formatters.js';
import { parseSessionTranscript } from '../lib/token-engine.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';

async function sessionEndHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(input.cwd);
  const endTime = new Date().toISOString();

  const startRow = findStartRow(statsPath, input.session_id);
  const config = loadOrCreateProjectConfig(input.cwd);

  let transcriptStats;
  try {
    transcriptStats = parseSessionTranscript(input.transcript_path);
  } catch (error) {
    console.error('[sessionstats] Could not read transcript (this is OK):', error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }

  const duration = startRow ? calculateDuration(startRow.timestamp, endTime) : null;

  const endRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'END',
    timestamp: endTime,
    duration,
    models: transcriptStats.models,
    apiMessages: transcriptStats.apiMessages,
    userMessages: transcriptStats.userMessages,
    toolCalls: transcriptStats.toolCalls,
    subagentCount: transcriptStats.subagentCount,
    cacheHitRate: transcriptStats.cacheHitRate,
    flags: startRow ? null : '[No Start Found]',
    machineId: getMachineId(),
  };

  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error('[sessionstats] Error recording session end:', error);
  }

  // config.tags / config.postToWeb are available here for the future web-upload phase (not implemented yet).
  void config;

  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionEndHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
