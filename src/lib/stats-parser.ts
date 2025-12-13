// ABOUTME: Parser for session_stats.md file format
// ABOUTME: Handles reading and parsing CSV rows and totals header

import fs from 'fs';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';

export const CSV_HEADER = 'session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags';

/**
 * Parse session_stats.md file into structured data
 */
export function parseStatsFile(filePath: string): StatsFile {
  if (!fs.existsSync(filePath)) {
    return {
      totals: createEmptyTotals(),
      rows: []
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  const totals = parseTotalsLine(lines[0] || '');

  const rows: SessionRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim()) {
      const row = parseCSVRow(lines[i]);
      if (row) rows.push(row);
    }
  }

  return { totals, rows };
}

/**
 * Find the most recent START row for a given session ID
 */
export function findStartRow(filePath: string, sessionId: string): SessionRow | null {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter(r =>
    r.sessionId === sessionId && r.event === 'START'
  );
  return startRows[startRows.length - 1] || null;
}

/**
 * Create empty totals object for new stats files
 */
export function createEmptyTotals(): StatsFileTotals {
  return {
    sessions: 0,
    totalDuration: '00:00:00',
    totalClaudeTime: '00:00:00',
    totalCost: 0,
    totalTokens: 0
  };
}

/**
 * Parse the totals header line
 */
export function parseTotalsLine(line: string): StatsFileTotals {
  const defaults = createEmptyTotals();
  if (!line || !line.includes('Sessions:')) return defaults;

  const sessionsMatch = line.match(/Sessions:\s*(\d+)/);
  const durationMatch = line.match(/Duration:\s*([\d:]+)/);
  const claudeMatch = line.match(/Claude:\s*([\d:]+)/);
  const costMatch = line.match(/Cost:\s*\$?([\d.]+)/);
  const tokensMatch = line.match(/Tokens:\s*([\d,]+)/);

  return {
    sessions: sessionsMatch ? parseInt(sessionsMatch[1], 10) : 0,
    totalDuration: durationMatch ? durationMatch[1] : '00:00:00',
    totalClaudeTime: claudeMatch ? claudeMatch[1] : '00:00:00',
    totalCost: costMatch ? parseFloat(costMatch[1]) : 0,
    totalTokens: tokensMatch ? parseInt(tokensMatch[1].replace(/,/g, ''), 10) : 0
  };
}

/**
 * Parse a single CSV row into a SessionRow
 */
export function parseCSVRow(line: string): SessionRow | null {
  const parts = line.split(',');
  if (parts.length < 10) return null;

  return {
    sessionId: parts[0],
    project: parts[1],
    event: parts[2] as 'START' | 'END',
    timestamp: parts[3],
    model: parts[4] || null,
    duration: parts[5] || null,
    claudeTime: parts[6] || null,
    cost: parts[7] ? parseFloat(parts[7]) : null,
    tokens: parts[8] ? parseInt(parts[8], 10) : null,
    flags: parts[9] || null
  };
}
