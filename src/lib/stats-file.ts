// ABOUTME: Core file operations for reading/writing session_stats.md
// ABOUTME: Handles CSV parsing, totals calculation, and row appending

import fs from 'fs';
import path from 'path';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';

const CSV_HEADER = 'session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags';

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
 * Find the most recent START row for a given session ID
 */
export function findStartRow(filePath: string, sessionId: string): SessionRow | null {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter(r =>
    r.sessionId === sessionId && r.event === 'START'
  );
  return startRows[startRows.length - 1] || null;
}

// --- Helper Functions ---

function createEmptyTotals(): StatsFileTotals {
  return {
    sessions: 0,
    totalDuration: '00:00:00',
    totalClaudeTime: '00:00:00',
    totalCost: 0,
    totalTokens: 0
  };
}

function parseTotalsLine(line: string): StatsFileTotals {
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

function formatTotalsLine(totals: StatsFileTotals): string {
  return `Sessions: ${totals.sessions} | Duration: ${totals.totalDuration} | Claude: ${totals.totalClaudeTime} | Cost: $${totals.totalCost.toFixed(2)} | Tokens: ${totals.totalTokens.toLocaleString()}`;
}

function parseCSVRow(line: string): SessionRow | null {
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

function formatCSVRow(row: SessionRow): string {
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

function recalculateTotals(rows: SessionRow[]): StatsFileTotals {
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

function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
