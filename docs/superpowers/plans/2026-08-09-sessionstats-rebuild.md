# sessionstats Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `cc-session-track` into `sessionstats`: JSON-native per-model cost/token tracking (ported from `claude-metrics.py`), a `.sessionstats/` per-project folder with interactive setup and multi-tagging, a local cross-project report, a web-post data contract (no upload yet), and removal of the incompatible legacy manual commands.

**Architecture:** TypeScript plugin, hooks-driven (`SessionStart`/`SessionEnd`), one JSON file per project (`.sessionstats/session_stats.json`) as source of truth, rendered to a Markdown view (`.sessionstats/session_stats.md`) on demand. New slash commands for setup, tag editing, plugin-level config, and cross-project reporting.

**Tech Stack:** Node/TypeScript (existing `esbuild` build), `vitest` for tests, no new runtime dependencies (drops `ccusage`).

**Spec:** `docs/plans/2026-08-09-sessionstats-rebuild-design.md` (read this first — it has the full schema definitions and rationale; this plan implements it task-by-task).

---

## Scope check

This spec was already decomposed during brainstorming into: (1) this plugin rebuild, (2) the already-completed migration script (`scripts/migrate-legacy-session-stats.mjs`, not re-planned here — it's done and verified), (3) `git-analysis.py` extraction to `~/Projects/gitanalysis` (Task 15 below — small, independent, included here since it's still unstarted). The web-upload implementation itself is out of scope for this plan (explicitly deferred in the spec).

## File structure

| File | Responsibility |
|---|---|
| `src/types/index.ts` | Modify — new `SessionRow` (models[] breakdown, no `claudeTime`), new `ProjectConfig`, new `PluginConfig`, `StatsFile`/`StatsFileTotals` without `totalClaudeTime` |
| `src/lib/pricing.ts` | Create — versioned per-model pricing table + cost calculation (ported from `claude-metrics.py`) |
| `src/lib/token-engine.ts` | Create — parses a transcript JSONL into per-model token/cost breakdown + message/tool/subagent counts |
| `src/lib/stats-parser.ts` | Modify — JSON read instead of CSV; totals computed by summing `models[]` |
| `src/lib/stats-writer.ts` | Modify — JSON write instead of CSV |
| `src/lib/project-config.ts` | Create — read/write `.sessionstats/config.json`, defaults, `.gitignore` append |
| `src/lib/plugin-config.ts` | Create — read/write `~/.claude/sessionstats/config.json` (`websiteUrl`, `scanRoots`) |
| `src/lib/orphan-detector.ts` | Modify — build new-schema END row |
| `src/lib/formatters.ts` | Modify — render from new schema, sum across `models[]`, drop `totalClaudeTime`, flag `[Migrated]` rows |
| `src/hooks/session-start.ts` | Modify — create `.sessionstats/` + config if missing, write START row to JSON |
| `src/hooks/session-end.ts` | Modify — use `token-engine` instead of `ccusage`, write END row to JSON |
| `src/scripts/show-stats.ts` | Modify — read `.sessionstats/session_stats.json`, write rendered `.sessionstats/session_stats.md` |
| `src/scripts/report.ts` | Create — `/sessionstats_report` implementation (scan `scanRoots`, filter by tag, aggregate) |
| `commands/session_setup.md` | Create — full interactive config flow |
| `commands/session_tags.md` | Create — tags-only interactive flow |
| `commands/sessionstats_config.md` | Create — plugin-level `websiteUrl` setup |
| `commands/sessionstats_report.md` | Create — thin wrapper invoking `report.ts` |
| `commands/start_session.md`, `commands/end_session.md` | Delete |
| `package.json` | Modify — remove `ccusage` dependency |
| `plugin.json`, README | Modify — rename to `sessionstats` |
| `tests/unit/*.test.ts` | Modify/create alongside each module above |

---

## Task 1: New types for the JSON schema

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Replace `SessionRow`, `StatsFileTotals`, add `ProjectConfig`/`PluginConfig`**

```typescript
// ABOUTME: TypeScript interfaces for sessionstats plugin
// ABOUTME: Defines hook I/O, session rows, stats file structure, and per-project/plugin config

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart' | 'SessionEnd';
  source?: 'startup' | 'clear' | 'compact' | 'resume';
  reason?: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

export interface HookOutput {
  continue: boolean;
  suppressOutput: boolean;
}

export interface ModelUsage {
  model: string;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cost: number | null;
}

export interface SessionRow {
  sessionId: string;
  project: string;
  event: 'START' | 'END';
  timestamp: string;
  duration: string | null;
  models: ModelUsage[];
  apiMessages: number | null;
  userMessages: number | null;
  toolCalls: number | null;
  subagentCount: number | null;
  cacheHitRate: number | null;
  flags: string | null;
  machineId: string | null;
}

export interface StatsFileTotals {
  sessions: number;
  totalDuration: string;
  totalCost: number;
  totalTokens: number;
}

export interface StatsFile {
  schemaVersion: number;
  totals: StatsFileTotals;
  rows: SessionRow[];
}

export interface ProjectConfig {
  schemaVersion: number;
  projectName: string;
  tags: string[];
  userEmail: string | null;
  postToWeb: boolean;
  needsSetupConfirmation?: boolean;
}

export interface PluginConfig {
  websiteUrl: string | null;
  scanRoots: string[];
}
```

- [ ] **Step 2: Compile check**

Run: `npx tsc --noEmit`
Expected: errors in `stats-parser.ts`, `stats-writer.ts`, `formatters.ts`, `orphan-detector.ts`, `session-start.ts`, `session-end.ts` (all reference the old shape) — this is expected; each is fixed in its own task below. No errors should come from `types/index.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: new JSON-native SessionRow/ProjectConfig/PluginConfig schema"
```

---

## Task 2: Pricing table + cost calculation

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `tests/unit/pricing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { getPricing, costForUsage } from '../../src/lib/pricing.js';

describe('pricing', () => {
  it('returns exact pricing for a known model', () => {
    const p = getPricing('claude-sonnet-4-5-20250929');
    expect(p.input).toBe(3.00);
    expect(p.output).toBe(15.00);
  });

  it('falls back to default pricing for an unknown model', () => {
    const p = getPricing('claude-future-model-9000');
    expect(p.input).toBeGreaterThan(0);
  });

  it('computes cost from token usage', () => {
    const cost = costForUsage(
      { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      'claude-sonnet-4-5-20250929'
    );
    expect(cost).toBeCloseTo(18.00, 2); // 3 + 15
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/pricing.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/pricing.js'`

- [ ] **Step 3: Implement (ported from `claude-metrics.py`'s `PRICING`/`get_pricing`/`cost_for_usage`)**

```typescript
// ABOUTME: Per-model USD pricing table and cost calculation
// ABOUTME: Ported from claude-sessions/scripts/claude-metrics.py; update when Anthropic pricing changes

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-5-20251101': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-6': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
};

const DEFAULT_PRICING: ModelPricing = { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };

export function getPricing(model: string): ModelPricing {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  return DEFAULT_PRICING;
}

export function costForUsage(usage: Usage, model: string): number {
  const pricing = getPricing(model);
  const perM = 1_000_000;
  return (
    (usage.input_tokens / perM) * pricing.input +
    (usage.output_tokens / perM) * pricing.output +
    (usage.cache_read_input_tokens / perM) * pricing.cacheRead +
    (usage.cache_creation_input_tokens / perM) * pricing.cacheWrite
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/pricing.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing.ts tests/unit/pricing.test.ts
git commit -m "feat: port claude-metrics.py pricing table to TypeScript"
```

---

## Task 3: Token engine (transcript JSONL → per-model breakdown)

**Files:**
- Create: `src/lib/token-engine.ts`
- Test: `tests/unit/token-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../../src/lib/token-engine.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/token-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement (ported from `claude-metrics.py`'s `parse_session`, single-file scope — subagent merging happens in Task 4/session-end, not here)**

```typescript
// ABOUTME: Parses a single Claude Code transcript JSONL into per-model token/cost breakdown
// ABOUTME: Ported from claude-sessions/scripts/claude-metrics.py's parse_session, single-file only

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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/token-engine.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add subagent rollup (required by spec Design §3 — "subagent token/cost folded into the parent session")**

Add a failing test for subagent merging to `tests/unit/token-engine.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseSessionTranscript } from '../../src/lib/token-engine.js';

describe('parseSessionTranscript (with subagent rollup)', () => {
  it('merges subagent token/cost into the parent session and counts subagents', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-subagent-'));
    const sessionId = 'parent-session-1';
    const transcriptPath = path.join(testDir, `${sessionId}.jsonl`);
    const subagentDir = path.join(testDir, sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });

    const assistantLine = (tokens: number) => JSON.stringify({
      type: 'assistant', timestamp: '2026-01-01T00:00:00Z',
      message: {
        model: 'claude-sonnet-4-5-20250929',
        usage: { input_tokens: tokens, output_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        content: [],
      },
    });

    fs.writeFileSync(transcriptPath, assistantLine(1000) + '\n');
    fs.writeFileSync(path.join(subagentDir, 'agent-1.jsonl'), assistantLine(500) + '\n');
    fs.writeFileSync(path.join(subagentDir, 'agent-2.jsonl'), assistantLine(300) + '\n');

    const result = parseSessionTranscript(transcriptPath);

    expect(result.subagentCount).toBe(2);
    expect(result.models[0].input).toBe(1800); // 1000 (parent) + 500 + 300 (subagents)

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
```

Run: `npx vitest run tests/unit/token-engine.test.ts`
Expected: FAIL — `parseSessionTranscript` not exported yet

Add to `src/lib/token-engine.ts` (below the existing `parseTranscript`, ported from `claude-metrics.py`'s `parse_session`'s subagent loop):

```typescript
import fs from 'fs';
import path from 'path';

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
```

Run: `npx vitest run tests/unit/token-engine.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/token-engine.ts tests/unit/token-engine.test.ts
git commit -m "feat: port claude-metrics.py transcript parsing + subagent rollup to TypeScript"
```

---

## Task 4: JSON stats reader/writer (replaces CSV)

**Files:**
- Modify: `src/lib/stats-parser.ts`
- Modify: `src/lib/stats-writer.ts`
- Modify: `tests/unit/stats-file.test.ts` (rewrite for JSON)

- [ ] **Step 1: Rewrite the test file for JSON**

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/stats-file.test.ts`
Expected: FAIL (old CSV-based implementation doesn't match new assertions)

- [ ] **Step 3: Rewrite `stats-parser.ts`**

```typescript
// ABOUTME: Reader for .sessionstats/session_stats.json
// ABOUTME: Totals are computed dynamically from rows by summing each row's models[] array

import fs from 'fs';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';

export const SCHEMA_VERSION = 1;

export function parseStatsFile(filePath: string): StatsFile {
  if (!fs.existsSync(filePath)) {
    return { schemaVersion: SCHEMA_VERSION, totals: createEmptyTotals(), rows: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const rows: SessionRow[] = raw.rows ?? [];
  return { schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION, totals: computeTotals(rows), rows };
}

export function findStartRow(filePath: string, sessionId: string): SessionRow | null {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter(r => r.sessionId === sessionId && r.event === 'START');
  return startRows[startRows.length - 1] || null;
}

export function createEmptyTotals(): StatsFileTotals {
  return { sessions: 0, totalDuration: '00:00:00', totalCost: 0, totalTokens: 0 };
}

export function rowCost(row: SessionRow): number {
  return row.models.reduce((sum, m) => sum + (m.cost ?? 0), 0);
}

export function rowTokens(row: SessionRow): number {
  return row.models.reduce((sum, m) => sum + (m.input ?? 0) + (m.output ?? 0) + (m.cacheRead ?? 0) + (m.cacheWrite ?? 0), 0);
}

function computeTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');
  let totalDurationMs = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    totalCost += rowCost(row);
    totalTokens += rowTokens(row);
  }

  return { sessions: endRows.length, totalDuration: formatMsToTime(totalDurationMs), totalCost, totalTokens };
}

function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 4: Rewrite `stats-writer.ts`**

```typescript
// ABOUTME: Writer for .sessionstats/session_stats.json
// ABOUTME: Full-file rewrite on each append (small files, simplicity over incremental writes)

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SessionRow } from '../types/index.js';
import { parseStatsFile, SCHEMA_VERSION } from './stats-parser.js';

export function getMachineId(): string {
  let username: string;
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || 'unknown';
  }
  return `${username}@${os.hostname()}`;
}

export function writeStatsFile(filePath: string, rows: SessionRow[]): void {
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows }, null, 2) + '\n';
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function appendRow(filePath: string, row: SessionRow): void {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);
  writeStatsFile(filePath, stats.rows);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/unit/stats-file.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Confirm no consumers of the retired CSV-only exports remain**

The rewritten `stats-parser.ts` no longer exports `CSV_HEADER`, `FILE_HEADER`, or `parseCSVRow` (CSV-specific, not part of the JSON format). Explicitly check nothing outside this file imports them before relying on `tsc` to catch it incidentally:

Run: `grep -rn "CSV_HEADER\|FILE_HEADER\|parseCSVRow" src/ tests/ commands/`
Expected: no matches (the old `stats-file.test.ts` import of these was already removed in Step 1 above). If anything else matches, update it now rather than deferring to Task 19's typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stats-parser.ts src/lib/stats-writer.ts tests/unit/stats-file.test.ts
git commit -m "feat: switch session stats storage from CSV to JSON, sum cost/tokens across models[]"
```

---

## Task 5: Project config (`.sessionstats/config.json`) read/write + `.gitignore` handling

**Files:**
- Create: `src/lib/project-config.ts`
- Test: `tests/unit/project-config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadOrCreateProjectConfig, ensureGitignoreEntry } from '../../src/lib/project-config.js';

describe('project-config', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-proj-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates config with defaults and needsSetupConfirmation when missing', () => {
    const config = loadOrCreateProjectConfig(projectDir);
    expect(config.projectName).toBe(path.basename(projectDir));
    expect(config.tags).toEqual([]);
    expect(config.postToWeb).toBe(false);
    expect(config.needsSetupConfirmation).toBe(true);
  });

  it('returns the existing config unchanged on second call', () => {
    loadOrCreateProjectConfig(projectDir);
    const configPath = path.join(projectDir, '.sessionstats', 'config.json');
    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    onDisk.tags = ['team-infra'];
    onDisk.needsSetupConfirmation = false;
    fs.writeFileSync(configPath, JSON.stringify(onDisk));

    const config = loadOrCreateProjectConfig(projectDir);
    expect(config.tags).toEqual(['team-infra']);
    expect(config.needsSetupConfirmation).toBe(false);
  });

  it('appends .sessionstats/ to an existing .gitignore', () => {
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\n');
    ensureGitignoreEntry(projectDir);
    const content = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.sessionstats/');
  });

  it('does not create a .gitignore if none exists', () => {
    ensureGitignoreEntry(projectDir);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(false);
  });

  it('does not duplicate the entry on repeated calls', () => {
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\n');
    ensureGitignoreEntry(projectDir);
    ensureGitignoreEntry(projectDir);
    const content = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(content.match(/\.sessionstats\//g)?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/project-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// ABOUTME: Reads/creates .sessionstats/config.json (per-project config) and manages .gitignore entry
// ABOUTME: git config user.email lookup falls back gracefully to null if git is unavailable

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { ProjectConfig } from '../types/index.js';

const SCHEMA_VERSION = 1;

export function projectConfigPath(projectDir: string): string {
  return path.join(projectDir, '.sessionstats', 'config.json');
}

function gitEmail(projectDir: string): string | null {
  try {
    return execSync('git config user.email', {
      cwd: projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

export function loadOrCreateProjectConfig(projectDir: string): ProjectConfig {
  const configPath = projectConfigPath(projectDir);
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  const config: ProjectConfig = {
    schemaVersion: SCHEMA_VERSION,
    projectName: path.basename(projectDir),
    tags: [],
    userEmail: gitEmail(projectDir),
    postToWeb: false,
    needsSetupConfirmation: true,
  };
  writeProjectConfig(projectDir, config);
  return config;
}

export function writeProjectConfig(projectDir: string, config: ProjectConfig): void {
  const configPath = projectConfigPath(projectDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function ensureGitignoreEntry(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (content.includes('.sessionstats/')) return;

  const needsNewline = content.length > 0 && !content.endsWith('\n');
  fs.appendFileSync(gitignorePath, `${needsNewline ? '\n' : ''}.sessionstats/\n`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/project-config.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/project-config.ts tests/unit/project-config.test.ts
git commit -m "feat: add per-project .sessionstats/config.json handling + .gitignore append"
```

---

## Task 6: Plugin-level config (`~/.claude/sessionstats/config.json`)

**Files:**
- Create: `src/lib/plugin-config.ts`
- Test: `tests/unit/plugin-config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadPluginConfig, writePluginConfig, pluginConfigPath } from '../../src/lib/plugin-config.js';

describe('plugin-config', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('returns defaults when no config exists', () => {
    const config = loadPluginConfig();
    expect(config.websiteUrl).toBeNull();
    expect(config.scanRoots).toEqual([path.join(homeDir, 'Projects')]);
  });

  it('writes and reads back websiteUrl', () => {
    writePluginConfig({ websiteUrl: 'https://example.com/api/sessions', scanRoots: [path.join(homeDir, 'Projects')] });
    const config = loadPluginConfig();
    expect(config.websiteUrl).toBe('https://example.com/api/sessions');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/plugin-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// ABOUTME: Reads/writes ~/.claude/sessionstats/config.json (plugin-level: websiteUrl, scanRoots)

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { PluginConfig } from '../types/index.js';

export function pluginConfigPath(): string {
  return path.join(os.homedir(), '.claude', 'sessionstats', 'config.json');
}

function defaults(): PluginConfig {
  return { websiteUrl: null, scanRoots: [path.join(os.homedir(), 'Projects')] };
}

export function loadPluginConfig(): PluginConfig {
  const configPath = pluginConfigPath();
  if (!fs.existsSync(configPath)) return defaults();
  return { ...defaults(), ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
}

export function writePluginConfig(config: PluginConfig): void {
  const configPath = pluginConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/plugin-config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/plugin-config.ts tests/unit/plugin-config.test.ts
git commit -m "feat: add plugin-level config (websiteUrl, scanRoots)"
```

---

## Task 7: Fix `orphan-detector.ts` for the new schema

**Files:**
- Modify: `src/lib/orphan-detector.ts`
- Modify: `tests/unit/orphan-detector.test.ts`

- [ ] **Step 1: Update the test for the new row shape**

Read the existing `tests/unit/orphan-detector.test.ts` first (`cat tests/unit/orphan-detector.test.ts`) and update every constructed `SessionRow` literal in it to the new shape (`models: []`, no `claudeTime`, add `apiMessages`/`userMessages`/`toolCalls`/`subagentCount`/`cacheHitRate` as `null`), matching the fixtures used in Task 4. Keep existing assertions about `[Abnormal End]` flag behavior — only the row shape changes.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/orphan-detector.test.ts`
Expected: FAIL (type/shape mismatch against updated `stats-parser`/`stats-writer`)

- [ ] **Step 3: Fix the implementation**

```typescript
// ABOUTME: Detects crashed/orphaned sessions (START without END) and auto-closes them
// ABOUTME: Marks orphaned sessions with [Abnormal End] flag; no token/cost data available for these

import { parseStatsFile } from './stats-parser.js';
import { appendRow, getMachineId } from './stats-writer.js';
import { calculateDuration } from './formatters.js';
import type { SessionRow } from '../types/index.js';

export function detectAndCloseOrphans(filePath: string): SessionRow[] {
  const stats = parseStatsFile(filePath);
  const closedOrphans: SessionRow[] = [];

  const sessionIds = new Set(stats.rows.map(r => r.sessionId));

  for (const sessionId of sessionIds) {
    const sessionRows = stats.rows.filter(r => r.sessionId === sessionId);
    const hasStart = sessionRows.some(r => r.event === 'START');
    const hasEnd = sessionRows.some(r => r.event === 'END');

    if (hasStart && !hasEnd) {
      const startRow = sessionRows.find(r => r.event === 'START')!;

      const endRow: SessionRow = {
        sessionId,
        project: startRow.project,
        event: 'END',
        timestamp: new Date().toISOString(),
        duration: calculateDuration(startRow.timestamp, new Date().toISOString()),
        models: [],
        apiMessages: null,
        userMessages: null,
        toolCalls: null,
        subagentCount: null,
        cacheHitRate: null,
        flags: '[Abnormal End]',
        machineId: startRow.machineId || getMachineId(),
      };

      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }

  return closedOrphans;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/orphan-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/orphan-detector.ts tests/unit/orphan-detector.test.ts
git commit -m "fix: orphan-detector builds new-schema rows (models: [], no claudeTime)"
```

---

## Task 8: Fix `formatters.ts` for the new schema + `[Migrated]` flagging

**Files:**
- Modify: `src/lib/formatters.ts`
- Modify: `tests/unit/formatters.test.ts`

- [ ] **Step 1: Update the test file**

Read `tests/unit/formatters.test.ts` first. Update fixtures to the new `StatsFile`/`SessionRow` shape (remove `totalClaudeTime` from any `StatsFileTotals` fixture; rows use `models: [...]` instead of flat `cost`/`tokens`/`model`). Add one new test:

```typescript
it('marks [Migrated] rows distinctly in terminal output', () => {
  const stats /* StatsFile */ = {
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/formatters.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite `formatTerminalOutput`/`formatMarkdownOutput`**

Replace the full contents of `src/lib/formatters.ts` with:

```typescript
// ABOUTME: Formatting utilities for time, duration, and session statistics display
// ABOUTME: Renders from the models[] breakdown; no longer has a "Claude Time" concept

import type { StatsFile, SessionRow } from '../types/index.js';
import { rowCost, rowTokens } from './stats-parser.js';

export function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

export function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', red: '\x1b[31m',
};

export function calculateDuration(startISO: string, endISO: string): string {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);
  return formatMsToTime(durationMs);
}

function rowCostStr(row: SessionRow): string {
  return row.models.length > 0 ? `$${rowCost(row).toFixed(2)}` : 'N/A';
}

function rowTokensStr(row: SessionRow): string {
  return row.models.length > 0 ? rowTokens(row).toLocaleString() : 'N/A';
}

function rowModelStr(row: SessionRow): string {
  return row.models.map(m => m.model).join(', ') || 'N/A';
}

export function formatTerminalOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${COLORS.cyan}╭${'─'.repeat(60)}╮${COLORS.reset}`);
  lines.push(`${COLORS.cyan}│${COLORS.reset}  ${COLORS.bold}SESSION STATISTICS: ${projectName}${COLORS.reset}`.padEnd(71) + `${COLORS.cyan}│${COLORS.reset}`);
  lines.push(`${COLORS.cyan}╰${'─'.repeat(60)}╯${COLORS.reset}`);
  lines.push('');

  lines.push(`  ${COLORS.bold}TOTALS${COLORS.reset}`);
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Sessions:     ${COLORS.green}${stats.totals.sessions}${COLORS.reset}`);
  lines.push(`  Total Time:   ${COLORS.green}${stats.totals.totalDuration}${COLORS.reset}`);
  lines.push(`  Total Cost:   ${COLORS.green}$${stats.totals.totalCost.toFixed(2)}${COLORS.reset}`);
  lines.push(`  Total Tokens: ${COLORS.green}${stats.totals.totalTokens.toLocaleString()}${COLORS.reset}`);
  lines.push('');

  const endRows = stats.rows.filter(r => r.event === 'END').slice(-5).reverse();
  if (endRows.length > 0) {
    lines.push(`  ${COLORS.bold}RECENT SESSIONS (last ${endRows.length})${COLORS.reset}`);
    lines.push(`  ${'─'.repeat(40)}`);
    for (const row of endRows) {
      const date = new Date(row.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      const flag = row.flags ? ` ${COLORS.yellow}${row.flags}${COLORS.reset}` : '';
      lines.push(`  ${date.padEnd(18)} ${(row.duration || 'N/A').padEnd(10)} ${COLORS.green}${rowCostStr(row)}${COLORS.reset}${flag}`);
    }
    lines.push('');
  } else {
    lines.push(`  ${COLORS.dim}No completed sessions yet${COLORS.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMarkdownOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  lines.push(`## Session Statistics: ${projectName}`);
  lines.push('');
  lines.push('### Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Sessions | ${stats.totals.sessions} |`);
  lines.push(`| Total Duration | ${stats.totals.totalDuration} |`);
  lines.push(`| Total Cost | $${stats.totals.totalCost.toFixed(2)} |`);
  lines.push(`| Total Tokens | ${stats.totals.totalTokens.toLocaleString()} |`);
  lines.push('');

  const endRows = stats.rows.filter(r => r.event === 'END').slice(-10).reverse();
  if (endRows.length > 0) {
    lines.push('### Recent Sessions');
    lines.push('');
    lines.push('| Date | Duration | Cost | Tokens | Model | Flags |');
    lines.push('|------|----------|------|--------|-------|-------|');
    for (const row of endRows) {
      const date = new Date(row.timestamp).toISOString().split('T')[0];
      lines.push(`| ${date} | ${row.duration || 'N/A'} | ${rowCostStr(row)} | ${rowTokensStr(row)} | ${rowModelStr(row)} | ${row.flags || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
```

This drops `Claude Time`/`totalClaudeTime` entirely (both the totals line and the markdown table row), matching `StatsFileTotals` no longer having that field. `[Migrated]` rows render via the existing `row.flags` display — no special-case code needed since `flags` already flows through both functions.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/formatters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatters.ts tests/unit/formatters.test.ts
git commit -m "fix: formatters render from models[] breakdown, drop claude-time, show [Migrated] flag"
```

---

## Task 9: Rewire `session-start.ts` hook

**Files:**
- Modify: `src/hooks/session-start.ts`

- [ ] **Step 1: Rewrite**

```typescript
// ABOUTME: SessionStart hook — creates .sessionstats/ config if missing, detects orphans, records START
// ABOUTME: Never blocks tracking on interactive setup completing (needsSetupConfirmation is advisory)

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { detectAndCloseOrphans } from '../lib/orphan-detector.js';
import { loadOrCreateProjectConfig, ensureGitignoreEntry } from '../lib/project-config.js';

async function sessionStartHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(input.cwd);

  const config = loadOrCreateProjectConfig(input.cwd);
  ensureGitignoreEntry(input.cwd);

  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[sessionstats] Closed ${closedOrphans.length} orphaned session(s)`);
    }
  } catch (error) {
    console.error('[sessionstats] Error detecting orphans:', error);
  }

  const startRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'START',
    timestamp: new Date().toISOString(),
    duration: null,
    models: [],
    apiMessages: null,
    userMessages: null,
    toolCalls: null,
    subagentCount: null,
    cacheHitRate: null,
    flags: null,
    machineId: getMachineId(),
  };

  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error('[sessionstats] Error recording session start:', error);
  }

  const output: HookOutput = { continue: true, suppressOutput: !config.needsSetupConfirmation };
  if (config.needsSetupConfirmation) {
    console.error(
      '[sessionstats] This project has not confirmed its .sessionstats/config.json yet. ' +
      'Please interactively confirm/adjust projectName, tags, userEmail, and postToWeb with the user now ' +
      '(same flow as /session_setup), then clear needsSetupConfirmation in .sessionstats/config.json.'
    );
  }
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionStartHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

- [ ] **Step 2: Build and manually smoke-test**

Run: `npm run build`
Run: `echo '{"session_id":"test123","transcript_path":"/tmp/none.jsonl","cwd":"'$(mktemp -d)'","hook_event_name":"SessionStart"}' | node plugin/scripts/session-start.js`
Expected: JSON output `{"continue":true,...}` on stdout, a `[sessionstats] This project has not confirmed...` line on stderr, and a `.sessionstats/config.json` + `.sessionstats/session_stats.json` created in the temp dir printed by `mktemp -d` (check with `cat`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/session-start.ts
git commit -m "feat: session-start hook creates .sessionstats/ config, writes JSON START row"
```

---

## Task 10: Rewire `session-end.ts` hook (drop `ccusage`, use token-engine)

**Files:**
- Modify: `src/hooks/session-end.ts`
- Modify: `package.json` (remove `ccusage` dependency)

- [ ] **Step 1: Rewrite**

```typescript
// ABOUTME: SessionEnd hook — parses the transcript + subagents via token-engine (no ccusage), records END
// ABOUTME: Applies project config's tags/postToWeb to the row for future reporting/upload

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { findStartRow } from '../lib/stats-parser.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { calculateDuration } from '../lib/formatters.js';
import { parseSessionTranscript } from '../lib/token-engine.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';

async function sessionEndHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(input.cwd);
  const endTime = new Date().toISOString();

  const startRow = findStartRow(statsPath, input.session_id);
  const config = loadOrCreateProjectConfig(input.cwd);

  let transcriptStats;
  try {
    transcriptStats = parseSessionTranscript(input.transcript_path);
  } catch (error) {
    console.error('[sessionstats] Could not read transcript (this is OK):', error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }

  const duration = startRow ? calculateDuration(startRow.timestamp, endTime) : null;

  const endRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'END',
    timestamp: endTime,
    duration,
    models: transcriptStats.models,
    apiMessages: transcriptStats.apiMessages,
    userMessages: transcriptStats.userMessages,
    toolCalls: transcriptStats.toolCalls,
    subagentCount: transcriptStats.subagentCount,
    cacheHitRate: transcriptStats.cacheHitRate,
    flags: startRow ? null : '[No Start Found]',
    machineId: getMachineId(),
  };

  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error('[sessionstats] Error recording session end:', error);
  }

  // config.tags / config.postToWeb are available here for the future web-upload phase (not implemented yet).
  void config;

  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionEndHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

Subagent token/cost rollup is handled by `parseSessionTranscript` (Task 3, Step 5) — no deferral needed; `subagentCount` and merged model totals come straight from its return value.

- [ ] **Step 2: Remove `ccusage` dependency**

Edit `package.json`: delete the `"ccusage": "^17.2.0"` line from `dependencies`.

Run: `npm install`
Expected: `package-lock.json` updates, `ccusage` removed from `node_modules`.

- [ ] **Step 3: Build and manually smoke-test**

Run: `npm run build`
Create a tiny fixture transcript and run the compiled hook directly, confirming `.sessionstats/session_stats.json` gets an END row with a non-empty `models` array when the fixture has assistant/usage entries.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/session-end.ts package.json package-lock.json
git commit -m "feat: session-end hook uses token-engine instead of ccusage, drops ccusage dependency"
```

---

## Task 11: `show-stats.ts` reads/writes the new locations

**Files:**
- Modify: `src/scripts/show-stats.ts`

- [ ] **Step 1: Update paths and add markdown-view regeneration**

```typescript
// ABOUTME: CLI script to display session statistics and regenerate .sessionstats/session_stats.md
// ABOUTME: session_stats.md is a rendered view only — always regenerated from the JSON, never hand-edited

import fs from 'fs';
import path from 'path';
import { parseStatsFile } from '../lib/stats-parser.js';
import { formatTerminalOutput, formatMarkdownOutput } from '../lib/formatters.js';

function showStats(): void {
  const args = process.argv.slice(2);
  const useMarkdown = args.includes('md') || args.includes('markdown');

  const projectDir = args.find(arg => !['md', 'markdown'].includes(arg)) || process.cwd();
  const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
  const renderedPath = path.join(projectDir, '.sessionstats', 'session_stats.md');
  const projectName = path.basename(projectDir);

  const stats = parseStatsFile(statsPath);

  if (stats.rows.length === 0) {
    console.log('No session statistics found.');
    console.log('Sessions will be tracked automatically when you start and end Claude Code sessions.');
    return;
  }

  const markdown = formatMarkdownOutput(stats, projectName);
  fs.writeFileSync(renderedPath, markdown, 'utf-8');

  console.log(useMarkdown ? markdown : formatTerminalOutput(stats, projectName));
}

showStats();
```

- [ ] **Step 2: Build and manually smoke-test**

Run: `npm run build`
Run: `node plugin/scripts/show-stats.js <path-to-a-project-with-.sessionstats>`
Expected: terminal output printed, and `.sessionstats/session_stats.md` written/updated in that project.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/show-stats.ts
git commit -m "feat: show-stats reads .sessionstats/session_stats.json, regenerates session_stats.md view"
```

---

## Task 12: `/session_setup` command

**Files:**
- Create: `commands/session_setup.md`

- [ ] **Step 1: Write the command**

```markdown
---
description: Interactively confirm or edit this project's sessionstats configuration
---

# Session Setup

Read `.sessionstats/config.json` in the current project (create it via a normal session start if it doesn't exist yet — run `node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/session-start.js"` is not appropriate here; instead just read the file, and if missing, tell the user no session has started yet and to try again after their first message).

Interactively confirm or update each field with the user, showing current values as defaults:

1. **Project name** (`projectName`) — currently shown value; ask if they want to change it from the folder-name default.
2. **Tags** (`tags`) — currently shown array; ask what tags to set (e.g. team, feature/epic). Multiple tags are supported — this project can belong to more than one aggregation group at once.
3. **User email** (`userEmail`) — currently shown value (defaulted from `git config user.email`); ask if it should change.
4. **Post to web** (`postToWeb`) — currently `true`/`false`; ask whether this project's sessions should (eventually) be posted to the configured website. Explain that the actual upload isn't implemented yet — this just sets the intent.

After confirming all four, write the updated JSON back to `.sessionstats/config.json`, preserving `schemaVersion`, and set `needsSetupConfirmation` to `false`. Confirm the saved values to the user.
```

- [ ] **Step 2: Manual test**

In a test project with `.sessionstats/config.json` present (from Task 9's smoke test), invoke `/session_setup` in Claude Code and confirm it reads current values, prompts for each field, and writes back correctly with `needsSetupConfirmation: false`.

- [ ] **Step 3: Commit**

```bash
git add commands/session_setup.md
git commit -m "feat: add /session_setup interactive config command"
```

---

## Task 13: `/session_tags` command

**Files:**
- Create: `commands/session_tags.md`

- [ ] **Step 1: Write the command**

```markdown
---
description: Interactively review or update this project's tags only, leaving other config untouched
---

# Session Tags

Read `.sessionstats/config.json` in the current project. Show the user the current `tags` array. Ask which tags to add and/or remove (e.g. "starting work on the billing epic — add epic-billing, keep team-infra").

Update only the `tags` field — do not modify `projectName`, `userEmail`, `postToWeb`, or `needsSetupConfirmation`. Write the file back and confirm the new `tags` array to the user.

If `.sessionstats/config.json` doesn't exist yet, tell the user no session has been tracked for this project yet and to try again after their first message, or run `/session_setup` for full configuration.
```

- [ ] **Step 2: Manual test**

Invoke `/session_tags` in a test project, add a tag, confirm only `tags` changed in the JSON file (diff before/after).

- [ ] **Step 3: Commit**

```bash
git add commands/session_tags.md
git commit -m "feat: add /session_tags tags-only edit command"
```

---

## Task 14: `/sessionstats_config` command (plugin-level)

**Files:**
- Create: `commands/sessionstats_config.md`

- [ ] **Step 1: Write the command**

```markdown
---
description: Interactively set the plugin-level sessionstats config (websiteUrl, scanRoots)
---

# sessionstats Plugin Config

Read `~/.claude/sessionstats/config.json` (defaults: `websiteUrl: null`, `scanRoots: ["~/Projects"]` if the file doesn't exist yet).

Interactively confirm or update:
1. **Website URL** (`websiteUrl`) — where session data would be posted once uploading is implemented (not implemented yet — this just records the intended endpoint).
2. **Scan roots** (`scanRoots`) — directories `/sessionstats_report` searches for `.sessionstats/` folders. Defaults to `["~/Projects"]`.

Write the updated JSON back to `~/.claude/sessionstats/config.json` (create the directory if needed) and confirm the saved values.
```

- [ ] **Step 2: Manual test**

Invoke `/sessionstats_config`, set a `websiteUrl`, confirm `~/.claude/sessionstats/config.json` is written correctly.

- [ ] **Step 3: Commit**

```bash
git add commands/sessionstats_config.md
git commit -m "feat: add /sessionstats_config plugin-level config command"
```

---

## Task 15: `/sessionstats_report` — cross-project tag aggregation

**Files:**
- Create: `src/scripts/report.ts`
- Create: `commands/sessionstats_report.md`
- Test: `tests/unit/report.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/report.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// ABOUTME: Cross-project aggregation for /sessionstats_report — scans scanRoots for .sessionstats/ folders
// ABOUTME: Filters by tag membership (array "contains" match) when a tag is given

import fs from 'fs';
import path from 'path';
import { parseStatsFile, rowCost, rowTokens } from '../lib/stats-parser.js';
import type { ProjectConfig } from '../types/index.js';

export interface ProjectAggregate {
  projectName: string;
  tags: string[];
  cost: number;
  tokens: number;
  sessions: number;
}

export interface ReportResult {
  projects: ProjectAggregate[];
  totalCost: number;
  totalTokens: number;
}

export function aggregateByTag(scanRoots: string[], tag: string | null): ReportResult {
  const projects: ProjectAggregate[] = [];

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());

    for (const entry of entries) {
      const projectDir = path.join(root, entry.name);
      const configPath = path.join(projectDir, '.sessionstats', 'config.json');
      if (!fs.existsSync(configPath)) continue;

      const config: ProjectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (tag && !config.tags.includes(tag)) continue;

      const statsPath = path.join(projectDir, '.sessionstats', 'session_stats.json');
      const stats = parseStatsFile(statsPath);
      const endRows = stats.rows.filter(r => r.event === 'END');

      projects.push({
        projectName: config.projectName,
        tags: config.tags,
        cost: endRows.reduce((s, r) => s + rowCost(r), 0),
        tokens: endRows.reduce((s, r) => s + rowTokens(r), 0),
        sessions: endRows.length,
      });
    }
  }

  return {
    projects,
    totalCost: projects.reduce((s, p) => s + p.cost, 0),
    totalTokens: projects.reduce((s, p) => s + p.tokens, 0),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/report.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the CLI entry point**

`package.json` has `"type": "module"` (confirmed), so this codebase is ESM-only — `require()` is not available. `src/scripts/show-stats.ts` and `extract-prompts.ts` both call their entry function unconditionally at module scope with no main-guard (confirmed by reading both files); match that existing pattern exactly rather than introducing `require.main`/`import.meta.url` machinery not used anywhere else in this codebase.

Add these imports to the top of `src/scripts/report.ts` (alongside the existing `fs`/`path` imports from Step 3) and append the CLI entry point at the bottom:

```typescript
import os from 'os';

// ... (aggregateByTag and its types from Step 3 stay above this line) ...

function printReport(): void {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf('--tag');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

  const pluginConfigPath = path.join(os.homedir(), '.claude', 'sessionstats', 'config.json');
  const scanRoots = fs.existsSync(pluginConfigPath)
    ? JSON.parse(fs.readFileSync(pluginConfigPath, 'utf-8')).scanRoots
    : [path.join(os.homedir(), 'Projects')];

  const result = aggregateByTag(scanRoots, tag);

  console.log('='.repeat(60));
  console.log(`  SESSIONSTATS REPORT${tag ? ` — tag: ${tag}` : ' — all projects'}`);
  console.log('='.repeat(60));
  for (const p of result.projects) {
    console.log(`  ${p.projectName.padEnd(24)} sessions:${p.sessions.toString().padStart(4)}  cost:$${p.cost.toFixed(2)}`);
  }
  console.log('-'.repeat(60));
  console.log(`  TOTAL cost: $${result.totalCost.toFixed(2)}  tokens: ${result.totalTokens.toLocaleString()}`);
}

printReport();
```

- [ ] **Step 6: Write the command wrapper**

```markdown
---
description: Show cost/token totals across all projects, optionally filtered by tag
---

Run the cross-project report script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/report.js"
```

If the user specifies a tag (e.g. "show me team-infra"), pass it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/report.js" --tag <tag-name>
```

The script outputs formatted totals directly — no additional formatting needed.
```

- [ ] **Step 7: Build and manual test**

Run: `npm run build`
Run: `node plugin/scripts/report.js` against real `~/Projects` data (after Task 20's migration has run) and confirm output is sane.

- [ ] **Step 8: Commit**

```bash
git add src/scripts/report.ts commands/sessionstats_report.md tests/unit/report.test.ts
git commit -m "feat: add /sessionstats_report cross-project tag aggregation"
```

---

## Task 16: Delete legacy `/start_session` and `/end_session` commands

**Files:**
- Delete: `commands/start_session.md`
- Delete: `commands/end_session.md`

- [ ] **Step 1: Delete and commit**

```bash
git rm commands/start_session.md commands/end_session.md
git commit -m "chore: delete legacy start_session/end_session commands, superseded by hooks"
```

---

## Task 17: Rename to `sessionstats`

**Files:**
- Modify: `plugin.json` (built at `plugin/.claude-plugin/plugin.json` — update source; check where the source of truth lives, likely `.claude-plugin/plugin.json` at repo root per the earlier verified structure)
- Modify: README.md, any remaining "cc-session-track" strings
- Rename: `~/Projects/cc-session-track` → `~/Projects/sessionstats` (filesystem operation, done last)

- [ ] **Step 1: Grep for all remaining references**

Run: `grep -rln "cc-session-track" --include="*.json" --include="*.md" --include="*.ts" . | grep -v node_modules`
Expected: lists `.claude-plugin/plugin.json`, `README.md`, possibly `docs/*.md` historical references (leave historical docs/plans and docs/criticalreviews untouched — they're a record of what was true at the time).

- [ ] **Step 2: Update `plugin.json`**

Change `name`, `description`, `repository` fields from `cc-session-track` to `sessionstats`.

- [ ] **Step 3: Update README.md**

Update title, install instructions (`claude plugin marketplace add`/`claude plugin install` commands), and repository URL to reference `sessionstats`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors; `plugin/.claude-plugin/plugin.json` reflects the new name after build.

- [ ] **Step 5: Commit the in-repo rename**

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "chore: rename plugin from cc-session-track to sessionstats"
```

- [ ] **Step 6: Rename the project folder (filesystem + git remote, do this last, outside the git history of this repo)**

```bash
mv ~/Projects/cc-session-track ~/Projects/sessionstats
cd ~/Projects/sessionstats
git remote set-url origin https://github.com/keithmackay/sessionstats  # if/when the GitHub repo is also renamed
```

- [ ] **Step 7: Re-register with Claude Code's plugin marketplace**

Since the plugin is installed via the directory-source marketplace pointed at `~/Projects` (per the spec's verified assumption), the old `cc-session-track@local-dev` entry needs uninstalling and `sessionstats` reinstalling:

```bash
claude plugin uninstall cc-session-track
claude plugin marketplace update local-dev   # or equivalent refresh command — check `claude plugin marketplace --help`
claude plugin install sessionstats
```

Verify: start a new Claude Code session in any project and confirm hooks fire without error (check for a fresh `.sessionstats/` folder being created).

---

## Task 18: Extract `git-analysis.py` to `~/Projects/gitanalysis`

**Files:**
- Move: `~/Projects/claude-sessions/scripts/git-analysis.py` → `~/Projects/gitanalysis/git-analysis.py`

- [ ] **Step 1: Create the new project and move the file**

```bash
mkdir -p ~/Projects/gitanalysis
git -C ~/Projects/claude-sessions mv scripts/git-analysis.py /tmp/git-analysis.py  # stage the removal in claude-sessions
mv /tmp/git-analysis.py ~/Projects/gitanalysis/git-analysis.py
cd ~/Projects/claude-sessions && git commit -m "chore: extract git-analysis.py to standalone ~/Projects/gitanalysis project"
```

- [ ] **Step 2: Initialize the new project**

```bash
cd ~/Projects/gitanalysis
git init
cat > .gitignore <<'EOF'
__pycache__/
*.pyc
EOF
cat > README.md <<'EOF'
# gitanalysis

Deterministic git repository analysis: commit history, author/file hotspots, churn, timeline.
Extracted from claude-sessions. See `git-analysis.py --help` for usage.
EOF
git add git-analysis.py .gitignore README.md
git commit -m "Initial commit: git-analysis.py extracted from claude-sessions"
```

- [ ] **Step 3: Verify it still runs standalone**

Run: `python3 ~/Projects/gitanalysis/git-analysis.py ~/Projects/gitanalysis`
Expected: runs without import errors (per the spec's verified assumption, it only uses Python stdlib).

---

## Task 19: Full test suite + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd ~/Projects/sessionstats && npx vitest run`
Expected: all tests pass (pricing, token-engine, stats-file, project-config, plugin-config, orphan-detector, formatters, report, prompt-extractor unaffected).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: `plugin/scripts/*.js` all rebuild without errors.

---

## Task 20: Run the legacy-data migration

**Files:** none (runs the already-committed `scripts/migrate-legacy-session-stats.mjs`)

- [ ] **Step 1: Dry run against real data one more time, after rename**

```bash
cd ~/Projects/sessionstats
node scripts/migrate-legacy-session-stats.mjs
```

Expected: same per-project plan as verified earlier in the spec, no errors, no files changed.

- [ ] **Step 2: Confirm with the user, then run for real**

This is destructive (deletes 70+ `session_stats.md` files). Get explicit go-ahead before running with `--yes` — do not run this step unattended.

```bash
node scripts/migrate-legacy-session-stats.mjs --yes
```

- [ ] **Step 3: Spot-check a few migrated projects**

```bash
cat ~/Projects/modelrouter/.sessionstats/config.json
cat ~/Projects/modelrouter/.sessionstats/session_stats.json | head -30
ls ~/Projects/modelrouter/session_stats.md 2>&1  # expect "No such file"
```

- [ ] **Step 4: Run `/sessionstats_report` against real migrated data**

Confirm totals look sane and `[Migrated]` rows show up distinctly (per Task 8).

---

## Notes for the implementing agent

- Tasks 1–8 are pure library code with unit tests — do these first, in order, since later tasks depend on their exports.
- Tasks 9–11 (hooks + show-stats) depend on Tasks 1–8 being complete.
- Tasks 12–15 (commands) depend on Task 9 (config creation) and Task 11 (rendering)/Task 15's own script.
- Task 16 (delete legacy commands) can happen any time after Task 9 proves hooks work standalone.
- Task 17 (rename) should happen after Tasks 1–16 are done and tests pass — renaming mid-flight just adds churn to every commit message and file path in this plan.
- Task 18 (git-analysis extraction) is fully independent — can be done in parallel with anything else, by a different agent if using subagent-driven-development.
- Task 20 (real migration run) must be last, and must not run unattended — it deletes real files across dozens of projects.
