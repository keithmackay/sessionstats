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
      totals: {
        sessions: 5,
        totalDuration: '02:30:00',
        totalClaudeTime: '00:45:00',
        totalCost: 12.50,
        totalTokens: 125000
      },
      rows: [
        {
          sessionId: 'abc123', project: 'test', event: 'END',
          timestamp: '2025-01-01T10:30:00Z', model: 'claude-opus-4',
          duration: '00:30:00', claudeTime: '00:05:00', cost: 2.50, tokens: 25000, flags: null
        },
        {
          sessionId: 'def456', project: 'test', event: 'END',
          timestamp: '2025-01-01T11:30:00Z', model: 'claude-sonnet-4',
          duration: '00:45:00', claudeTime: null, cost: 3.00, tokens: 30000, flags: '[Abnormal End]'
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
  });

  describe('formatMarkdownOutput', () => {
    const sampleStats: StatsFile = {
      totals: {
        sessions: 3,
        totalDuration: '01:30:00',
        totalClaudeTime: '00:30:00',
        totalCost: 7.50,
        totalTokens: 75000
      },
      rows: [
        {
          sessionId: 'abc123', project: 'test', event: 'END',
          timestamp: '2025-01-01T10:30:00Z', model: 'claude-opus-4',
          duration: '00:30:00', claudeTime: '00:05:00', cost: 2.50, tokens: 25000, flags: null
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
  });
});
