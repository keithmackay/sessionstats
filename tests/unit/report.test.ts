import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { aggregateByTag } from '../../src/scripts/report.js';

function makeProject(root: string, name: string, tags: string[], cost: number) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, '.sessionstats'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.sessionstats', 'config.json'), JSON.stringify({
    schemaVersion: 1, projectName: name, tags, userEmail: null, postToWeb: false,
  }));
  fs.writeFileSync(path.join(dir, '.sessionstats', 'session_stats.json'), JSON.stringify({
    schemaVersion: 1,
    rows: [{
      sessionId: 's1', project: name, event: 'END', timestamp: '2026-01-01T00:00:00Z', duration: '00:10:00',
      models: [{ model: 'claude-sonnet-4-5-20250929', input: 100, output: 100, cacheRead: 0, cacheWrite: 0, cost }],
      apiMessages: 1, userMessages: 1, toolCalls: 0, subagentCount: 0, cacheHitRate: 0, flags: null, machineId: 'u@h',
    }],
  }));
}

describe('aggregateByTag', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-report-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('aggregates only projects whose tags array contains the given tag', () => {
    makeProject(root, 'proj-a', ['team-infra', 'epic-billing'], 1.00);
    makeProject(root, 'proj-b', ['team-infra'], 2.00);
    makeProject(root, 'proj-c', ['epic-search'], 5.00);

    const result = aggregateByTag([root], 'team-infra');
    expect(result.projects).toHaveLength(2);
    expect(result.totalCost).toBeCloseTo(3.00, 2);
  });

  it('aggregates everything when no tag filter is given', () => {
    makeProject(root, 'proj-a', ['team-infra'], 1.00);
    makeProject(root, 'proj-b', [], 2.00);

    const result = aggregateByTag([root], null);
    expect(result.projects).toHaveLength(2);
    expect(result.totalCost).toBeCloseTo(3.00, 2);
  });

  it('skips projects with no .sessionstats folder without crashing', () => {
    fs.mkdirSync(path.join(root, 'untracked'));
    makeProject(root, 'proj-a', ['team-infra'], 1.00);

    const result = aggregateByTag([root], 'team-infra');
    expect(result.projects).toHaveLength(1);
  });
});
