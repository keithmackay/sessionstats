// ABOUTME: Parses a single Claude Code transcript JSONL into per-model token/cost breakdown
// ABOUTME: Ported from claude-sessions/scripts/claude-metrics.py's parse_session, single-file only

import fs from 'fs';
import path from 'path';
import { costForUsage } from './pricing.js';
import type { ModelUsage } from '../types/index.js';

export interface TranscriptStats {
  models: ModelUsage[];
  apiMessages: number;
  userMessages: number;
  toolCalls: number;
  cacheHitRate: number;
}

export function parseTranscript(content: string): TranscriptStats {
  const byModel = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }>();
  let apiMessages = 0;
  let userMessages = 0;
  let toolCalls = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.type === 'user') {
      userMessages++;
      continue;
    }

    if (entry.type !== 'assistant') continue;
    const msg = entry.message ?? {};
    const usage = msg.usage;
    const model = msg.model ?? 'unknown';

    if (usage) {
      apiMessages++;
      const cost = costForUsage(
        {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        },
        model
      );
      const entryStats = byModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      entryStats.input += usage.input_tokens ?? 0;
      entryStats.output += usage.output_tokens ?? 0;
      entryStats.cacheRead += usage.cache_read_input_tokens ?? 0;
      entryStats.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      entryStats.cost += cost;
      byModel.set(model, entryStats);
    }

    const content_ = msg.content;
    if (Array.isArray(content_)) {
      for (const block of content_) {
        if (block && typeof block === 'object' && block.type === 'tool_use') toolCalls++;
      }
    }
  }

  const models: ModelUsage[] = Array.from(byModel.entries()).map(([model, v]) => ({
    model,
    input: v.input,
    output: v.output,
    cacheRead: v.cacheRead,
    cacheWrite: v.cacheWrite,
    cost: v.cost,
  }));

  const totalInput = models.reduce((s, m) => s + (m.input ?? 0), 0);
  const totalCacheRead = models.reduce((s, m) => s + (m.cacheRead ?? 0), 0);
  const totalCacheWrite = models.reduce((s, m) => s + (m.cacheWrite ?? 0), 0);
  const totalAllInput = totalInput + totalCacheRead + totalCacheWrite;
  const cacheHitRate = totalAllInput > 0 ? totalCacheRead / totalAllInput : 0;

  return { models, apiMessages, userMessages, toolCalls, cacheHitRate };
}

export interface SessionTranscriptStats extends TranscriptStats {
  subagentCount: number;
}

function mergeStats(a: TranscriptStats, b: TranscriptStats): TranscriptStats {
  const byModel = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }>();

  for (const stats of [a, b]) {
    for (const m of stats.models) {
      const entry = byModel.get(m.model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      entry.input += m.input ?? 0;
      entry.output += m.output ?? 0;
      entry.cacheRead += m.cacheRead ?? 0;
      entry.cacheWrite += m.cacheWrite ?? 0;
      entry.cost += m.cost ?? 0;
      byModel.set(m.model, entry);
    }
  }

  const models = Array.from(byModel.entries()).map(([model, v]) => ({ model, ...v }));
  const totalInput = models.reduce((s, m) => s + m.input, 0);
  const totalCacheRead = models.reduce((s, m) => s + m.cacheRead, 0);
  const totalCacheWrite = models.reduce((s, m) => s + m.cacheWrite, 0);
  const totalAllInput = totalInput + totalCacheRead + totalCacheWrite;

  return {
    models,
    apiMessages: a.apiMessages + b.apiMessages,
    userMessages: a.userMessages + b.userMessages,
    toolCalls: a.toolCalls + b.toolCalls,
    cacheHitRate: totalAllInput > 0 ? totalCacheRead / totalAllInput : 0,
  };
}

/**
 * Parses a session's main transcript plus any subagent transcripts under
 * <transcript-dir>/<session-id>/subagents/*.jsonl, merging token/cost/message
 * counts into a single result. Mirrors claude-metrics.py's parse_session subagent loop.
 */
export function parseSessionTranscript(transcriptPath: string): SessionTranscriptStats {
  const content = fs.readFileSync(transcriptPath, 'utf-8');
  let stats: TranscriptStats = parseTranscript(content);

  const sessionId = path.basename(transcriptPath, '.jsonl');
  const subagentDir = path.join(path.dirname(transcriptPath), sessionId, 'subagents');

  let subagentCount = 0;
  if (fs.existsSync(subagentDir)) {
    const files = fs.readdirSync(subagentDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      subagentCount++;
      const subContent = fs.readFileSync(path.join(subagentDir, file), 'utf-8');
      stats = mergeStats(stats, parseTranscript(subContent));
    }
  }

  return { ...stats, subagentCount };
}
