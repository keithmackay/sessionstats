// ABOUTME: Writer for session_stats.md file format
// ABOUTME: Handles writing, appending rows, and recalculating totals

import fs from 'fs';
import path from 'path';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';
import { parseStatsFile, CSV_HEADER } from './stats-parser.js';
import { parseTimeToMs, formatMsToTime } from './formatters.js';

/**
 * Write structured data to session_stats.md
 */
export function writeStatsFile(filePath: string, stats: StatsFile): void {
  const totalsLine = formatTotalsLine(stats.totals);
  const csvLines = stats.rows.map(formatCSVRow);
  const content = [totalsLine, CSV_HEADER, ...csvLines].join('\n') + '\n';

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Append a row to session_stats.md and recalculate totals if END row
 */
export function appendRow(filePath: string, row: SessionRow): void {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);

  if (row.event === 'END') {
    stats.totals = recalculateTotals(stats.rows);
  }

  writeStatsFile(filePath, stats);
}

/**
 * Format totals as header line
 */
export function formatTotalsLine(totals: StatsFileTotals): string {
  return `Sessions: ${totals.sessions} | Duration: ${totals.totalDuration} | Claude: ${totals.totalClaudeTime} | Cost: $${totals.totalCost.toFixed(2)} | Tokens: ${totals.totalTokens.toLocaleString()}`;
}

/**
 * Format a SessionRow as CSV line
 */
export function formatCSVRow(row: SessionRow): string {
  return [
    row.sessionId,
    row.project,
    row.event,
    row.timestamp,
    row.model || '',
    row.duration || '',
    row.claudeTime || '',
    row.cost !== null ? row.cost.toFixed(2) : '',
    row.tokens !== null ? row.tokens.toString() : '',
    row.flags || ''
  ].join(',');
}

/**
 * Recalculate totals from all END rows
 */
export function recalculateTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');

  let totalDurationMs = 0;
  let totalClaudeMs = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    if (row.claudeTime) totalClaudeMs += parseTimeToMs(row.claudeTime);
    if (row.cost !== null) totalCost += row.cost;
    if (row.tokens !== null) totalTokens += row.tokens;
  }

  return {
    sessions: endRows.length,
    totalDuration: formatMsToTime(totalDurationMs),
    totalClaudeTime: formatMsToTime(totalClaudeMs),
    totalCost,
    totalTokens
  };
}
