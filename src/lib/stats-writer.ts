// ABOUTME: Writer for session_stats.md file format
// ABOUTME: Handles writing rows in append-only format for git merge compatibility

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SessionRow } from '../types/index.js';
import { parseStatsFile, CSV_HEADER, FILE_HEADER } from './stats-parser.js';

/**
 * Get machine identifier for multi-user merge support
 * Format: username@hostname
 */
export function getMachineId(): string {
  let username: string;
  try {
    username = os.userInfo().username;
  } catch {
    // Fallback for containerized environments or systems without passwd entry
    username = process.env.USER || process.env.USERNAME || 'unknown';
  }
  const hostname = os.hostname();
  return `${username}@${hostname}`;
}

/**
 * Write stats file with static header and CSV data (no totals line)
 */
export function writeStatsFile(filePath: string, rows: SessionRow[]): void {
  const csvLines = rows.map(formatCSVRow);
  const content = FILE_HEADER + CSV_HEADER + '\n' + csvLines.join('\n') + '\n';

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Append a row to session_stats.md
 * Creates file with header if it doesn't exist
 */
export function appendRow(filePath: string, row: SessionRow): void {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);
  writeStatsFile(filePath, stats.rows);
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
    row.flags || '',
    row.machineId || ''
  ].join(',');
}
