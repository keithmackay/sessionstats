// ABOUTME: CLI script to display session statistics and regenerate .sessionstats/session_stats.md
// ABOUTME: session_stats.md is a rendered view only — always regenerated from the JSON, never hand-edited

import fs from 'fs';
import path from 'path';
import { parseStatsFile } from '../lib/stats-parser.js';
import { formatTerminalOutput, formatMarkdownOutput } from '../lib/formatters.js';

function showStats(): void {
  const args = process.argv.slice(2);
  const useMarkdown = args.includes('md') || args.includes('markdown');

  const projectDir = args.find(arg => !['md', 'markdown'].includes(arg)) || process.cwd();
  const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
  const renderedPath = path.join(projectDir, '.sessionstats', 'session_stats.md');
  const projectName = path.basename(projectDir);

  const stats = parseStatsFile(statsPath);

  if (stats.rows.length === 0) {
    console.log('No session statistics found.');
    console.log('Sessions will be tracked automatically when you start and end Claude Code sessions.');
    return;
  }

  const markdown = formatMarkdownOutput(stats, projectName);
  fs.writeFileSync(renderedPath, markdown, 'utf-8');

  console.log(useMarkdown ? markdown : formatTerminalOutput(stats, projectName));
}

showStats();
