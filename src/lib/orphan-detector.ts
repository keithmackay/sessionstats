// ABOUTME: Detects crashed/orphaned sessions (START without END) and auto-closes them
// ABOUTME: Marks orphaned sessions with [Abnormal End] flag; no token/cost data available for these

import { parseStatsFile } from './stats-parser.js';
import { appendRow, getMachineId } from './stats-writer.js';
import { calculateDuration } from './formatters.js';
import type { SessionRow } from '../types/index.js';

export function detectAndCloseOrphans(filePath: string): SessionRow[] {
  const stats = parseStatsFile(filePath);
  const closedOrphans: SessionRow[] = [];

  const sessionIds = new Set(stats.rows.map(r => r.sessionId));

  for (const sessionId of sessionIds) {
    const sessionRows = stats.rows.filter(r => r.sessionId === sessionId);
    const hasStart = sessionRows.some(r => r.event === 'START');
    const hasEnd = sessionRows.some(r => r.event === 'END');

    if (hasStart && !hasEnd) {
      const startRow = sessionRows.find(r => r.event === 'START')!;

      const endRow: SessionRow = {
        sessionId,
        project: startRow.project,
        event: 'END',
        timestamp: new Date().toISOString(),
        duration: calculateDuration(startRow.timestamp, new Date().toISOString()),
        models: [],
        apiMessages: null,
        userMessages: null,
        toolCalls: null,
        subagentCount: null,
        cacheHitRate: null,
        flags: '[Abnormal End]',
        machineId: startRow.machineId || getMachineId(),
      };

      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }

  return closedOrphans;
}
