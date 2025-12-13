// ABOUTME: CLI script to display session statistics without LLM involvement
// ABOUTME: Replaces LLM-driven formatting with direct script output for efficiency

import path from 'path';
import { parseStatsFile } from '../lib/stats-parser.js';
import { formatTerminalOutput, formatMarkdownOutput } from '../lib/formatters.js';

function showStats(): void {
  // Get project directory from args or use cwd
  const args = process.argv.slice(2);
  const useMarkdown = args.includes('md') || args.includes('markdown');

  // Find the project directory (filter out format flags)
  const projectDir = args.find(arg => !['md', 'markdown'].includes(arg)) || process.cwd();
  const statsPath = path.join(projectDir, 'session_stats.md');
  const projectName = path.basename(projectDir);

  try {
    const stats = parseStatsFile(statsPath);

    // Check if there's any data
    if (stats.rows.length === 0) {
      console.log('No session statistics found.');
      console.log('Sessions will be tracked automatically when you start and end Claude Code sessions.');
      return;
    }

    // Output formatted stats
    if (useMarkdown) {
      console.log(formatMarkdownOutput(stats, projectName));
    } else {
      console.log(formatTerminalOutput(stats, projectName));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('No session statistics found.');
      console.log('Sessions will be tracked automatically when you start and end Claude Code sessions.');
    } else {
      console.error('Error reading session statistics:', error);
      process.exit(1);
    }
  }
}

showStats();
