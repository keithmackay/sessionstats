// ABOUTME: Formatting utilities for time, duration, and session statistics display
// ABOUTME: Renders from the models[] breakdown; no longer has a "Claude Time" concept

import type { StatsFile, SessionRow } from '../types/index.js';
import { rowCost, rowTokens } from './stats-parser.js';

export function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

export function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', red: '\x1b[31m',
};

export function calculateDuration(startISO: string, endISO: string): string {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);
  return formatMsToTime(durationMs);
}

function rowCostStr(row: SessionRow): string {
  return row.models.length > 0 ? `$${rowCost(row).toFixed(2)}` : 'N/A';
}

function rowTokensStr(row: SessionRow): string {
  return row.models.length > 0 ? rowTokens(row).toLocaleString() : 'N/A';
}

function rowModelStr(row: SessionRow): string {
  return row.models.map(m => m.model).join(', ') || 'N/A';
}

export function formatTerminalOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${COLORS.cyan}╭${'─'.repeat(60)}╮${COLORS.reset}`);
  lines.push(`${COLORS.cyan}│${COLORS.reset}  ${COLORS.bold}SESSION STATISTICS: ${projectName}${COLORS.reset}`.padEnd(71) + `${COLORS.cyan}│${COLORS.reset}`);
  lines.push(`${COLORS.cyan}╰${'─'.repeat(60)}╯${COLORS.reset}`);
  lines.push('');

  lines.push(`  ${COLORS.bold}TOTALS${COLORS.reset}`);
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Sessions:     ${COLORS.green}${stats.totals.sessions}${COLORS.reset}`);
  lines.push(`  Total Time:   ${COLORS.green}${stats.totals.totalDuration}${COLORS.reset}`);
  lines.push(`  Total Cost:   ${COLORS.green}$${stats.totals.totalCost.toFixed(2)}${COLORS.reset}`);
  lines.push(`  Total Tokens: ${COLORS.green}${stats.totals.totalTokens.toLocaleString()}${COLORS.reset}`);
  lines.push('');

  const endRows = stats.rows.filter(r => r.event === 'END').slice(-5).reverse();
  if (endRows.length > 0) {
    lines.push(`  ${COLORS.bold}RECENT SESSIONS (last ${endRows.length})${COLORS.reset}`);
    lines.push(`  ${'─'.repeat(40)}`);
    for (const row of endRows) {
      const date = new Date(row.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      const flag = row.flags ? ` ${COLORS.yellow}${row.flags}${COLORS.reset}` : '';
      lines.push(`  ${date.padEnd(18)} ${(row.duration || 'N/A').padEnd(10)} ${COLORS.green}${rowCostStr(row)}${COLORS.reset}${flag}`);
    }
    lines.push('');
  } else {
    lines.push(`  ${COLORS.dim}No completed sessions yet${COLORS.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMarkdownOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  lines.push(`## Session Statistics: ${projectName}`);
  lines.push('');
  lines.push('### Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Sessions | ${stats.totals.sessions} |`);
  lines.push(`| Total Duration | ${stats.totals.totalDuration} |`);
  lines.push(`| Total Cost | $${stats.totals.totalCost.toFixed(2)} |`);
  lines.push(`| Total Tokens | ${stats.totals.totalTokens.toLocaleString()} |`);
  lines.push('');

  const endRows = stats.rows.filter(r => r.event === 'END').slice(-10).reverse();
  if (endRows.length > 0) {
    lines.push('### Recent Sessions');
    lines.push('');
    lines.push('| Date | Duration | Cost | Tokens | Model | Flags |');
    lines.push('|------|----------|------|--------|-------|-------|');
    for (const row of endRows) {
      const date = new Date(row.timestamp).toISOString().split('T')[0];
      lines.push(`| ${date} | ${row.duration || 'N/A'} | ${rowCostStr(row)} | ${rowTokensStr(row)} | ${rowModelStr(row)} | ${row.flags || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
