// ABOUTME: CLI script to extract user prompts from Claude Code JSONL transcripts
// ABOUTME: Reads all session transcripts for a project and outputs formatted prompt history

import fs from 'fs';
import path from 'path';
import { extractPrompts, formatPromptsMarkdown } from '../lib/prompt-extractor.js';
import { getProjectTranscriptDir } from '../lib/transcript-dir.js';

function extractAllPrompts(projectDir: string): void {
  const transcriptDir = getProjectTranscriptDir(projectDir);

  if (!fs.existsSync(transcriptDir)) {
    console.error(`No Claude Code transcripts found for ${projectDir}`);
    process.exit(1);
  }

  const jsonlFiles = fs.readdirSync(transcriptDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(transcriptDir, f));

  if (jsonlFiles.length === 0) {
    console.error('No session transcripts found.');
    process.exit(1);
  }

  // Read all lines from all JSONL files
  const allLines: string[] = [];
  for (const file of jsonlFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    allLines.push(...lines);
  }

  const prompts = extractPrompts(allLines);

  if (prompts.length === 0) {
    console.log('No user prompts found in transcripts.');
    return;
  }

  console.log(formatPromptsMarkdown(prompts));
}

const projectDir = process.argv[2] || process.cwd();
extractAllPrompts(projectDir);
