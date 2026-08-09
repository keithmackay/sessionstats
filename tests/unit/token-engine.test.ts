import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseTranscript, parseSessionTranscript } from '../../src/lib/token-engine.js';

function jsonlLine(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('parseTranscript', () => {
  it('aggregates tokens and cost per model from assistant entries', () => {
    const lines = [
      jsonlLine({ type: 'user', timestamp: '2026-01-01T00:00:00Z' }),
      jsonlLine({
        type: 'assistant',
        timestamp: '2026-01-01T00:00:05Z',
        message: {
          model: 'claude-sonnet-4-5-20250929',
          usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [{ type: 'text', text: 'hi' }],
        },
      }),
      jsonlLine({
        type: 'assistant',
        timestamp: '2026-01-01T00:00:10Z',
        message: {
          model: 'claude-sonnet-4-5-20250929',
          usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
          content: [{ type: 'tool_use' }],
        },
      }),
    ];

    const result = parseTranscript(lines.join('\n'));

    expect(result.models).toHaveLength(1);
    expect(result.models[0].model).toBe('claude-sonnet-4-5-20250929');
    expect(result.models[0].input).toBe(1500);
    expect(result.models[0].output).toBe(700);
    expect(result.models[0].cacheRead).toBe(100);
    expect(result.apiMessages).toBe(2);
    expect(result.userMessages).toBe(1);
    expect(result.toolCalls).toBe(1);
  });

  it('ignores malformed JSON lines without throwing', () => {
    const result = parseTranscript('not json\n{"type":"user"}\n');
    expect(result.userMessages).toBe(1);
  });

  it('returns zero cacheHitRate when there is no input at all', () => {
    const result = parseTranscript('');
    expect(result.cacheHitRate).toBe(0);
  });
});

describe('parseSessionTranscript (with subagent rollup)', () => {
  it('merges subagent token/cost into the parent session and counts subagents', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-subagent-'));
    const sessionId = 'parent-session-1';
    const transcriptPath = path.join(testDir, `${sessionId}.jsonl`);
    const subagentDir = path.join(testDir, sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });

    const assistantLine = (input: number, output: number, cacheRead: number, cacheWrite: number) => JSON.stringify({
      type: 'assistant', timestamp: '2026-01-01T00:00:00Z',
      message: {
        model: 'claude-sonnet-4-5-20250929',
        usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite },
        content: [],
      },
    });

    fs.writeFileSync(transcriptPath, assistantLine(1000, 400, 50, 10) + '\n');
    fs.writeFileSync(path.join(subagentDir, 'agent-1.jsonl'), assistantLine(500, 200, 20, 0) + '\n');
    fs.writeFileSync(path.join(subagentDir, 'agent-2.jsonl'), assistantLine(300, 100, 0, 5) + '\n');

    const result = parseSessionTranscript(transcriptPath);

    expect(result.subagentCount).toBe(2);
    expect(result.models).toHaveLength(1);
    const merged = result.models[0];
    expect(merged.input).toBe(1800);   // 1000 + 500 + 300
    expect(merged.output).toBe(700);   // 400 + 200 + 100
    expect(merged.cacheRead).toBe(70); // 50 + 20 + 0
    expect(merged.cacheWrite).toBe(15); // 10 + 0 + 5
    expect(merged.cost).toBeGreaterThan(0);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns subagentCount 0 when no subagents directory exists', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-nosubagent-'));
    const transcriptPath = path.join(testDir, 'solo-session.jsonl');
    fs.writeFileSync(transcriptPath, '');

    const result = parseSessionTranscript(transcriptPath);
    expect(result.subagentCount).toBe(0);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
