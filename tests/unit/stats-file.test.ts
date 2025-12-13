import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStatsFile, findStartRow } from '../../src/lib/stats-parser.js';
import { writeStatsFile, appendRow } from '../../src/lib/stats-writer.js';
import type { StatsFile, SessionRow } from '../../src/types/index.js';

describe('stats-file', () => {
  let testDir: string;
  let statsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-session-track-test-'));
    statsPath = path.join(testDir, 'session_stats.md');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('parseStatsFile', () => {
    it('returns empty structure when file does not exist', () => {
      const result = parseStatsFile(statsPath);
      expect(result.totals.sessions).toBe(0);
      expect(result.totals.totalCost).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it('parses existing file with totals and rows', () => {
      const content = `Sessions: 5 | Duration: 02:30:00 | Claude: 00:45:00 | Cost: $12.50 | Tokens: 125,000
session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags
abc123,test-proj,END,2025-01-01T10:30:00Z,claude-sonnet-4,00:30:00,00:05:00,2.50,25000,`;
      fs.writeFileSync(statsPath, content);

      const result = parseStatsFile(statsPath);
      expect(result.totals.sessions).toBe(5);
      expect(result.totals.totalCost).toBe(12.50);
      expect(result.totals.totalDuration).toBe('02:30:00');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sessionId).toBe('abc123');
      expect(result.rows[0].event).toBe('END');
    });

    it('handles file with multiple rows', () => {
      const content = `Sessions: 2 | Duration: 01:00:00 | Claude: 00:10:00 | Cost: $5.00 | Tokens: 50,000
session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags
abc123,test-proj,START,2025-01-01T10:00:00Z,claude-opus-4,,,,,
abc123,test-proj,END,2025-01-01T10:30:00Z,claude-opus-4,00:30:00,00:05:00,2.50,25000,
def456,test-proj,START,2025-01-01T11:00:00Z,claude-sonnet-4,,,,,
def456,test-proj,END,2025-01-01T11:30:00Z,claude-sonnet-4,00:30:00,00:05:00,2.50,25000,`;
      fs.writeFileSync(statsPath, content);

      const result = parseStatsFile(statsPath);
      expect(result.rows).toHaveLength(4);
    });
  });

  describe('writeStatsFile', () => {
    it('creates file with totals header and CSV data', () => {
      const stats: StatsFile = {
        totals: {
          sessions: 1,
          totalDuration: '00:30:00',
          totalClaudeTime: '00:05:00',
          totalCost: 2.50,
          totalTokens: 25000
        },
        rows: [{
          sessionId: 'abc123',
          project: 'test',
          event: 'END',
          timestamp: '2025-01-01T10:30:00Z',
          model: 'claude-sonnet-4',
          duration: '00:30:00',
          claudeTime: '00:05:00',
          cost: 2.50,
          tokens: 25000,
          flags: null
        }]
      };

      writeStatsFile(statsPath, stats);

      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('Sessions: 1');
      expect(content).toContain('Cost: $2.50');
      expect(content).toContain('abc123');
      expect(content).toContain('session_id,project,event');
    });

    it('formats tokens with commas', () => {
      const stats: StatsFile = {
        totals: {
          sessions: 1,
          totalDuration: '00:30:00',
          totalClaudeTime: '00:05:00',
          totalCost: 2.50,
          totalTokens: 1234567
        },
        rows: []
      };

      writeStatsFile(statsPath, stats);

      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('Tokens: 1,234,567');
    });
  });

  describe('appendRow', () => {
    it('appends START row to new file', () => {
      const row: SessionRow = {
        sessionId: 'new123',
        project: 'test',
        event: 'START',
        timestamp: '2025-01-01T10:00:00Z',
        model: 'claude-opus-4',
        duration: null,
        claudeTime: null,
        cost: null,
        tokens: null,
        flags: null
      };

      appendRow(statsPath, row);

      const result = parseStatsFile(statsPath);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].event).toBe('START');
      expect(result.rows[0].sessionId).toBe('new123');
    });

    it('recalculates totals when appending END row', () => {
      // First add a START row
      appendRow(statsPath, {
        sessionId: 'sess1',
        project: 'test',
        event: 'START',
        timestamp: '2025-01-01T10:00:00Z',
        model: 'claude-opus-4',
        duration: null,
        claudeTime: null,
        cost: null,
        tokens: null,
        flags: null
      });

      // Then add END row with metrics
      appendRow(statsPath, {
        sessionId: 'sess1',
        project: 'test',
        event: 'END',
        timestamp: '2025-01-01T10:30:00Z',
        model: 'claude-opus-4',
        duration: '00:30:00',
        claudeTime: '00:05:00',
        cost: 2.50,
        tokens: 25000,
        flags: null
      });

      const result = parseStatsFile(statsPath);
      expect(result.totals.sessions).toBe(1);
      expect(result.totals.totalCost).toBe(2.50);
      expect(result.totals.totalTokens).toBe(25000);
    });

    it('accumulates totals across multiple sessions', () => {
      // Session 1
      appendRow(statsPath, {
        sessionId: 's1', project: 'test', event: 'START',
        timestamp: '2025-01-01T10:00:00Z', model: 'claude-opus-4',
        duration: null, claudeTime: null, cost: null, tokens: null, flags: null
      });
      appendRow(statsPath, {
        sessionId: 's1', project: 'test', event: 'END',
        timestamp: '2025-01-01T10:30:00Z', model: 'claude-opus-4',
        duration: '00:30:00', claudeTime: '00:05:00', cost: 2.50, tokens: 25000, flags: null
      });

      // Session 2
      appendRow(statsPath, {
        sessionId: 's2', project: 'test', event: 'START',
        timestamp: '2025-01-01T11:00:00Z', model: 'claude-sonnet-4',
        duration: null, claudeTime: null, cost: null, tokens: null, flags: null
      });
      appendRow(statsPath, {
        sessionId: 's2', project: 'test', event: 'END',
        timestamp: '2025-01-01T12:00:00Z', model: 'claude-sonnet-4',
        duration: '01:00:00', claudeTime: '00:10:00', cost: 5.00, tokens: 50000, flags: null
      });

      const result = parseStatsFile(statsPath);
      expect(result.totals.sessions).toBe(2);
      expect(result.totals.totalCost).toBe(7.50);
      expect(result.totals.totalTokens).toBe(75000);
      expect(result.totals.totalDuration).toBe('01:30:00');
    });
  });

  describe('findStartRow', () => {
    it('returns null when no matching start exists', () => {
      const result = findStartRow(statsPath, 'nonexistent');
      expect(result).toBeNull();
    });

    it('finds matching START row by session ID', () => {
      appendRow(statsPath, {
        sessionId: 'target123',
        project: 'test',
        event: 'START',
        timestamp: '2025-01-01T10:00:00Z',
        model: 'claude-opus-4',
        duration: null, claudeTime: null, cost: null, tokens: null, flags: null
      });

      const result = findStartRow(statsPath, 'target123');
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('target123');
      expect(result!.event).toBe('START');
    });

    it('returns most recent START if multiple exist', () => {
      appendRow(statsPath, {
        sessionId: 'dup', project: 'test', event: 'START',
        timestamp: '2025-01-01T09:00:00Z', model: 'claude-opus-4',
        duration: null, claudeTime: null, cost: null, tokens: null, flags: null
      });
      appendRow(statsPath, {
        sessionId: 'dup', project: 'test', event: 'START',
        timestamp: '2025-01-01T10:00:00Z', model: 'claude-sonnet-4',
        duration: null, claudeTime: null, cost: null, tokens: null, flags: null
      });

      const result = findStartRow(statsPath, 'dup');
      expect(result!.timestamp).toBe('2025-01-01T10:00:00Z');
      expect(result!.model).toBe('claude-sonnet-4');
    });
  });
});
