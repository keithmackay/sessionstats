// ABOUTME: CLI script backing /sessionstats_rebuild — clears and reconstructs session_stats.json
// ABOUTME: from the project's raw Claude Code transcript JSONL files under ~/.claude/projects/

import path from 'path';
import { rebuildStatsFile } from '../lib/rebuild.js';
import { getProjectTranscriptDir } from '../lib/transcript-dir.js';

const projectDir = process.argv[2] || process.cwd();
const transcriptDir = getProjectTranscriptDir(projectDir);

const rows = rebuildStatsFile(projectDir);
const sessionCount = rows.filter(r => r.event === 'END').length;

console.log(`Scanned transcripts in ${transcriptDir}`);
console.log(`Rebuilt .sessionstats/session_stats.json with ${sessionCount} session(s).`);
