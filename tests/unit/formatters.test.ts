import { describe, it, expect } from 'vitest';
import { calculateDuration, formatTerminalOutput, formatMarkdownOutput } from '../../src/lib/formatters.js';
import type { StatsFile } from '../../src/types/index.js';

describe('formatters', () => {
  describe('calculateDuration', () => {
    it('calculates duration between two timestamps', () => {
      const start = '2025-01-01T10:00:00Z';
      const end = '2025-01-01T10:30:00Z';

      const result = calculateDuration(start, end);

      expect(result).toBe('00:30:00');
    });

    it('handles hour-long durations', () => {
      const start = '2025-01-01T10:00:00Z';
      const end = '2025-01-01T12:30:45Z';

      const result = calculateDuration(start, end);

      expect(result).toBe('02:30:45');
    });

    it('returns 00:00:00 for negative duration', () => {
      const start = '2025-01-01T12:00:00Z';
      const end = '2025-01-01T10:00:00Z';

      const result = calculateDuration(start, end);

      expect(result).toBe('00:00:00');
    });

    it('handles multi-day durations', () => {
      const start = '2025-01-01T10:00:00Z';
      const end = '2025-01-02T11:30:00Z';

      const result = calculateDuration(start, end);

      expect(result).toBe('25:30:00');
    });
  });

  describe('formatTerminalOutput', () => {
    const sampleStats: StatsFile = {
      schemaVersion: 1,
      totals: {
        sessions: 5,
        totalDuration: '02:30:00',
        totalCost: 12.50,
        totalTokens: 125000
      },
      rows: [
        {
          sessionId: 'abc123', project: 'test', event: 'END',
          timestamp: '2025-01-01T10:30:00Z',
          duration: '00:30:00',
          models: [{ model: 'claude-opus-4', input: 10000, output: 5000, cacheRead: 5000, cacheWrite: 5000, cost: 2.50 }],
          apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null,
          flags: null, machineId: null
        },
        {
          sessionId: 'def456', project: 'test', event: 'END',
          timestamp: '2025-01-01T11:30:00Z',
          duration: '00:45:00',
          models: [{ model: 'claude-sonnet-4', input: 12000, output: 6000, cacheRead: 6000, cacheWrite: 6000, cost: 3.00 }],
          apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null,
          flags: '[Abnormal End]', machineId: null
        }
      ]
    };

    it('includes project name in header', () => {
      const output = formatTerminalOutput(sampleStats, 'my-project');
      expect(output).toContain('my-project');
    });

    it('includes totals section', () => {
      const output = formatTerminalOutput(sampleStats, 'test');
      expect(output).toContain('TOTALS');
      expect(output).toContain('5'); // sessions
      expect(output).toContain('$12.50');
    });

    it('includes recent sessions', () => {
      const output = formatTerminalOutput(sampleStats, 'test');
      expect(output).toContain('RECENT SESSIONS');
    });

    it('shows abnormal end flag', () => {
      const output = formatTerminalOutput(sampleStats, 'test');
      expect(output).toContain('[Abnormal End]');
    });

    it('marks [Migrated] rows distinctly in terminal output', () => {
      const stats = {
        schemaVersion: 1,
        totals: { sessions: 1, totalDuration: '00:00:00', totalCost: 5, totalTokens: 10000 },
        rows: [{
          sessionId: 'x', project: 'p', event: 'END', timestamp: '2026-01-01T00:00:00Z',
          duration: null, models: [{ model: 'unknown', input: null, output: null, cacheRead: null, cacheWrite: null, cost: 5 }],
          apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null,
          flags: '[Migrated]', machineId: 'user@host',
        }],
      };
      const output = formatTerminalOutput(stats, 'p');
      expect(output).toContain('[Migrated]');
    });
  });

  describe('formatMarkdownOutput', () => {
    const sampleStats: StatsFile = {
      schemaVersion: 1,
      totals: {
        sessions: 3,
        totalDuration: '01:30:00',
        totalCost: 7.50,
        totalTokens: 75000
      },
      rows: [
        {
          sessionId: 'abc123', project: 'test', event: 'END',
          timestamp: '2025-01-01T10:30:00Z',
          duration: '00:30:00',
          models: [{ model: 'claude-opus-4', input: 10000, output: 5000, cacheRead: 5000, cacheWrite: 5000, cost: 2.50 }],
          apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null,
          flags: null, machineId: null
        }
      ]
    };

    it('outputs valid markdown with tables', () => {
      const output = formatMarkdownOutput(sampleStats, 'test-project');

      expect(output).toContain('## Session Statistics: test-project');
      expect(output).toContain('| Metric | Value |');
      expect(output).toContain('|--------|-------|');
    });

    it('includes totals table', () => {
      const output = formatMarkdownOutput(sampleStats, 'test');

      expect(output).toContain('### Totals');
      expect(output).toContain('| Sessions | 3 |');
      expect(output).toContain('| Total Cost | $7.50 |');
    });

    it('includes recent sessions table', () => {
      const output = formatMarkdownOutput(sampleStats, 'test');

      expect(output).toContain('### Recent Sessions');
      expect(output).toContain('| Date | Duration | Cost |');
    });

    it('formats tokens with commas', () => {
      const output = formatMarkdownOutput(sampleStats, 'test');
      expect(output).toContain('75,000');
    });

    it('shows [Migrated] flag and N/A fallback for rows with no models[] in markdown output', () => {
      const stats = {
        schemaVersion: 1,
        totals: { sessions: 1, totalDuration: '00:00:00', totalCost: 5, totalTokens: 10000 },
        rows: [{
          sessionId: 'x', project: 'p', event: 'END', timestamp: '2026-01-01T00:00:00Z',
          duration: null, models: [],
          apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null, cacheHitRate: null,
          flags: '[Migrated]', machineId: 'user@host',
        }],
      };
      const output = formatMarkdownOutput(stats, 'p');
      expect(output).toContain('[Migrated]');
      expect(output).toContain('N/A');
    });
  });
});
