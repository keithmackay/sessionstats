// ABOUTME: Detects crashed/orphaned sessions (START without END) and auto-closes them
// ABOUTME: Marks orphaned sessions with [Abnormal End] flag for visibility

import { parseStatsFile } from './stats-parser.js';
import { appendRow } from './stats-writer.js';
import { calculateDuration } from './formatters.js';
import type { SessionRow } from '../types/index.js';

/**
 * Detect orphaned sessions (START without END) and close them with [Abnormal End]
 * Returns array of sessions that were closed
 */
export function detectAndCloseOrphans(filePath: string): SessionRow[] {
  const stats = parseStatsFile(filePath);
  const closedOrphans: SessionRow[] = [];

  // Group rows by sessionId
  const sessionIds = new Set(stats.rows.map(r => r.sessionId));

  for (const sessionId of sessionIds) {
    const sessionRows = stats.rows.filter(r => r.sessionId === sessionId);
    const hasStart = sessionRows.some(r => r.event === 'START');
    const hasEnd = sessionRows.some(r => r.event === 'END');

    if (hasStart && !hasEnd) {
      // Found orphan - get the START row to extract details
      const startRow = sessionRows.find(r => r.event === 'START')!;

      const endRow: SessionRow = {
        sessionId,
        project: startRow.project,
        event: 'END',
        timestamp: new Date().toISOString(),
        model: startRow.model,
        duration: calculateDuration(startRow.timestamp, new Date().toISOString()),
        claudeTime: null,
        cost: null,
        tokens: null,
        flags: '[Abnormal End]'
      };

      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }

  return closedOrphans;
}
