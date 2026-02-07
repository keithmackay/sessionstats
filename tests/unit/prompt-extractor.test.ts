// ABOUTME: Tests for extracting user prompts from Claude Code JSONL transcript files
// ABOUTME: Validates filtering, sorting, and formatting of conversation history

import { describe, it, expect } from 'vitest';
import { extractPrompts, formatPromptsMarkdown, type Prompt } from '../../src/lib/prompt-extractor.js';

const makeEntry = (overrides: Record<string, unknown> = {}): string => {
  return JSON.stringify({
    type: 'user',
    userType: 'external',
    sessionId: 'sess-1',
    timestamp: '2026-02-07T03:15:53.023Z',
    message: { role: 'user', content: 'Hello world' },
    ...overrides,
  });
};

describe('extractPrompts', () => {
  it('extracts a simple user prompt', () => {
    const lines = [makeEntry()];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].content).toBe('Hello world');
    expect(prompts[0].timestamp).toBe('2026-02-07T03:15:53.023Z');
    expect(prompts[0].sessionId).toBe('sess-1');
  });

  it('ignores non-user entries', () => {
    const lines = [
      makeEntry({ type: 'assistant' }),
      makeEntry({ type: 'progress' }),
      makeEntry({ type: 'file-history-snapshot' }),
    ];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(0);
  });

  it('ignores user entries with list content (tool results)', () => {
    const lines = [
      makeEntry({
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'abc', content: [] }],
        },
      }),
    ];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(0);
  });

  it('ignores user entries with empty string content', () => {
    const lines = [
      makeEntry({ message: { role: 'user', content: '' } }),
      makeEntry({ message: { role: 'user', content: '   ' } }),
    ];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(0);
  });

  it('strips system-reminder tags from content', () => {
    const content = 'do the thing<system-reminder>\nsome system stuff\n</system-reminder>';
    const lines = [makeEntry({ message: { role: 'user', content } })];
    const prompts = extractPrompts(lines);
    expect(prompts[0].content).toBe('do the thing');
  });

  it('handles content that is only system-reminder tags', () => {
    const content = '<system-reminder>\nsome system stuff\n</system-reminder>';
    const lines = [makeEntry({ message: { role: 'user', content } })];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(0);
  });

  it('strips command-message and command-name tags', () => {
    const content = '<command-message>running...</command-message>\n<command-name>/build_story</command-name>\ndo the thing';
    const lines = [makeEntry({ message: { role: 'user', content } })];
    const prompts = extractPrompts(lines);
    expect(prompts[0].content).toBe('do the thing');
  });

  it('handles content that is only command tags', () => {
    const content = '<command-message>running...</command-message>\n<command-name>/session_stats</command-name>';
    const lines = [makeEntry({ message: { role: 'user', content } })];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(0);
  });

  it('extracts multiple prompts from multiple sessions', () => {
    const lines = [
      makeEntry({ sessionId: 'sess-1', timestamp: '2026-02-07T01:00:00.000Z', message: { role: 'user', content: 'first' } }),
      makeEntry({ sessionId: 'sess-1', timestamp: '2026-02-07T02:00:00.000Z', message: { role: 'user', content: 'second' } }),
      makeEntry({ sessionId: 'sess-2', timestamp: '2026-02-07T03:00:00.000Z', message: { role: 'user', content: 'third' } }),
    ];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(3);
    expect(prompts[0].content).toBe('first');
    expect(prompts[2].sessionId).toBe('sess-2');
  });

  it('sorts prompts by timestamp', () => {
    const lines = [
      makeEntry({ timestamp: '2026-02-07T03:00:00.000Z', message: { role: 'user', content: 'later' } }),
      makeEntry({ timestamp: '2026-02-07T01:00:00.000Z', message: { role: 'user', content: 'earlier' } }),
    ];
    const prompts = extractPrompts(lines);
    expect(prompts[0].content).toBe('earlier');
    expect(prompts[1].content).toBe('later');
  });

  it('skips malformed JSON lines gracefully', () => {
    const lines = [
      'not valid json',
      makeEntry(),
      '{ broken',
    ];
    const prompts = extractPrompts(lines);
    expect(prompts).toHaveLength(1);
  });
});

describe('formatPromptsMarkdown', () => {
  const prompts: Prompt[] = [
    { timestamp: '2026-02-07T01:00:00.000Z', content: 'first prompt', sessionId: 'sess-1' },
    { timestamp: '2026-02-07T02:00:00.000Z', content: 'second prompt', sessionId: 'sess-1' },
    { timestamp: '2026-02-08T10:00:00.000Z', content: 'next day prompt', sessionId: 'sess-2' },
  ];

  it('groups prompts by date', () => {
    const output = formatPromptsMarkdown(prompts);
    expect(output).toContain('## 2026-02-07');
    expect(output).toContain('## 2026-02-08');
  });

  it('includes timestamps as headers', () => {
    const output = formatPromptsMarkdown(prompts);
    // Should contain time portion
    expect(output).toMatch(/### \d{2}:\d{2}/);
  });

  it('includes prompt content as blockquotes', () => {
    const output = formatPromptsMarkdown(prompts);
    expect(output).toContain('> first prompt');
    expect(output).toContain('> next day prompt');
  });

  it('handles multi-line prompts in blockquotes', () => {
    const multiline: Prompt[] = [
      { timestamp: '2026-02-07T01:00:00.000Z', content: 'line one\nline two\nline three', sessionId: 'sess-1' },
    ];
    const output = formatPromptsMarkdown(multiline);
    expect(output).toContain('> line one\n> line two\n> line three');
  });

  it('returns empty string for no prompts', () => {
    const output = formatPromptsMarkdown([]);
    expect(output).toBe('');
  });
});
