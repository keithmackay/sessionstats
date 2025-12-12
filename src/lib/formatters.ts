// ABOUTME: Output formatters for session statistics display
// ABOUTME: Supports color-coded terminal output and markdown table format

import type { StatsFile } from '../types/index.js';

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

/**
 * Calculate duration between two ISO timestamps
 * Returns formatted string "HH:MM:SS"
 */
export function calculateDuration(startISO: string, endISO: string): string {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format stats for color-coded terminal output
 */
export function formatTerminalOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${COLORS.cyan}╭${'─'.repeat(60)}╮${COLORS.reset}`);
  lines.push(`${COLORS.cyan}│${COLORS.reset}  ${COLORS.bold}SESSION STATISTICS: ${projectName}${COLORS.reset}`.padEnd(71) + `${COLORS.cyan}│${COLORS.reset}`);
  lines.push(`${COLORS.cyan}╰${'─'.repeat(60)}╯${COLORS.reset}`);
  lines.push('');

  // Totals section
  lines.push(`  ${COLORS.bold}TOTALS${COLORS.reset}`);
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Sessions:     ${COLORS.green}${stats.totals.sessions}${COLORS.reset}`);
  lines.push(`  Total Time:   ${COLORS.green}${stats.totals.totalDuration}${COLORS.reset}`);
  lines.push(`  Claude Time:  ${COLORS.green}${stats.totals.totalClaudeTime}${COLORS.reset}`);
  lines.push(`  Total Cost:   ${COLORS.green}$${stats.totals.totalCost.toFixed(2)}${COLORS.reset}`);
  lines.push(`  Total Tokens: ${COLORS.green}${stats.totals.totalTokens.toLocaleString()}${COLORS.reset}`);
  lines.push('');

  // Recent sessions
  const endRows = stats.rows.filter(r => r.event === 'END').slice(-5).reverse();
  if (endRows.length > 0) {
    lines.push(`  ${COLORS.bold}RECENT SESSIONS (last ${endRows.length})${COLORS.reset}`);
    lines.push(`  ${'─'.repeat(40)}`);
    for (const row of endRows) {
      const date = new Date(row.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const flag = row.flags ? ` ${COLORS.yellow}${row.flags}${COLORS.reset}` : '';
      const costStr = row.cost !== null ? `$${row.cost.toFixed(2)}` : 'N/A';
      lines.push(`  ${date.padEnd(18)} ${(row.duration || 'N/A').padEnd(10)} ${COLORS.green}${costStr}${COLORS.reset}${flag}`);
    }
    lines.push('');
  } else {
    lines.push(`  ${COLORS.dim}No completed sessions yet${COLORS.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format stats as markdown tables
 */
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
  lines.push(`| Claude Time | ${stats.totals.totalClaudeTime} |`);
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
      const cost = row.cost !== null ? `$${row.cost.toFixed(2)}` : 'N/A';
      const tokens = row.tokens !== null ? row.tokens.toLocaleString() : 'N/A';
      lines.push(`| ${date} | ${row.duration || 'N/A'} | ${cost} | ${tokens} | ${row.model || 'N/A'} | ${row.flags || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
