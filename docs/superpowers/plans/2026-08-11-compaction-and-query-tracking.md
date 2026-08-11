# Compaction Tracking, Session Breaks, and Verbose Query Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track context-compaction exercises and manual session breaks as their own bounded, non-overlapping stats entries; add opt-in per-query tracking; fix the resulting double-counting bugs at their root.

**Architecture:** Every END-row-writing hook (`session-end.ts`, new `precompact.ts`, new `session-break.ts`) reads a per-session checkpoint file (`byteOffset`, `processedSubagents`, `queries`) and calls a new incremental transcript parser (`parseTranscriptSince`) instead of the existing full-file `parseSessionTranscript`, so each row carries only its own segment's delta. Two new hooks (`UserPromptSubmit`, `Stop`) populate the checkpoint's `queries[]` when a project opts into `verbose` mode. All existing cross-row aggregation (`computeTotals`, `aggregateByTag`, the website) becomes correct automatically once each row is correct at the source — with one direct fix needed (session count must exclude continuation rows).

**Tech Stack:** TypeScript, esbuild (via `scripts/build-hooks.js`), Vitest.

Spec: `docs/specs/2026-08-10-compaction-and-query-tracking-design.md`

---

### Task 1: Confirm live hook field names (`PreCompact`, `UserPromptSubmit`, `Stop`)

The spec (§3) explicitly requires this before writing any typed parsing — search sources disagreed on field names, and one is inaccurate for certain. This task needs the human user to trigger real events; it cannot be completed by a subagent alone.

**Files:**
- Create (temporary): `src/hooks/debug-log.ts`
- Modify (temporary): `hooks/hooks.json`

- [ ] **Step 1: Write a temporary debug hook that dumps stdin to a file**

```ts
// src/hooks/debug-log.ts
// ABOUTME: TEMPORARY — logs raw hook stdin JSON to a file for field-name verification. Delete after Task 1.
import { stdin } from 'process';
import fs from 'fs';
import path from 'path';
import os from 'os';

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', () => {
  const logPath = path.join(os.homedir(), 'sessionstats-hook-debug.log');
  const eventName = process.argv[2] || 'unknown';
  fs.appendFileSync(logPath, `\n--- ${eventName} @ ${new Date().toISOString()} ---\n${inputData}\n`);
  console.log('{"continue": true, "suppressOutput": true}');
});
```

- [ ] **Step 2: Temporarily add it to `scripts/build-hooks.js`'s `HOOKS` array and build**

The project has no `ts-node`/`tsx` — everything goes through the existing `esbuild`-based `scripts/build-hooks.js` pipeline, so reuse it rather than adding a new dependency. Add to `HOOKS`:

```js
{ name: 'debug-log', source: 'src/hooks/debug-log.ts' }
```

```bash
npm run build
```
Expected: `plugin/scripts/debug-log.js` is created.

- [ ] **Step 3: Temporarily register it for `PreCompact`, `UserPromptSubmit`, and `Stop` in `hooks/hooks.json`**

Add (alongside the existing `SessionStart`/`SessionEnd` entries — don't remove those), then re-run `npm run build` so `plugin/hooks.json` picks up the change:

```json
"PreCompact": [
  { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/debug-log.js\" PreCompact", "timeout": 10 }] }
],
"UserPromptSubmit": [
  { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/debug-log.js\" UserPromptSubmit", "timeout": 10 }] }
],
"Stop": [
  { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/debug-log.js\" Stop", "timeout": 10 }] }
]
```

```bash
npm run build
```

- [ ] **Step 4: Ask the user to reload the plugin, send a couple of messages, and manually trigger `/compact`**

Tell the user: "I need you to send 2-3 messages in a fresh Claude Code session in a project with this plugin installed, then run `/compact` manually. After that, let me know so I can check the log."

- [ ] **Step 5: Read `~/sessionstats-hook-debug.log` and extract the confirmed field names**

```bash
cat ~/sessionstats-hook-debug.log
```

Record: the exact `UserPromptSubmit` prompt-text field name (`prompt` vs `user_prompt` vs something else), whether `Stop` includes `session_id` and `transcript_path`, and the exact `PreCompact` payload shape (confirming `trigger`, `custom_instructions`).

- [ ] **Step 6: Revert the temporary changes**

```bash
git checkout hooks/hooks.json scripts/build-hooks.js
rm src/hooks/debug-log.ts plugin/scripts/debug-log.js ~/sessionstats-hook-debug.log
npm run build
```

- [ ] **Step 7: Record the confirmed field names as a comment at the top of this plan file**, e.g.:

```markdown
<!-- Task 1 findings (fill in before continuing):
UserPromptSubmit prompt field: ???
Stop has session_id: yes/no
Stop has transcript_path: yes/no
PreCompact fields confirmed: session_id, transcript_path, hook_event_name, trigger, custom_instructions
-->
```

Do not proceed to Task 2 until this is filled in — Task 2's code uses these exact names.

---

### Task 2: Extend shared types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `QueryRow`, extend `SessionRow`, `ProjectConfig`, and `HookInput`**

```ts
// Add near ModelUsage:
export interface QueryRow {
  timestamp: string;       // UserPromptSubmit time
  duration: string;        // time from UserPromptSubmit to Stop
  models: ModelUsage[];    // includes any subagents spawned during this turn
  toolCalls: number | null;
  subagentCount: number | null;
}

// SessionRow: add one field after machineId
export interface SessionRow {
  // ...existing fields...
  machineId: string | null;
  queries?: QueryRow[];
}

// ProjectConfig: add one field after postToWeb
export interface ProjectConfig {
  // ...existing fields...
  postToWeb: boolean;
  verbose: boolean;
  needsSetupConfirmation?: boolean;
}

// HookInput: extend the union and add optional fields
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart' | 'SessionEnd' | 'PreCompact' | 'UserPromptSubmit' | 'Stop';
  source?: 'startup' | 'clear' | 'compact' | 'resume';
  reason?: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
  trigger?: 'manual' | 'auto';
  custom_instructions?: string;
  // NOTE: replace `prompt` below with whatever Task 1 confirmed if different
  prompt?: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: fails on `ProjectConfig` object literals missing `verbose` (in `project-config.ts` and test fixtures) — that's expected, fixed in Task 8. No other errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend types for QueryRow, verbose config, and new hook events"
```

---

### Task 3: Extract shared transcript-path helper

**Files:**
- Create: `src/lib/transcript-path.ts`
- Modify: `src/scripts/extract-prompts.ts`
- Test: `tests/unit/transcript-path.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/transcript-path.test.ts
import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { getProjectTranscriptDir, getSessionTranscriptPath } from '../../src/lib/transcript-path.js';

describe('transcript-path', () => {
  it('encodes / and . as - under ~/.claude/projects', () => {
    const dir = getProjectTranscriptDir('/Users/keith/Projects/my.app');
    expect(dir).toBe(path.join(os.homedir(), '.claude', 'projects', '-Users-keith-Projects-my-app'));
  });

  it('appends <sessionId>.jsonl for a session transcript path', () => {
    const p = getSessionTranscriptPath('/Users/keith/Projects/foo', 'abc-123');
    expect(p).toBe(path.join(os.homedir(), '.claude', 'projects', '-Users-keith-Projects-foo', 'abc-123.jsonl'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/transcript-path.test.ts
```
Expected: FAIL — module `../../src/lib/transcript-path.js` not found.

- [ ] **Step 3: Create the shared helper**

```ts
// src/lib/transcript-path.ts
// ABOUTME: Derives a project's Claude Code transcript directory/file from its filesystem path
// ABOUTME: Claude Code encodes project paths by replacing / and . with -

import path from 'path';
import os from 'os';

export function getProjectTranscriptDir(projectDir: string): string {
  const encoded = projectDir.replace(/[/.]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

export function getSessionTranscriptPath(projectDir: string, sessionId: string): string {
  return path.join(getProjectTranscriptDir(projectDir), `${sessionId}.jsonl`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/transcript-path.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Update `extract-prompts.ts` to use the shared helper**

In `src/scripts/extract-prompts.ts`, delete the local `getProjectTranscriptDir` function (lines 9-13) and its `path`/`os` imports if no longer used directly, then add:

```ts
import { getProjectTranscriptDir } from '../lib/transcript-path.js';
```

- [ ] **Step 6: Run the full suite to confirm nothing broke**

```bash
npx vitest run
```
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/transcript-path.ts src/scripts/extract-prompts.ts tests/unit/transcript-path.test.ts
git commit -m "refactor: extract shared transcript-path helper from extract-prompts.ts"
```

---

### Task 4: Incremental transcript parsing (`parseTranscriptSince`)

**Files:**
- Modify: `src/lib/token-engine.ts`
- Test: `tests/unit/token-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/token-engine.test.ts`:

```ts
import { parseTranscript, parseSessionTranscript, parseTranscriptSince } from '../../src/lib/token-engine.js';

describe('parseTranscriptSince', () => {
  it('only counts content after byteOffset, not the whole file', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-incr-'));
    const transcriptPath = path.join(testDir, 'sess.jsonl');

    const line = (input: number) => JSON.stringify({
      type: 'assistant', timestamp: '2026-01-01T00:00:00Z',
      message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: input, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [] },
    });

    fs.writeFileSync(transcriptPath, line(1000) + '\n');
    const firstOffset = fs.statSync(transcriptPath).size;
    fs.appendFileSync(transcriptPath, line(500) + '\n');

    const result = parseTranscriptSince(transcriptPath, firstOffset, []);

    expect(result.stats.models[0].input).toBe(500);
    expect(result.newByteOffset).toBe(fs.statSync(transcriptPath).size);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('does not advance past an incomplete trailing line', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-partial-'));
    const transcriptPath = path.join(testDir, 'sess.jsonl');

    fs.writeFileSync(transcriptPath, '{"type":"user"}\n{"type":"user","incompl');

    const result = parseTranscriptSince(transcriptPath, 0, []);

    expect(result.stats.userMessages).toBe(1);
    expect(result.newByteOffset).toBe('{"type":"user"}\n'.length);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('only re-parses subagent files not already in processedSubagents', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-incr-sub-'));
    const sessionId = 'sess1';
    const transcriptPath = path.join(testDir, `${sessionId}.jsonl`);
    const subagentDir = path.join(testDir, sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });

    const line = (input: number) => JSON.stringify({
      type: 'assistant', timestamp: '2026-01-01T00:00:00Z',
      message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: input, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [] },
    });

    fs.writeFileSync(transcriptPath, '');
    fs.writeFileSync(path.join(subagentDir, 'agent-1.jsonl'), line(100) + '\n');
    fs.writeFileSync(path.join(subagentDir, 'agent-2.jsonl'), line(200) + '\n');

    const result = parseTranscriptSince(transcriptPath, 0, ['agent-1.jsonl']);

    expect(result.stats.subagentCount).toBe(1);
    expect(result.stats.models[0].input).toBe(200);
    expect(result.newProcessedSubagents.sort()).toEqual(['agent-1.jsonl', 'agent-2.jsonl']);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/token-engine.test.ts
```
Expected: FAIL — `parseTranscriptSince` is not exported.

- [ ] **Step 3: Extract shared per-line parsing and add `parseTranscriptSince`**

`token-engine.ts` already has an unexported `mergeStats(a: TranscriptStats, b: TranscriptStats): TranscriptStats` (used today by `parseSessionTranscript`'s subagent rollup, at line 94) — reuse it as-is, don't redefine it.

In `src/lib/token-engine.ts`, rename the body of the existing `parseTranscript` loop into a new unexported `parseLines(lines: string[]): TranscriptStats` function, and reimplement `parseTranscript` in terms of it:

```ts
function parseLines(lines: string[]): TranscriptStats {
  // move the existing parseTranscript loop body here verbatim, operating on `lines` instead of `content.split('\n')`
}

export function parseTranscript(content: string): TranscriptStats {
  return parseLines(content.split('\n'));
}
```

Then add:

```ts
export interface IncrementalTranscriptStats extends TranscriptStats {
  subagentCount: number;
}

export interface IncrementalParseResult {
  stats: IncrementalTranscriptStats;
  newByteOffset: number;
  newProcessedSubagents: string[];
}

export function parseTranscriptSince(
  transcriptPath: string,
  byteOffset: number,
  processedSubagents: string[]
): IncrementalParseResult {
  let mainStats: TranscriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0 };
  let newByteOffset = byteOffset;

  const size = fs.statSync(transcriptPath).size;
  if (size > byteOffset) {
    const fd = fs.openSync(transcriptPath, 'r');
    const length = size - byteOffset;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, byteOffset);
    fs.closeSync(fd);

    const lastNewline = buffer.lastIndexOf(0x0a); // '\n' — only count complete lines
    if (lastNewline >= 0) {
      const complete = buffer.subarray(0, lastNewline + 1).toString('utf-8');
      mainStats = parseLines(complete.split('\n'));
      newByteOffset = byteOffset + lastNewline + 1;
    }
  }

  const sessionId = path.basename(transcriptPath, '.jsonl');
  const subagentDir = path.join(path.dirname(transcriptPath), sessionId, 'subagents');
  const newProcessedSubagents = [...processedSubagents];
  let subagentDelta: TranscriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0 };
  let subagentCount = 0;

  if (fs.existsSync(subagentDir)) {
    for (const file of fs.readdirSync(subagentDir).filter(f => f.endsWith('.jsonl'))) {
      if (processedSubagents.includes(file)) continue;
      const content = fs.readFileSync(path.join(subagentDir, file), 'utf-8');
      subagentDelta = mergeStats(subagentDelta, parseTranscript(content));
      newProcessedSubagents.push(file);
      subagentCount++;
    }
  }

  const merged = mergeStats(mainStats, subagentDelta);
  return { stats: { ...merged, subagentCount }, newByteOffset, newProcessedSubagents };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/token-engine.test.ts
```
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/token-engine.ts tests/unit/token-engine.test.ts
git commit -m "feat: add parseTranscriptSince for incremental, non-overlapping transcript parsing"
```

---

### Task 5: Checkpoint file read/write/delete

**Files:**
- Create: `src/lib/transcript-checkpoint.ts`
- Test: `tests/unit/transcript-checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/transcript-checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readCheckpoint, writeCheckpoint, deleteCheckpoint } from '../../src/lib/transcript-checkpoint.js';

describe('transcript-checkpoint', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-checkpoint-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns a zeroed checkpoint when none exists', () => {
    const cp = readCheckpoint(projectDir, 'sess1');
    expect(cp).toEqual({ byteOffset: 0, processedSubagents: [], queries: [], turnStartedAt: null });
  });

  it('round-trips a written checkpoint', () => {
    writeCheckpoint(projectDir, 'sess1', { byteOffset: 42, processedSubagents: ['a.jsonl'], queries: [], turnStartedAt: '2026-01-01T00:00:00Z' });
    const cp = readCheckpoint(projectDir, 'sess1');
    expect(cp.byteOffset).toBe(42);
    expect(cp.processedSubagents).toEqual(['a.jsonl']);
    expect(cp.turnStartedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('deleteCheckpoint removes the file and is a no-op if already absent', () => {
    writeCheckpoint(projectDir, 'sess1', { byteOffset: 1, processedSubagents: [], queries: [], turnStartedAt: null });
    deleteCheckpoint(projectDir, 'sess1');
    expect(readCheckpoint(projectDir, 'sess1').byteOffset).toBe(0);
    expect(() => deleteCheckpoint(projectDir, 'sess1')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/transcript-checkpoint.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/transcript-checkpoint.ts
// ABOUTME: Reads/writes the per-session incremental-parse checkpoint at .sessionstats/.state/<sessionId>.json
// ABOUTME: Tracks byteOffset/processedSubagents (non-overlapping parsing) and queries/turnStartedAt (verbose mode)

import fs from 'fs';
import path from 'path';
import type { QueryRow } from '../types/index.js';

export interface Checkpoint {
  byteOffset: number;
  processedSubagents: string[];
  queries: QueryRow[];
  turnStartedAt: string | null;
}

function checkpointPath(projectDir: string, sessionId: string): string {
  return path.join(projectDir, '.sessionstats', '.state', `${sessionId}.json`);
}

export function readCheckpoint(projectDir: string, sessionId: string): Checkpoint {
  const p = checkpointPath(projectDir, sessionId);
  if (!fs.existsSync(p)) {
    return { byteOffset: 0, processedSubagents: [], queries: [], turnStartedAt: null };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function writeCheckpoint(projectDir: string, sessionId: string, checkpoint: Checkpoint): void {
  const p = checkpointPath(projectDir, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(checkpoint), 'utf-8');
}

export function deleteCheckpoint(projectDir: string, sessionId: string): void {
  const p = checkpointPath(projectDir, sessionId);
  if (fs.existsSync(p)) fs.rmSync(p);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/transcript-checkpoint.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcript-checkpoint.ts tests/unit/transcript-checkpoint.test.ts
git commit -m "feat: add per-session incremental-parse checkpoint file"
```

---

### Task 6: Fix session-count double-counting in `stats-parser.ts`

**Files:**
- Modify: `src/lib/stats-parser.ts`
- Test: `tests/unit/stats-file.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/stats-file.test.ts`:

```ts
it('does not count [Compacted]/[Manual Break] rows as separate sessions, but does sum their cost/tokens', () => {
  appendRow(statsPath, startRow);
  appendRow(statsPath, { ...endRow, flags: '[Compacted]', models: [{ model: 'claude-sonnet-4-5-20250929', input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 1.00 }] });
  appendRow(statsPath, { ...endRow, flags: null, models: [{ model: 'claude-sonnet-4-5-20250929', input: 200, output: 100, cacheRead: 0, cacheWrite: 0, cost: 2.00 }] });

  const result = parseStatsFile(statsPath);
  expect(result.totals.sessions).toBe(1);
  expect(result.totals.totalCost).toBeCloseTo(3.00, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/stats-file.test.ts
```
Expected: FAIL — `sessions` is 2, not 1.

- [ ] **Step 3: Fix `computeTotals`**

In `src/lib/stats-parser.ts`, replace:

```ts
function computeTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');
```

with:

```ts
const CONTINUATION_FLAGS = ['[Compacted]', '[Manual Break]'];

function computeTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');
  const trueEndRows = endRows.filter(r => !CONTINUATION_FLAGS.includes(r.flags ?? ''));
```

And change `sessions: endRows.length` to `sessions: trueEndRows.length` in the return statement (leave the duration/cost/token loop iterating over `endRows`, unchanged — those must keep summing every END row).

- [ ] **Step 4: Export `CONTINUATION_FLAGS`** (Task 7 needs the identical list)

Change `const CONTINUATION_FLAGS` to `export const CONTINUATION_FLAGS`.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/stats-file.test.ts
```
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats-parser.ts tests/unit/stats-file.test.ts
git commit -m "fix: exclude [Compacted]/[Manual Break] rows from session count"
```

---

### Task 7: Fix the identical session-count bug in `report.ts`

**Files:**
- Modify: `src/scripts/report.ts`
- Test: `tests/unit/report.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/report.test.ts`:

```ts
it('does not count [Compacted]/[Manual Break] rows as separate sessions', () => {
  const dir = path.join(root, 'proj-compact');
  fs.mkdirSync(path.join(dir, '.sessionstats'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.sessionstats', 'config.json'), JSON.stringify({
    schemaVersion: 1, projectName: 'proj-compact', tags: ['team-infra'], userEmail: null, postToWeb: false,
  }));
  fs.writeFileSync(path.join(dir, '.sessionstats', 'session_stats.json'), JSON.stringify({
    schemaVersion: 1,
    rows: [
      { sessionId: 's1', project: 'proj-compact', event: 'END', timestamp: '2026-01-01T00:00:00Z', duration: '00:05:00', models: [], apiMessages: 1, userMessages: 1, toolCalls: 0, subagentCount: 0, cacheHitRate: 0, flags: '[Compacted]', machineId: 'u@h' },
      { sessionId: 's1', project: 'proj-compact', event: 'END', timestamp: '2026-01-01T00:10:00Z', duration: '00:05:00', models: [], apiMessages: 1, userMessages: 1, toolCalls: 0, subagentCount: 0, cacheHitRate: 0, flags: null, machineId: 'u@h' },
    ],
  }));

  const result = aggregateByTag([root], 'team-infra');
  expect(result.projects[0].sessions).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/report.test.ts
```
Expected: FAIL — `sessions` is 2, not 1.

- [ ] **Step 3: Fix `aggregateByTag`**

In `src/scripts/report.ts`, import the shared list and apply it:

```ts
import { parseStatsFile, rowCost, rowTokens, CONTINUATION_FLAGS } from '../lib/stats-parser.js';
```

Change:

```ts
sessions: endRows.length,
```

to:

```ts
sessions: endRows.filter(r => !CONTINUATION_FLAGS.includes(r.flags ?? '')).length,
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/report.test.ts
```
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/scripts/report.ts tests/unit/report.test.ts
git commit -m "fix: exclude [Compacted]/[Manual Break] rows from session count in aggregateByTag"
```

---

### Task 8: `verbose` config field

**Files:**
- Modify: `src/lib/project-config.ts`
- Test: `tests/unit/project-config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/project-config.test.ts`:

```ts
it('defaults verbose to false for new configs', () => {
  const config = loadOrCreateProjectConfig(projectDir);
  expect(config.verbose).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/project-config.test.ts
```
Expected: FAIL — `config.verbose` is `undefined`.

- [ ] **Step 3: Add the default**

In `src/lib/project-config.ts`, in `loadOrCreateProjectConfig`'s new-config object literal, add `verbose: false,` after `postToWeb: false,`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/project-config.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck the whole project** (this should now be clean — Task 2 flagged this as expected-to-fail until now)

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/project-config.ts tests/unit/project-config.test.ts
git commit -m "feat: add verbose config field, defaulting to false"
```

---

### Task 9: Rewire `session-end.ts` onto incremental parsing

**Files:**
- Modify: `src/hooks/session-end.ts`

No new automated test — this hook has no existing unit test (it's a stdin-driven script, matching the existing pattern where hooks themselves aren't unit-tested, only the `lib/` functions they call are). Verified manually in Task 15.

- [ ] **Step 1: Replace the full-file parse with checkpoint-aware incremental parse**

Replace the transcript-parsing block in `src/hooks/session-end.ts` (currently calling `parseSessionTranscript(input.transcript_path)` directly) with:

```ts
import { readCheckpoint, deleteCheckpoint } from '../lib/transcript-checkpoint.js';
import { parseTranscriptSince } from '../lib/token-engine.js';
// remove the now-unused `parseSessionTranscript` import

// ...inside sessionEndHook, replacing the existing try/catch block. `config` is
// already in scope here — it's loaded at line 20 (`const config = loadOrCreateProjectConfig(input.cwd);`)
// for the existing postToWeb check further down; no new load needed:
  const checkpoint = readCheckpoint(input.cwd, input.session_id);
  let transcriptStats;
  try {
    const delta = parseTranscriptSince(input.transcript_path, checkpoint.byteOffset, checkpoint.processedSubagents);
    transcriptStats = delta.stats;
  } catch (error) {
    console.error('[sessionstats] Could not read transcript (this is OK):', error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }
```

- [ ] **Step 2: Attach `queries` when verbose, and delete the checkpoint (true end)**

In the `endRow` object literal, add `queries: config.verbose && checkpoint.queries.length > 0 ? checkpoint.queries : undefined,` after `machineId`.

After `appendRow(statsPath, endRow);`, add:

```ts
  deleteCheckpoint(input.cwd, input.session_id);
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/session-end.ts
git commit -m "fix: session-end.ts uses incremental delta parsing instead of full-file re-parse"
```

---

### Task 10: `precompact.ts` hook

**Files:**
- Create: `src/hooks/precompact.ts`
- Modify: `hooks/hooks.json`
- Modify: `scripts/build-hooks.js`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/precompact.ts
// ABOUTME: PreCompact hook — closes the current segment with a [Compacted] END row before compaction begins
// ABOUTME: Carries byteOffset/processedSubagents forward across the boundary; resets queries only

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { findStartRow } from '../lib/stats-parser.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { calculateDuration } from '../lib/formatters.js';
import { parseTranscriptSince } from '../lib/token-engine.js';
import { readCheckpoint, writeCheckpoint } from '../lib/transcript-checkpoint.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';
import { postSessionToWeb } from '../lib/web-post.js';

async function precompactHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(input.cwd);
  const now = new Date().toISOString();

  const startRow = findStartRow(statsPath, input.session_id);
  const config = loadOrCreateProjectConfig(input.cwd);
  const checkpoint = readCheckpoint(input.cwd, input.session_id);

  let transcriptStats;
  let newByteOffset = checkpoint.byteOffset;
  let newProcessedSubagents = checkpoint.processedSubagents;
  try {
    const delta = parseTranscriptSince(input.transcript_path, checkpoint.byteOffset, checkpoint.processedSubagents);
    transcriptStats = delta.stats;
    newByteOffset = delta.newByteOffset;
    newProcessedSubagents = delta.newProcessedSubagents;
  } catch (error) {
    console.error('[sessionstats] Could not read transcript (this is OK):', error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }

  const duration = startRow ? calculateDuration(startRow.timestamp, now) : null;

  const endRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'END',
    timestamp: now,
    duration,
    models: transcriptStats.models,
    apiMessages: transcriptStats.apiMessages,
    userMessages: transcriptStats.userMessages,
    toolCalls: transcriptStats.toolCalls,
    subagentCount: transcriptStats.subagentCount,
    cacheHitRate: transcriptStats.cacheHitRate,
    flags: '[Compacted]',
    machineId: getMachineId(),
    queries: config.verbose && checkpoint.queries.length > 0 ? checkpoint.queries : undefined,
  };

  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error('[sessionstats] Error recording compaction:', error);
  }

  if (config.postToWeb) {
    await postSessionToWeb(endRow, projectName, config.tags);
  }

  // Carry byteOffset/processedSubagents forward — the transcript keeps growing across compaction.
  // Reset queries — the next segment's queries are its own.
  writeCheckpoint(input.cwd, input.session_id, {
    byteOffset: newByteOffset,
    processedSubagents: newProcessedSubagents,
    queries: [],
    turnStartedAt: null,
  });

  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await precompactHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

- [ ] **Step 2: Register the build target**

In `scripts/build-hooks.js`, add to the `HOOKS` array:

```js
{ name: 'precompact', source: 'src/hooks/precompact.ts' }
```

- [ ] **Step 3: Register the hook event**

In `hooks/hooks.json`, add (as a new top-level key alongside `SessionStart`/`SessionEnd`):

```json
"PreCompact": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/precompact.js\"",
        "timeout": 60
      }
    ]
  }
]
```

- [ ] **Step 4: Build and typecheck**

```bash
npx tsc --noEmit
npm run build
```
Expected: `plugin/scripts/precompact.js` is created; no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/precompact.ts hooks/hooks.json scripts/build-hooks.js
git commit -m "feat: add PreCompact hook — record [Compacted] segment before compaction"
```

---

### Task 11: `/session_break` command + `session-break.ts`

**Files:**
- Create: `src/scripts/session-break.ts`
- Create: `commands/session_break.md`
- Modify: `scripts/build-hooks.js`

- [ ] **Step 1: Write the script**

```ts
// src/scripts/session-break.ts
// ABOUTME: CLI script backing /session_break — ends the current tracked segment with [Manual Break], starts a new one
// ABOUTME: Invoked with the real session_id (from $CLAUDE_CODE_SESSION_ID) as argv[2]; cwd is the current project dir

import path from 'path';
import type { SessionRow } from '../types/index.js';
import { findStartRow } from '../lib/stats-parser.js';
import { appendRow, getMachineId } from '../lib/stats-writer.js';
import { calculateDuration } from '../lib/formatters.js';
import { parseTranscriptSince } from '../lib/token-engine.js';
import { readCheckpoint, writeCheckpoint } from '../lib/transcript-checkpoint.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';
import { postSessionToWeb } from '../lib/web-post.js';
import { getSessionTranscriptPath } from '../lib/transcript-path.js';

async function sessionBreak(sessionId: string): Promise<void> {
  const cwd = process.cwd();
  const statsPath = path.join(cwd, '.sessionstats', 'session_stats.json');
  const projectName = path.basename(cwd);
  const now = new Date().toISOString();
  const transcriptPath = getSessionTranscriptPath(cwd, sessionId);

  const startRow = findStartRow(statsPath, sessionId);
  const config = loadOrCreateProjectConfig(cwd);
  const checkpoint = readCheckpoint(cwd, sessionId);

  let transcriptStats;
  let newByteOffset = checkpoint.byteOffset;
  let newProcessedSubagents = checkpoint.processedSubagents;
  try {
    const delta = parseTranscriptSince(transcriptPath, checkpoint.byteOffset, checkpoint.processedSubagents);
    transcriptStats = delta.stats;
    newByteOffset = delta.newByteOffset;
    newProcessedSubagents = delta.newProcessedSubagents;
  } catch (error) {
    console.error('[sessionstats] Could not read transcript (this is OK):', error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }

  const duration = startRow ? calculateDuration(startRow.timestamp, now) : null;

  const endRow: SessionRow = {
    sessionId, project: projectName, event: 'END', timestamp: now, duration,
    models: transcriptStats.models, apiMessages: transcriptStats.apiMessages,
    userMessages: transcriptStats.userMessages, toolCalls: transcriptStats.toolCalls,
    subagentCount: transcriptStats.subagentCount, cacheHitRate: transcriptStats.cacheHitRate,
    flags: '[Manual Break]', machineId: getMachineId(),
    queries: config.verbose && checkpoint.queries.length > 0 ? checkpoint.queries : undefined,
  };
  appendRow(statsPath, endRow);

  if (config.postToWeb) {
    await postSessionToWeb(endRow, projectName, config.tags);
  }

  writeCheckpoint(cwd, sessionId, { byteOffset: newByteOffset, processedSubagents: newProcessedSubagents, queries: [], turnStartedAt: null });

  const startRowNew: SessionRow = {
    sessionId, project: projectName, event: 'START', timestamp: now, duration: null,
    models: [], apiMessages: null, userMessages: null, toolCalls: null, subagentCount: null,
    cacheHitRate: null, flags: null, machineId: getMachineId(),
  };
  appendRow(statsPath, startRowNew);

  console.log(`[sessionstats] Session split: closed segment (${duration ?? 'unknown duration'}), started a new one.`);
}

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('[sessionstats] session-break.ts requires a session ID argument');
  process.exit(1);
}
sessionBreak(sessionId).catch((error) => {
  console.error('[sessionstats] session-break failed:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Write the command**

```markdown
---
description: End the current tracked session segment and start a new one, for isolating specific work
---

# Session Break

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/session-break.js" "$CLAUDE_CODE_SESSION_ID"
```

This closes out the tracked stats for everything up to now as its own entry (flagged `[Manual Break]`), and starts tracking a fresh entry from this point forward — useful when you want to isolate the cost/tokens for a specific piece of work from the rest of a long session. Report the script's output to the user.
```

Save to `commands/session_break.md`.

- [ ] **Step 3: Register the build target**

In `scripts/build-hooks.js`, add to `CLI_SCRIPTS`:

```js
{ name: 'session-break', source: 'src/scripts/session-break.ts' }
```

- [ ] **Step 4: Build and typecheck**

```bash
npx tsc --noEmit
npm run build
```
Expected: `plugin/scripts/session-break.js` created; `plugin/commands/session_break.md` copied; no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/session-break.ts commands/session_break.md scripts/build-hooks.js
git commit -m "feat: add /session_break command for manual session splitting"
```

---

### Task 12: `UserPromptSubmit` hook (verbose turn-start bookkeeping)

**Files:**
- Create: `src/hooks/user-prompt-submit.ts`
- Modify: `hooks/hooks.json`
- Modify: `scripts/build-hooks.js`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/user-prompt-submit.ts
// ABOUTME: UserPromptSubmit hook — records the turn's start time in the checkpoint, verbose projects only
// ABOUTME: No-ops immediately for non-verbose projects (no checkpoint write, no added cost)

import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput } from '../types/index.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';
import { readCheckpoint, writeCheckpoint } from '../lib/transcript-checkpoint.js';

async function userPromptSubmitHook(input: HookInput): Promise<void> {
  const config = loadOrCreateProjectConfig(input.cwd);

  if (config.verbose) {
    const checkpoint = readCheckpoint(input.cwd, input.session_id);
    writeCheckpoint(input.cwd, input.session_id, { ...checkpoint, turnStartedAt: new Date().toISOString() });
  }

  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await userPromptSubmitHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

- [ ] **Step 2: Register the build target**

In `scripts/build-hooks.js`, add to `HOOKS`:

```js
{ name: 'user-prompt-submit', source: 'src/hooks/user-prompt-submit.ts' }
```

- [ ] **Step 3: Register the hook event**

In `hooks/hooks.json`, add:

```json
"UserPromptSubmit": [
  {
    "hooks": [
      { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/user-prompt-submit.js\"", "timeout": 10 }
    ]
  }
]
```

- [ ] **Step 4: Build and typecheck**

```bash
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/user-prompt-submit.ts hooks/hooks.json scripts/build-hooks.js
git commit -m "feat: add UserPromptSubmit hook for verbose turn-start bookkeeping"
```

---

### Task 13: `Stop` hook (verbose per-query capture)

**Files:**
- Create: `src/hooks/stop.ts`
- Modify: `hooks/hooks.json`
- Modify: `scripts/build-hooks.js`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/stop.ts
// ABOUTME: Stop hook — for verbose projects, computes this turn's delta stats and appends a QueryRow to the checkpoint
// ABOUTME: No-ops immediately for non-verbose projects; byteOffset/processedSubagents are still advanced lazily at the next END-row site

import { stdin } from 'process';
import type { HookInput, HookOutput, QueryRow } from '../types/index.js';
import { loadOrCreateProjectConfig } from '../lib/project-config.js';
import { readCheckpoint, writeCheckpoint } from '../lib/transcript-checkpoint.js';
import { parseTranscriptSince } from '../lib/token-engine.js';
import { calculateDuration } from '../lib/formatters.js';

async function stopHook(input: HookInput): Promise<void> {
  const config = loadOrCreateProjectConfig(input.cwd);

  if (config.verbose) {
    const checkpoint = readCheckpoint(input.cwd, input.session_id);
    const now = new Date().toISOString();

    try {
      const delta = parseTranscriptSince(input.transcript_path, checkpoint.byteOffset, checkpoint.processedSubagents);
      const queryRow: QueryRow = {
        timestamp: checkpoint.turnStartedAt ?? now,
        duration: checkpoint.turnStartedAt ? calculateDuration(checkpoint.turnStartedAt, now) : '00:00:00',
        models: delta.stats.models,
        toolCalls: delta.stats.toolCalls,
        subagentCount: delta.stats.subagentCount,
      };
      writeCheckpoint(input.cwd, input.session_id, {
        byteOffset: delta.newByteOffset,
        processedSubagents: delta.newProcessedSubagents,
        queries: [...checkpoint.queries, queryRow],
        turnStartedAt: null,
      });
    } catch (error) {
      console.error('[sessionstats] Could not record query stats (this is OK):', error);
    }
  }

  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await stopHook(parsed);
  } catch (error) {
    console.error('[sessionstats] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

- [ ] **Step 2: Register the build target**

In `scripts/build-hooks.js`, add to `HOOKS`:

```js
{ name: 'stop', source: 'src/hooks/stop.ts' }
```

- [ ] **Step 3: Register the hook event**

In `hooks/hooks.json`, add:

```json
"Stop": [
  {
    "hooks": [
      { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/plugin/scripts/stop.js\"", "timeout": 30 }
    ]
  }
]
```

- [ ] **Step 4: Build and typecheck**

```bash
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/stop.ts hooks/hooks.json scripts/build-hooks.js
git commit -m "feat: add Stop hook for verbose per-query stats capture"
```

---

### Task 14: `/session_setup` — expose `verbose` toggle

**Files:**
- Modify: `commands/session_setup.md`

- [ ] **Step 1: Add the fifth field to the interactive flow**

In `commands/session_setup.md`, after the existing "4. **Post to web**" bullet, add:

```markdown
5. **Verbose per-query tracking** (`verbose`) — currently `true`/`false`; ask whether this project should track per-turn (query-level) stats in addition to per-session stats. Explain that this adds a small amount of overhead per message (an extra hook call each turn) and grows `.sessionstats/session_stats.json` faster, so it's best turned on only for projects where that level of detail is actually wanted.
```

And update the closing instruction (line 16 of `commands/session_setup.md`) from "After confirming all four, write the updated JSON back..." to "After confirming all five, write the updated JSON back...".

- [ ] **Step 2: Rebuild so the command copies through**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add commands/session_setup.md
git commit -m "feat: expose verbose toggle in /session_setup"
```

---

### Task 15: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```
Expected: all tests pass (existing + new from Tasks 3-8).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Full build**

```bash
npm run build
```
Expected: `plugin/scripts/` contains `precompact.js`, `user-prompt-submit.js`, `stop.js`, `session-break.js` alongside the existing hooks/scripts; `plugin/hooks.json` reflects the new `PreCompact`/`UserPromptSubmit`/`Stop` registrations; `plugin/commands/session_break.md` exists.

- [ ] **Step 4: Confirm no leftover debug artifacts from Task 1**

```bash
git status --short
ls ~/sessionstats-hook-debug.log 2>&1  # expect "No such file"
```

- [ ] **Step 5: Manual smoke test** (requires the user)

Ask the user to: reload the plugin, turn on `verbose` for a test project via `/session_setup`, have a short conversation, run `/session_break` mid-conversation, trigger `/compact`, then end the session and inspect `.sessionstats/session_stats.json` — confirm there's a `[Manual Break]` row, a `[Compacted]` row, a final row, `queries[]` populated on each, and that summing all rows' `models[]` costs roughly matches what Claude Code itself reports for the session (not inflated).

- [ ] **Step 6: Final commit** (only if smoke test turns up fixes)

```bash
git add -A
git commit -m "fix: address issues found in manual smoke test"
```

---

## Out of scope (unchanged from spec)

- Migrating existing `.sessionstats/session_stats.json` files.
- Any `/session_stats`, `/sessionstats_report`, or website UI changes beyond the session-count fix.
- Blocking compaction from `PreCompact`.
- Breaking a subagent's transcript down turn-by-turn.
- Building session/query-level grouping UI on the website.
