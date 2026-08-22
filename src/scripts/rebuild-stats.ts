// ABOUTME: CLI script backing /sessionstats_rebuild — clears and reconstructs session_stats.json
// ABOUTME: from the project's raw Claude Code transcript JSONL files under ~/.claude/projects/

import path from 'path';
import { rebuildStatsFile, rebuildSessionRows } from '../lib/rebuild.js';
import { getProjectTranscriptDir } from '../lib/transcript-dir.js';
import { parseStatsFile } from '../lib/stats-parser.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectDir = args.find(a => !a.startsWith('--')) || process.cwd();
const transcriptDir = getProjectTranscriptDir(projectDir);

if (dryRun) {
  const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
  const existing = parseStatsFile(statsPath);
  const existingCount = existing.rows.length;

  const rows = rebuildSessionRows(projectDir);
  const sessionCount = rows.filter(r => r.event === 'END').length;

  console.log(`[DRY RUN] Scanned transcripts in ${transcriptDir}`);
  console.log(`[DRY RUN] Would rebuild session_stats.json from ${sessionCount} transcript(s), replacing ${existingCount} existing row(s).`);
  console.log('[DRY RUN] No files were written.');

  if (rows.length > 0) {
    const sample = rows.slice(0, Math.min(4, rows.length));
    console.log('\n[DRY RUN] Sample of what would be written:');
    console.log(JSON.stringify(sample, null, 2));
    if (rows.length > sample.length) {
      console.log(`... and ${rows.length - sample.length} more row(s)`);
    }
  }
} else {
  const rows = rebuildStatsFile(projectDir);
  const sessionCount = rows.filter(r => r.event === 'END').length;

  console.log(`Scanned transcripts in ${transcriptDir}`);
  console.log(`Rebuilt .sessionstats/session_stats.json with ${sessionCount} session(s).`);
}
