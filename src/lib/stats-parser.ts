// ABOUTME: Reader for .sessionstats/session_stats.json
// ABOUTME: Totals are computed dynamically from rows by summing each row's models[] array

import fs from 'fs';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';

export const SCHEMA_VERSION = 1;

export function parseStatsFile(filePath: string): StatsFile {
  if (!fs.existsSync(filePath)) {
    return { schemaVersion: SCHEMA_VERSION, totals: createEmptyTotals(), rows: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const rows: SessionRow[] = raw.rows ?? [];
  return { schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION, totals: computeTotals(rows), rows };
}

export function findStartRow(filePath: string, sessionId: string): SessionRow | null {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter(r => r.sessionId === sessionId && r.event === 'START');
  return startRows[startRows.length - 1] || null;
}

export function createEmptyTotals(): StatsFileTotals {
  return { sessions: 0, totalDuration: '00:00:00', totalCost: 0, totalTokens: 0 };
}

export function rowCost(row: SessionRow): number {
  return row.models.reduce((sum, m) => sum + (m.cost ?? 0), 0);
}

export function rowTokens(row: SessionRow): number {
  return row.models.reduce((sum, m) => sum + (m.input ?? 0) + (m.output ?? 0) + (m.cacheRead ?? 0) + (m.cacheWrite ?? 0), 0);
}

function computeTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');
  let totalDurationMs = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    totalCost += rowCost(row);
    totalTokens += rowTokens(row);
  }

  return { sessions: endRows.length, totalDuration: formatMsToTime(totalDurationMs), totalCost, totalTokens };
}

function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
