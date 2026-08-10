// ABOUTME: SessionStart hook — creates .sessionstats/ config if missing, detects orphans, records START
// ABOUTME: Never blocks tracking on interactive setup completing (needsSetupConfirmation is advisory)

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { detectAndCloseOrphans } from '../lib/orphan-detector.js';
import { loadOrCreateProjectConfig, ensureGitignoreEntry } from '../lib/project-config.js';
import { postSessionToWeb } from '../lib/web-post.js';

async function sessionStartHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(input.cwd);

  const config = loadOrCreateProjectConfig(input.cwd);
  ensureGitignoreEntry(input.cwd);

  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[sessionstats] Closed ${closedOrphans.length} orphaned session(s)`);
      if (config.postToWeb) {
        for (const orphan of closedOrphans) {
          await postSessionToWeb(orphan, projectName, config.tags);
        }
      }
    }
  } catch (error) {
    console.error('[sessionstats] Error detecting orphans:', error);
  }

  const startRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'START',
    timestamp: new Date().toISOString(),
    duration: null,
    models: [],
    apiMessages: null,
    userMessages: null,
    toolCalls: null,
    subagentCount: null,
    cacheHitRate: null,
    flags: null,
    machineId: getMachineId(),
  };

  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error('[sessionstats] Error recording session start:', error);
  }

  const output: HookOutput = { continue: true, suppressOutput: !config.needsSetupConfirmation };
  if (config.needsSetupConfirmation) {
    console.error(
      '[sessionstats] This project has not confirmed its .sessionstats/config.json yet. ' +
      'Please interactively confirm/adjust projectName, tags, userEmail, and postToWeb with the user now ' +
      '(same flow as /session_setup), then clear needsSetupConfirmation in .sessionstats/config.json.'
    );
  }
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionStartHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
