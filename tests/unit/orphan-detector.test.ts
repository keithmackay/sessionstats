import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectAndCloseOrphans } from '../../src/lib/orphan-detector.js';
import { parseStatsFile } from '../../src/lib/stats-parser.js';
import { appendRow } from '../../src/lib/stats-writer.js';

describe('orphan-detector', () => {
  let testDir: string;
  let statsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-orphan-test-'));
    statsPath = path.join(testDir, 'session_stats.md');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty array when file does not exist', () => {
    const orphans = detectAndCloseOrphans(statsPath);
    expect(orphans).toHaveLength(0);
  });

  it('returns empty array when no orphans exist', () => {
    // Add complete session (START + END)
    appendRow(statsPath, {
      sessionId: 'complete123',
      project: 'test',
      event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });
    appendRow(statsPath, {
      sessionId: 'complete123',
      project: 'test',
      event: 'END',
      timestamp: '2025-01-01T10:30:00Z',
      duration: '00:30:00',
      models: [{ model: 'claude-opus-4', input: 20000, output: 5000, cacheRead: 0, cacheWrite: 0, cost: 2.50 }],
      apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    const orphans = detectAndCloseOrphans(statsPath);
    expect(orphans).toHaveLength(0);
  });

  it('detects and closes orphaned START row', () => {
    // Add START without END
    appendRow(statsPath, {
      sessionId: 'orphan123',
      project: 'test',
      event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    const orphans = detectAndCloseOrphans(statsPath);

    expect(orphans).toHaveLength(1);
    expect(orphans[0].sessionId).toBe('orphan123');
    expect(orphans[0].flags).toBe('[Abnormal End]');
    expect(orphans[0].event).toBe('END');

    // Verify END row was added to file
    const stats = parseStatsFile(statsPath);
    const endRows = stats.rows.filter(r => r.event === 'END');
    expect(endRows).toHaveLength(1);
    expect(endRows[0].flags).toBe('[Abnormal End]');
  });

  it('closes multiple orphaned sessions', () => {
    appendRow(statsPath, {
      sessionId: 'orphan1', project: 'test', event: 'START',
      timestamp: '2025-01-01T09:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });
    appendRow(statsPath, {
      sessionId: 'orphan2', project: 'test', event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    const orphans = detectAndCloseOrphans(statsPath);

    expect(orphans).toHaveLength(2);
    expect(orphans.map(o => o.sessionId).sort()).toEqual(['orphan1', 'orphan2']);
  });

  it('preserves project from START row in closed orphan (no model/token/cost data available)', () => {
    appendRow(statsPath, {
      sessionId: 'orphan-model',
      project: 'my-project',
      event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    const orphans = detectAndCloseOrphans(statsPath);

    expect(orphans[0].project).toBe('my-project');
    expect(orphans[0].models).toEqual([]);
  });

  it('calculates duration for closed orphan', () => {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 1); // 1 hour ago

    appendRow(statsPath, {
      sessionId: 'orphan-duration',
      project: 'test',
      event: 'START',
      timestamp: startTime.toISOString(),
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    const orphans = detectAndCloseOrphans(statsPath);

    // Duration should be approximately 1 hour
    expect(orphans[0].duration).toMatch(/^0[01]:\d{2}:\d{2}$/); // 00:XX:XX or 01:XX:XX
  });

  it('does not close same session twice', () => {
    appendRow(statsPath, {
      sessionId: 'once-only',
      project: 'test',
      event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      duration: null, models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null, flags: null, machineId: 'user@host'
    });

    // First call closes the orphan
    const firstCall = detectAndCloseOrphans(statsPath);
    expect(firstCall).toHaveLength(1);

    // Second call finds no orphans (session now has END)
    const secondCall = detectAndCloseOrphans(statsPath);
    expect(secondCall).toHaveLength(0);

    // Verify only one END row exists
    const stats = parseStatsFile(statsPath);
    const endRows = stats.rows.filter(r => r.sessionId === 'once-only' && r.event === 'END');
    expect(endRows).toHaveLength(1);
  });
});
