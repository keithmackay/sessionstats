// ABOUTME: Cross-project aggregation for /sessionstats_report — scans scanRoots for .sessionstats/ folders
// ABOUTME: Filters by tag membership (array "contains" match) when a tag is given

import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStatsFile, rowCost, rowTokens } from '../lib/stats-parser.js';
import type { ProjectConfig } from '../types/index.js';

export interface ProjectAggregate {
  projectName: string;
  tags: string[];
  cost: number;
  tokens: number;
  sessions: number;
}

export interface ReportResult {
  projects: ProjectAggregate[];
  totalCost: number;
  totalTokens: number;
}

export function aggregateByTag(scanRoots: string[], tag: string | null): ReportResult {
  const projects: ProjectAggregate[] = [];

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());

    for (const entry of entries) {
      const projectDir = path.join(root, entry.name);
      const configPath = path.join(projectDir, '.sessionstats', 'config.json');
      if (!fs.existsSync(configPath)) continue;

      let config: ProjectConfig;
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (error) {
        console.error(`[sessionstats] Skipping ${entry.name}: could not read .sessionstats/config.json (${error})`);
        continue;
      }
      const tags = Array.isArray(config.tags) ? config.tags : [];
      if (tag && !tags.includes(tag)) continue;

      const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
      let stats;
      try {
        stats = parseStatsFile(statsPath);
      } catch (error) {
        console.error(`[sessionstats] Skipping ${entry.name}: could not read .sessionstats/session_stats.json (${error})`);
        continue;
      }
      const endRows = stats.rows.filter(r => r.event === 'END');

      projects.push({
        projectName: config.projectName,
        tags,
        cost: endRows.reduce((s, r) => s + rowCost(r), 0),
        tokens: endRows.reduce((s, r) => s + rowTokens(r), 0),
        sessions: endRows.length,
      });
    }
  }

  return {
    projects,
    totalCost: projects.reduce((s, p) => s + p.cost, 0),
    totalTokens: projects.reduce((s, p) => s + p.tokens, 0),
  };
}

function printReport(): void {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf('--tag');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

  const pluginConfigPath = path.join(os.homedir(), '.claude', 'sessionstats', 'config.json');
  const scanRoots = fs.existsSync(pluginConfigPath)
    ? JSON.parse(fs.readFileSync(pluginConfigPath, 'utf-8')).scanRoots
    : [path.join(os.homedir(), 'Projects')];

  const result = aggregateByTag(scanRoots, tag);

  console.log('='.repeat(60));
  console.log(`  SESSIONSTATS REPORT${tag ? ` — tag: ${tag}` : ' — all projects'}`);
  console.log('='.repeat(60));
  for (const p of result.projects) {
    console.log(`  ${p.projectName.padEnd(24)} sessions:${p.sessions.toString().padStart(4)}  cost:$${p.cost.toFixed(2)}`);
  }
  console.log('-'.repeat(60));
  console.log(`  TOTAL cost: $${result.totalCost.toFixed(2)}  tokens: ${result.totalTokens.toLocaleString()}`);
}

printReport();
