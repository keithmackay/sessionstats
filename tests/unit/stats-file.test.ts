import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStatsFile, findStartRow } from '../../src/lib/stats-parser.js';
import { writeStatsFile, appendRow } from '../../src/lib/stats-writer.js';
import type { SessionRow } from '../../src/types/index.js';

const startRow: SessionRow = {
  sessionId: 'abc123', project: 'test-proj', event: 'START', timestamp: '2026-01-01T10:00:00Z',
  duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null,
  subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host',
};

const endRow: SessionRow = {
  ...startRow, event: 'END', timestamp: '2026-01-01T10:30:00Z', duration: '00:30:00',
  models: [{ model: 'claude-sonnet-4-5-20250929', input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cost: 2.50 }],
  apiMessages: 5, userMessages: 2, toolCalls: 1, subagentCount: 0, cacheHitRate: 0,
};

describe('JSON stats file', () => {
  let testDir: string;
  let statsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-test-'));
    statsPath = path.join(testDir, 'session_stats.json');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty structure when file does not exist', () => {
    const result = parseStatsFile(statsPath);
    expect(result.rows).toHaveLength(0);
    expect(result.totals.sessions).toBe(0);
  });

  it('appends rows and computes totals by summing across models[]', () => {
    appendRow(statsPath, startRow);
    appendRow(statsPath, endRow);

    const result = parseStatsFile(statsPath);
    expect(result.rows).toHaveLength(2);
    expect(result.totals.sessions).toBe(1);
    expect(result.totals.totalCost).toBeCloseTo(2.50, 2);
    expect(result.totals.totalTokens).toBe(1500);
  });

  it('finds the most recent START row for a session id', () => {
    appendRow(statsPath, startRow);
    const found = findStartRow(statsPath, 'abc123');
    expect(found?.sessionId).toBe('abc123');
  });

  it('round-trips schemaVersion', () => {
    writeStatsFile(statsPath, [startRow]);
    const raw = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    expect(raw.schemaVersion).toBe(1);
  });
});
