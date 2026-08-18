// ABOUTME: Reconstructs .sessionstats/session_stats.json rows from raw Claude Code transcript JSONL files
// ABOUTME: Used by /sessionstats_rebuild to recover history for projects that predate live tracking

import fs from 'fs';
import path from 'path';
import type { SessionRow } from '../types/index.js';
import { getProjectTranscriptDir } from './transcript-dir.js';
import { parseSessionTranscript } from './token-engine.js';
import { calculateDuration } from './formatters.js';
import { writeStatsFile } from './stats-writer.js';

function firstAndLastTimestamps(content: string): { first: string; last: string } | null {
  let first: string | null = null;
  let last: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof entry.timestamp !== 'string' || !entry.timestamp) continue;
    if (!first) first = entry.timestamp;
    last = entry.timestamp;
  }

  return first && last ? { first, last } : null;
}

export function rebuildSessionRows(projectDir: string): SessionRow[] {
  const transcriptDir = getProjectTranscriptDir(projectDir);
  const projectName = path.basename(projectDir);

  if (!fs.existsSync(transcriptDir)) return [];

  const sessionFiles = fs.readdirSync(transcriptDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(transcriptDir, f));

  const sessions: { sessionId: string; first: string; last: string; startRow: SessionRow; endRow: SessionRow }[] = [];

  for (const filePath of sessionFiles) {
    const sessionId = path.basename(filePath, '.jsonl');
    const content = fs.readFileSync(filePath, 'utf-8');
    const timestamps = firstAndLastTimestamps(content);
    if (!timestamps) continue;

    const { first, last } = timestamps;

    let transcriptStats;
    try {
      transcriptStats = parseSessionTranscript(filePath);
    } catch {
      transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
    }

    const startRow: SessionRow = {
      sessionId, project: projectName, event: 'START', timestamp: first,
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null,
      subagentCount: null, cacheHitRate: null, flags: '[Reconstructed]', machineId: null,
    };

    const endRow: SessionRow = {
      sessionId, project: projectName, event: 'END', timestamp: last,
      duration: calculateDuration(first, last),
      models: transcriptStats.models,
      apiMessages: transcriptStats.apiMessages,
      userMessages: transcriptStats.userMessages,
      toolCalls: transcriptStats.toolCalls,
      subagentCount: transcriptStats.subagentCount,
      cacheHitRate: transcriptStats.cacheHitRate,
      flags: '[Reconstructed]',
      machineId: null,
    };

    sessions.push({ sessionId, first, last, startRow, endRow });
  }

  sessions.sort((a, b) => a.first.localeCompare(b.first));

  return sessions.flatMap(s => [s.startRow, s.endRow]);
}

export function rebuildStatsFile(projectDir: string): SessionRow[] {
  const rows = rebuildSessionRows(projectDir);
  const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
  writeStatsFile(statsPath, rows);
  return rows;
}
