// ABOUTME: Writer for .sessionstats/session_stats.json
// ABOUTME: Full-file rewrite on each append (small files, simplicity over incremental writes)

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SessionRow } from '../types/index.js';
import { parseStatsFile, SCHEMA_VERSION } from './stats-parser.js';

export function getMachineId(): string {
  let username: string;
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || 'unknown';
  }
  return `${username}@${os.hostname()}`;
}

export function writeStatsFile(filePath: string, rows: SessionRow[]): void {
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows }, null, 2) + '\n';
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function appendRow(filePath: string, row: SessionRow): void {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);
  writeStatsFile(filePath, stats.rows);
}
