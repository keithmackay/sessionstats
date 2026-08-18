// ABOUTME: Resolves a project directory to its Claude Code transcript directory
// ABOUTME: Claude Code encodes project paths by replacing / and . with -

import path from 'path';
import os from 'os';

export function getProjectTranscriptDir(projectDir: string): string {
  const encoded = projectDir.replace(/[/.]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}
