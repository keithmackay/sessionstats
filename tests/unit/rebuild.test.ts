import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { rebuildSessionRows, rebuildStatsFile } from '../../src/lib/rebuild.js';
import { parseStatsFile } from '../../src/lib/stats-parser.js';
import { getProjectTranscriptDir } from '../../src/lib/transcript-dir.js';

function jsonlLine(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

describe('rebuildSessionRows', () => {
  let homeDir: string;
  let projectDir: string;
  let transcriptDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-proj-'));
    transcriptDir = getProjectTranscriptDir(projectDir);
    fs.mkdirSync(transcriptDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns empty array when no transcript directory exists', () => {
    fs.rmSync(transcriptDir, { recursive: true, force: true });
    expect(rebuildSessionRows(projectDir)).toEqual([]);
  });

  it('returns empty array when transcript directory has no jsonl files', () => {
    expect(rebuildSessionRows(projectDir)).toEqual([]);
  });

  it('builds a START/END row pair per transcript from first/last timestamps', () => {
    const sessionId = 'session-abc';
    const lines = [
      jsonlLine({ type: 'user', timestamp: '2026-01-01T10:00:00.000Z', message: { content: 'hi' } }),
      jsonlLine({
        type: 'assistant',
        timestamp: '2026-01-01T10:05:00.000Z',
        message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      }),
    ];
    fs.writeFileSync(path.join(transcriptDir, `${sessionId}.jsonl`), lines.join(''));

    const rows = rebuildSessionRows(projectDir);
    expect(rows).toHaveLength(2);

    const [startRow, endRow] = rows;
    expect(startRow.event).toBe('START');
    expect(startRow.sessionId).toBe(sessionId);
    expect(startRow.timestamp).toBe('2026-01-01T10:00:00.000Z');
    expect(startRow.flags).toBe('[Reconstructed]');

    expect(endRow.event).toBe('END');
    expect(endRow.sessionId).toBe(sessionId);
    expect(endRow.timestamp).toBe('2026-01-01T10:05:00.000Z');
    expect(endRow.duration).toBe('00:05:00');
    expect(endRow.flags).toBe('[Reconstructed]');
    expect(endRow.models).toEqual([
      { model: 'claude-sonnet-4-5-20250929', input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: expect.any(Number) },
    ]);
  });

  it('sorts sessions chronologically by start timestamp', () => {
    fs.writeFileSync(
      path.join(transcriptDir, 'session-later.jsonl'),
      jsonlLine({ type: 'user', timestamp: '2026-01-02T10:00:00.000Z', message: { content: 'hi' } })
    );
    fs.writeFileSync(
      path.join(transcriptDir, 'session-earlier.jsonl'),
      jsonlLine({ type: 'user', timestamp: '2026-01-01T10:00:00.000Z', message: { content: 'hi' } })
    );

    const rows = rebuildSessionRows(projectDir);
    expect(rows.map(r => r.sessionId)).toEqual([
      'session-earlier', 'session-earlier', 'session-later', 'session-later',
    ]);
  });

  it('skips subagent transcripts nested under <sessionId>/subagents/', () => {
    const sessionId = 'session-with-subagents';
    fs.writeFileSync(
      path.join(transcriptDir, `${sessionId}.jsonl`),
      jsonlLine({ type: 'user', timestamp: '2026-01-01T10:00:00.000Z', message: { content: 'hi' } })
    );
    const subagentDir = path.join(transcriptDir, sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(subagentDir, 'sub-1.jsonl'),
      jsonlLine({ type: 'user', timestamp: '2026-01-01T10:01:00.000Z', message: { content: 'sub' } })
    );

    const rows = rebuildSessionRows(projectDir);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.sessionId === sessionId)).toBe(true);
  });
});

describe('rebuildStatsFile', () => {
  let homeDir: string;
  let projectDir: string;
  let transcriptDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-proj-'));
    transcriptDir = getProjectTranscriptDir(projectDir);
    fs.mkdirSync(transcriptDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('overwrites any existing session_stats.json with the rebuilt rows', () => {
    const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
    fs.mkdirSync(path.dirname(statsPath), { recursive: true });
    fs.writeFileSync(statsPath, JSON.stringify({ schemaVersion: 1, rows: [{ stale: true }] }));

    fs.writeFileSync(
      path.join(transcriptDir, 'session-1.jsonl'),
      jsonlLine({ type: 'user', timestamp: '2026-01-01T10:00:00.000Z', message: { content: 'hi' } })
    );

    rebuildStatsFile(projectDir);

    const result = parseStatsFile(statsPath);
    expect(result.rows).toHaveLength(2);
    expect((result.rows[0] as any).stale).toBeUndefined();
  });
});
