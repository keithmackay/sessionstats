# cc-session-track Implementation Plan

## Project Overview

**cc-session-track** is a Claude Code marketplace plugin that automatically tracks session statistics. It hooks into Claude Code's lifecycle events to record when sessions start and end, capturing metrics like duration, cost, and token usage.

### What This Plugin Does

1. **On session start**: Records project name, timestamp, session ID, and model
2. **On session end**: Records end time, calculates duration, fetches cost/tokens from ccusage
3. **Orphan detection**: Detects sessions that crashed without proper end, marks them `[Abnormal End]`
4. **Visual reporting**: `/session_stats` command shows formatted statistics

### Key Technologies

- **TypeScript** - Source language, compiled to JavaScript
- **esbuild** - Bundler for compiling TypeScript hooks
- **ccusage** - npm package for reading Claude Code usage metrics
- **vitest** - Test runner for TDD
- **Claude Code Hooks** - Lifecycle event system (SessionStart, SessionEnd)

---

## Architecture

```
cc-session-track/
├── .claude-plugin/
│   └── plugin.json              # Marketplace metadata
├── hooks/
│   └── hooks.json               # Hook lifecycle configuration
├── plugin/
│   ├── scripts/
│   │   ├── session-start.js     # Compiled SessionStart hook
│   │   └── session-end.js       # Compiled SessionEnd hook
│   └── package.json             # Runtime dependencies
├── src/
│   ├── hooks/
│   │   ├── session-start.ts     # SessionStart hook source
│   │   └── session-end.ts       # SessionEnd hook source
│   ├── lib/
│   │   ├── stats-file.ts        # Read/write session_stats.md
│   │   ├── orphan-detector.ts   # Detect and close orphaned sessions
│   │   └── formatters.ts        # Duration calculation, terminal/markdown output
│   └── types/
│       └── index.ts             # TypeScript type definitions
├── commands/
│   └── session_stats.md         # Slash command definition
├── tests/
│   └── unit/
│       ├── stats-file.test.ts
│       ├── orphan-detector.test.ts
│       └── formatters.test.ts
├── scripts/
│   └── build-hooks.js           # esbuild build script
├── package.json
├── tsconfig.json
└── README.md
```

### How Hooks Work

Claude Code hooks receive JSON input via **stdin** and output JSON via **stdout**.

**SessionStart input:**
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../uuid.jsonl",
  "cwd": "/Users/you/Projects/my-project",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

**SessionEnd input:**
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../uuid.jsonl",
  "cwd": "/Users/you/Projects/my-project",
  "hook_event_name": "SessionEnd",
  "reason": "exit"
}
```

**Hook output (success):**
```json
{"continue": true, "suppressOutput": true}
```

---

## Phase 1: Project Foundation

**Goal**: Set up project structure, dependencies, and configuration files.

### Task 1.1: Create package.json

**File**: `/package.json`

```json
{
  "name": "cc-session-track",
  "version": "0.1.0",
  "description": "Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)",
  "type": "module",
  "scripts": {
    "build": "node scripts/build-hooks.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ccusage": "^17.2.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.3.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**How to test**: Run `npm install` - should complete without errors.

### Task 1.2: Create tsconfig.json

**File**: `/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Task 1.3: Create plugin.json

**File**: `/.claude-plugin/plugin.json`

```json
{
  "name": "cc-session-track",
  "version": "0.1.0",
  "description": "Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)",
  "author": {
    "name": "Keith MacKay"
  },
  "repository": "https://github.com/keithmackay/cc-session-track",
  "license": "MIT",
  "keywords": ["session", "statistics", "tracking", "usage", "cost", "tokens"]
}
```

### Task 1.4: Create hooks.json

**File**: `/hooks/hooks.json`

```json
{
  "description": "Session tracking hooks for cc-session-track",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact|resume",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start.js\"",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-end.js\"",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Important**: `${CLAUDE_PLUGIN_ROOT}` is replaced at runtime with the plugin's install directory.

### Task 1.5: Create type definitions

**File**: `/src/types/index.ts`

```typescript
/**
 * Input received by hooks from Claude Code via stdin
 */
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'SessionStart' | 'SessionEnd';
  source?: 'startup' | 'clear' | 'compact' | 'resume';
  reason?: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

/**
 * Output returned by hooks to Claude Code via stdout
 */
export interface HookOutput {
  continue: boolean;
  suppressOutput: boolean;
}

/**
 * A single row in session_stats.md (either START or END event)
 */
export interface SessionRow {
  sessionId: string;
  project: string;
  event: 'START' | 'END';
  timestamp: string;        // ISO 8601 format
  model: string | null;
  duration: string | null;  // "HH:MM:SS" format, only for END
  claudeTime: string | null;
  cost: number | null;
  tokens: number | null;
  flags: string | null;     // e.g., "[Abnormal End]"
}

/**
 * Aggregated totals stored in the header of session_stats.md
 */
export interface StatsFileTotals {
  sessions: number;
  totalDuration: string;    // "HH:MM:SS"
  totalClaudeTime: string;  // "HH:MM:SS"
  totalCost: number;
  totalTokens: number;
}

/**
 * Parsed representation of session_stats.md
 */
export interface StatsFile {
  totals: StatsFileTotals;
  rows: SessionRow[];
}
```

**How to test**: Run `npx tsc --noEmit` - should pass with no errors.

---

## Phase 2: Stats File Operations (TDD)

**Goal**: Implement reading/writing of session_stats.md with test-first development.

### session_stats.md Format

```
Sessions: 15 | Duration: 08:30:00 | Claude: 01:15:00 | Cost: $45.50 | Tokens: 450,000
session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags
abc123,my-project,START,2025-01-01T10:00:00Z,claude-opus-4-5-20251101,,,,,
abc123,my-project,END,2025-01-01T10:30:00Z,claude-opus-4-5-20251101,00:30:00,00:05:00,2.50,25000,
def456,other-proj,START,2025-01-01T11:00:00Z,claude-sonnet-4-5-20250929,,,,,
def456,other-proj,END,2025-01-01T11:45:00Z,claude-sonnet-4-5-20250929,00:45:00,,3.10,31000,[Abnormal End]
```

### Task 2.1: Write stats-file tests FIRST

**File**: `/tests/unit/stats-file.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStatsFile, writeStatsFile, appendRow } from '../../src/lib/stats-file.js';
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
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sessionId).toBe('abc123');
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
      expect(content).toContain('abc123');
      expect(content).toContain('session_id,project,event');
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
    });
  });
});
```

**Run test**: `npm test -- tests/unit/stats-file.test.ts` - should FAIL (implementation doesn't exist)

### Task 2.2: Implement stats-file.ts

**File**: `/src/lib/stats-file.ts`

```typescript
import fs from 'fs';
import path from 'path';
import type { StatsFile, StatsFileTotals, SessionRow } from '../types/index.js';

const CSV_HEADER = 'session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags';

/**
 * Parse session_stats.md file into structured data
 */
export function parseStatsFile(filePath: string): StatsFile {
  if (!fs.existsSync(filePath)) {
    return {
      totals: createEmptyTotals(),
      rows: []
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  const totals = parseTotalsLine(lines[0] || '');

  const rows: SessionRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim()) {
      const row = parseCSVRow(lines[i]);
      if (row) rows.push(row);
    }
  }

  return { totals, rows };
}

/**
 * Write structured data to session_stats.md
 */
export function writeStatsFile(filePath: string, stats: StatsFile): void {
  const totalsLine = formatTotalsLine(stats.totals);
  const csvLines = stats.rows.map(formatCSVRow);
  const content = [totalsLine, CSV_HEADER, ...csvLines].join('\n') + '\n';

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Append a row to session_stats.md and recalculate totals if END row
 */
export function appendRow(filePath: string, row: SessionRow): void {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);

  if (row.event === 'END') {
    stats.totals = recalculateTotals(stats.rows);
  }

  writeStatsFile(filePath, stats);
}

/**
 * Find the most recent START row for a given session ID
 */
export function findStartRow(filePath: string, sessionId: string): SessionRow | null {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter(r =>
    r.sessionId === sessionId && r.event === 'START'
  );
  return startRows[startRows.length - 1] || null;
}

// --- Helper Functions ---

function createEmptyTotals(): StatsFileTotals {
  return {
    sessions: 0,
    totalDuration: '00:00:00',
    totalClaudeTime: '00:00:00',
    totalCost: 0,
    totalTokens: 0
  };
}

function parseTotalsLine(line: string): StatsFileTotals {
  const defaults = createEmptyTotals();
  if (!line || !line.includes('Sessions:')) return defaults;

  const sessionsMatch = line.match(/Sessions:\s*(\d+)/);
  const durationMatch = line.match(/Duration:\s*([\d:]+)/);
  const claudeMatch = line.match(/Claude:\s*([\d:]+)/);
  const costMatch = line.match(/Cost:\s*\$?([\d.]+)/);
  const tokensMatch = line.match(/Tokens:\s*([\d,]+)/);

  return {
    sessions: sessionsMatch ? parseInt(sessionsMatch[1], 10) : 0,
    totalDuration: durationMatch ? durationMatch[1] : '00:00:00',
    totalClaudeTime: claudeMatch ? claudeMatch[1] : '00:00:00',
    totalCost: costMatch ? parseFloat(costMatch[1]) : 0,
    totalTokens: tokensMatch ? parseInt(tokensMatch[1].replace(/,/g, ''), 10) : 0
  };
}

function formatTotalsLine(totals: StatsFileTotals): string {
  return `Sessions: ${totals.sessions} | Duration: ${totals.totalDuration} | Claude: ${totals.totalClaudeTime} | Cost: $${totals.totalCost.toFixed(2)} | Tokens: ${totals.totalTokens.toLocaleString()}`;
}

function parseCSVRow(line: string): SessionRow | null {
  const parts = line.split(',');
  if (parts.length < 10) return null;

  return {
    sessionId: parts[0],
    project: parts[1],
    event: parts[2] as 'START' | 'END',
    timestamp: parts[3],
    model: parts[4] || null,
    duration: parts[5] || null,
    claudeTime: parts[6] || null,
    cost: parts[7] ? parseFloat(parts[7]) : null,
    tokens: parts[8] ? parseInt(parts[8], 10) : null,
    flags: parts[9] || null
  };
}

function formatCSVRow(row: SessionRow): string {
  return [
    row.sessionId,
    row.project,
    row.event,
    row.timestamp,
    row.model || '',
    row.duration || '',
    row.claudeTime || '',
    row.cost !== null ? row.cost.toFixed(2) : '',
    row.tokens !== null ? row.tokens.toString() : '',
    row.flags || ''
  ].join(',');
}

function recalculateTotals(rows: SessionRow[]): StatsFileTotals {
  const endRows = rows.filter(r => r.event === 'END');

  let totalDurationMs = 0;
  let totalClaudeMs = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    if (row.claudeTime) totalClaudeMs += parseTimeToMs(row.claudeTime);
    if (row.cost !== null) totalCost += row.cost;
    if (row.tokens !== null) totalTokens += row.tokens;
  }

  return {
    sessions: endRows.length,
    totalDuration: formatMsToTime(totalDurationMs),
    totalClaudeTime: formatMsToTime(totalClaudeMs),
    totalCost,
    totalTokens
  };
}

function parseTimeToMs(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
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

**Run test**: `npm test -- tests/unit/stats-file.test.ts` - should PASS

### Task 2.3: Write orphan-detector tests FIRST

**File**: `/tests/unit/orphan-detector.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectAndCloseOrphans } from '../../src/lib/orphan-detector.js';
import { appendRow, parseStatsFile } from '../../src/lib/stats-file.js';

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

  it('returns empty array when no orphans exist', () => {
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
      model: 'claude-opus-4',
      duration: null,
      claudeTime: null,
      cost: null,
      tokens: null,
      flags: null
    });

    const orphans = detectAndCloseOrphans(statsPath);

    expect(orphans).toHaveLength(1);
    expect(orphans[0].sessionId).toBe('orphan123');
    expect(orphans[0].flags).toBe('[Abnormal End]');

    // Verify END row was added
    const stats = parseStatsFile(statsPath);
    const endRows = stats.rows.filter(r => r.event === 'END');
    expect(endRows).toHaveLength(1);
  });

  it('does not close sessions that already have END', () => {
    appendRow(statsPath, {
      sessionId: 'normal123',
      project: 'test',
      event: 'START',
      timestamp: '2025-01-01T10:00:00Z',
      model: 'claude-opus-4',
      duration: null, claudeTime: null, cost: null, tokens: null, flags: null
    });
    appendRow(statsPath, {
      sessionId: 'normal123',
      project: 'test',
      event: 'END',
      timestamp: '2025-01-01T10:30:00Z',
      model: 'claude-opus-4',
      duration: '00:30:00', claudeTime: null, cost: 2.50, tokens: 25000, flags: null
    });

    const orphans = detectAndCloseOrphans(statsPath);
    expect(orphans).toHaveLength(0);
  });
});
```

### Task 2.4: Implement orphan-detector.ts

**File**: `/src/lib/orphan-detector.ts`

```typescript
import { parseStatsFile, appendRow } from './stats-file.js';
import type { SessionRow } from '../types/index.js';

/**
 * Detect orphaned sessions (START without END) and close them with [Abnormal End]
 * Returns array of sessions that were closed
 */
export function detectAndCloseOrphans(filePath: string): SessionRow[] {
  const stats = parseStatsFile(filePath);
  const closedOrphans: SessionRow[] = [];

  // Group by sessionId
  const sessionIds = new Set(stats.rows.map(r => r.sessionId));

  for (const sessionId of sessionIds) {
    const sessionRows = stats.rows.filter(r => r.sessionId === sessionId);
    const hasStart = sessionRows.some(r => r.event === 'START');
    const hasEnd = sessionRows.some(r => r.event === 'END');

    if (hasStart && !hasEnd) {
      // Found orphan - get the START row to extract details
      const startRow = sessionRows.find(r => r.event === 'START')!;

      const endRow: SessionRow = {
        sessionId,
        project: startRow.project,
        event: 'END',
        timestamp: new Date().toISOString(),
        model: startRow.model,
        duration: calculateDuration(startRow.timestamp, new Date().toISOString()),
        claudeTime: null,
        cost: null,
        tokens: null,
        flags: '[Abnormal End]'
      };

      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }

  return closedOrphans;
}

/**
 * Calculate duration between two ISO timestamps
 */
function calculateDuration(startISO: string, endISO: string): string {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
```

### Task 2.5: Implement formatters.ts

**File**: `/src/lib/formatters.ts`

```typescript
import type { StatsFile } from '../types/index.js';

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

/**
 * Format stats for color-coded terminal output
 */
export function formatTerminalOutput(stats: StatsFile, projectName: string): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${COLORS.cyan}╭${'─'.repeat(60)}╮${COLORS.reset}`);
  lines.push(`${COLORS.cyan}│${COLORS.reset}  ${COLORS.bold}SESSION STATISTICS: ${projectName}${COLORS.reset}`.padEnd(71) + `${COLORS.cyan}│${COLORS.reset}`);
  lines.push(`${COLORS.cyan}╰${'─'.repeat(60)}╯${COLORS.reset}`);
  lines.push('');

  // Totals section
  lines.push(`  ${COLORS.bold}TOTALS${COLORS.reset}`);
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Sessions:     ${COLORS.green}${stats.totals.sessions}${COLORS.reset}`);
  lines.push(`  Total Time:   ${COLORS.green}${stats.totals.totalDuration}${COLORS.reset}`);
  lines.push(`  Claude Time:  ${COLORS.green}${stats.totals.totalClaudeTime}${COLORS.reset}`);
  lines.push(`  Total Cost:   ${COLORS.green}$${stats.totals.totalCost.toFixed(2)}${COLORS.reset}`);
  lines.push(`  Total Tokens: ${COLORS.green}${stats.totals.totalTokens.toLocaleString()}${COLORS.reset}`);
  lines.push('');

  // Recent sessions
  const endRows = stats.rows.filter(r => r.event === 'END').slice(-5).reverse();
  if (endRows.length > 0) {
    lines.push(`  ${COLORS.bold}RECENT SESSIONS (last ${endRows.length})${COLORS.reset}`);
    lines.push(`  ${'─'.repeat(40)}`);
    for (const row of endRows) {
      const date = new Date(row.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const flag = row.flags ? ` ${COLORS.yellow}${row.flags}${COLORS.reset}` : '';
      lines.push(`  ${date.padEnd(18)} ${(row.duration || 'N/A').padEnd(10)} ${COLORS.green}$${(row.cost || 0).toFixed(2)}${COLORS.reset}${flag}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format stats as markdown tables
 */
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
  lines.push(`| Claude Time | ${stats.totals.totalClaudeTime} |`);
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
      lines.push(`| ${date} | ${row.duration || 'N/A'} | $${(row.cost || 0).toFixed(2)} | ${(row.tokens || 0).toLocaleString()} | ${row.model || 'N/A'} | ${row.flags || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Calculate duration between two ISO timestamps and return formatted string
 */
export function calculateDuration(startISO: string, endISO: string): string {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
```

---

## Phase 3: Hook Implementations (TDD)

**Goal**: Implement SessionStart and SessionEnd hooks.

### Task 3.1: Implement SessionStart hook

**File**: `/src/hooks/session-start.ts`

```typescript
import { stdin } from 'process';
import path from 'path';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow } from '../lib/stats-file.js';
import { detectAndCloseOrphans } from '../lib/orphan-detector.js';

async function sessionStartHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, 'session_stats.md');
  const projectName = path.basename(input.cwd);

  // Detect and close any orphaned sessions first
  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[cc-session-track] Closed ${closedOrphans.length} orphaned session(s)`);
    }
  } catch (error) {
    console.error('[cc-session-track] Error detecting orphans:', error);
  }

  // Record new session start
  const startRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'START',
    timestamp: new Date().toISOString(),
    model: null, // Will be captured on END
    duration: null,
    claudeTime: null,
    cost: null,
    tokens: null,
    flags: null
  };

  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error('[cc-session-track] Error recording session start:', error);
  }

  // Output success response
  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

// Entry point - read JSON from stdin
let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionStartHook(parsed);
  } catch (error) {
    console.error('[cc-session-track] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

### Task 3.2: Implement SessionEnd hook

**File**: `/src/hooks/session-end.ts`

```typescript
import { stdin } from 'process';
import path from 'path';
import { execSync } from 'child_process';
import type { HookInput, HookOutput, SessionRow } from '../types/index.js';
import { appendRow, findStartRow, parseStatsFile } from '../lib/stats-file.js';
import { calculateDuration } from '../lib/formatters.js';

interface CcusageSession {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  modelsUsed: string[];
}

/**
 * Get session metrics from ccusage CLI
 */
function getSessionMetrics(sessionId: string): CcusageSession | null {
  try {
    // Use ccusage CLI to get session data
    const output = execSync('npx ccusage@latest session --json', {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const data = JSON.parse(output);
    if (data && data.sessions) {
      // Find matching session (ccusage sessionId format may differ)
      const session = data.sessions.find((s: any) =>
        s.sessionId.includes(sessionId) || sessionId.includes(s.sessionId)
      );

      if (session) {
        return {
          sessionId: session.sessionId,
          totalCost: session.totalCost || 0,
          totalTokens: session.totalTokens || 0,
          modelsUsed: session.modelsUsed || []
        };
      }
    }
  } catch (error) {
    console.error('[cc-session-track] Could not get ccusage metrics:', error);
  }
  return null;
}

async function sessionEndHook(input: HookInput): Promise<void> {
  const statsPath = path.join(input.cwd, 'session_stats.md');
  const projectName = path.basename(input.cwd);
  const endTime = new Date().toISOString();

  // Find matching START row
  const startRow = findStartRow(statsPath, input.session_id);

  // Get metrics from ccusage
  const metrics = getSessionMetrics(input.session_id);

  // Calculate duration if we have a start time
  const duration = startRow
    ? calculateDuration(startRow.timestamp, endTime)
    : null;

  // Record END row
  const endRow: SessionRow = {
    sessionId: input.session_id,
    project: projectName,
    event: 'END',
    timestamp: endTime,
    model: metrics?.modelsUsed[0] || startRow?.model || null,
    duration,
    claudeTime: null, // ccusage doesn't provide this directly
    cost: metrics?.totalCost || null,
    tokens: metrics?.totalTokens || null,
    flags: startRow ? null : '[No Start Found]'
  };

  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error('[cc-session-track] Error recording session end:', error);
  }

  // Output success response
  const output: HookOutput = { continue: true, suppressOutput: true };
  console.log(JSON.stringify(output));
}

// Entry point
let inputData = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { inputData += chunk; });
stdin.on('end', async () => {
  try {
    const parsed: HookInput = JSON.parse(inputData);
    await sessionEndHook(parsed);
  } catch (error) {
    console.error('[cc-session-track] Hook error:', error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
```

---

## Phase 4: Slash Command

**Goal**: Create `/session_stats` command for formatted output.

### Task 4.1: Create session_stats.md command

**File**: `/commands/session_stats.md`

```markdown
---
description: Display session statistics for the current project
---

Read the `session_stats.md` file from the current project root and display formatted statistics.

## Arguments

- If the user includes `md` or `markdown` in their message, output in **markdown format** (tables)
- Otherwise, output in **color-coded terminal format** (default)

## Behavior

1. Look for `session_stats.md` in the current working directory
2. If the file doesn't exist, inform the user no sessions have been tracked yet
3. Parse the file and display:
   - **Totals**: Sessions count, total duration, Claude time, cost, tokens
   - **Recent Sessions**: Last 5-10 sessions with date, duration, cost, model
   - **Model Breakdown**: (if multiple models used) Cost per model

## Output Formats

### Terminal (default)
Use box-drawing characters and ANSI colors:
- Cyan for borders
- Green for positive values
- Yellow for warnings/flags
- Bold for headers

### Markdown (with `md` flag)
Use proper markdown tables that can be copied to docs or GitHub.
```

---

## Phase 5: Build Configuration

**Goal**: Set up esbuild to compile TypeScript hooks.

### Task 5.1: Create build script

**File**: `/scripts/build-hooks.js`

```javascript
#!/usr/bin/env node

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const HOOKS = [
  { name: 'session-start', source: 'src/hooks/session-start.ts' },
  { name: 'session-end', source: 'src/hooks/session-end.ts' }
];

async function buildHooks() {
  console.log('Building cc-session-track hooks...\n');

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );
  const version = packageJson.version;

  // Create output directories
  const pluginDir = path.join(rootDir, 'plugin');
  const scriptsDir = path.join(pluginDir, 'scripts');

  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  // Build each hook
  for (const hook of HOOKS) {
    console.log(`Building ${hook.name}...`);

    await build({
      entryPoints: [path.join(rootDir, hook.source)],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      outfile: path.join(scriptsDir, `${hook.name}.js`),
      minify: false, // Keep readable for debugging
      sourcemap: false,
      define: {
        '__VERSION__': `"${version}"`
      },
      banner: {
        js: '#!/usr/bin/env node'
      }
    });

    // Make executable
    fs.chmodSync(path.join(scriptsDir, `${hook.name}.js`), 0o755);

    const stats = fs.statSync(path.join(scriptsDir, `${hook.name}.js`));
    console.log(`  ✓ ${hook.name}.js (${(stats.size / 1024).toFixed(2)} KB)`);
  }

  // Copy lib files needed at runtime
  const libDir = path.join(pluginDir, 'lib');
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  // Generate plugin/package.json for runtime
  const pluginPackageJson = {
    name: 'cc-session-track-plugin',
    version: version,
    private: true,
    type: 'module',
    engines: { node: '>=18.0.0' }
  };

  fs.writeFileSync(
    path.join(pluginDir, 'package.json'),
    JSON.stringify(pluginPackageJson, null, 2) + '\n'
  );

  console.log('\n✓ All hooks built successfully!');
  console.log(`  Output: ${scriptsDir}`);
}

buildHooks().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
```

**How to test**: Run `npm run build` - should create `plugin/scripts/session-start.js` and `plugin/scripts/session-end.js`.

---

## Phase 6: Testing & Documentation

### Task 6.1: Run all tests

```bash
npm test
```

Expected: All unit tests pass.

### Task 6.2: Manual integration test

1. Install plugin locally:
   ```bash
   # From project root
   claude plugin install . --local
   ```

2. Start a new Claude session in a test project
3. Check that `session_stats.md` was created with a START row
4. Exit the session normally
5. Check that an END row was added with metrics
6. Run `/session_stats` to see formatted output

### Task 6.3: Test orphan detection

1. Start a Claude session
2. Force-kill the terminal (simulate crash)
3. Start a new session
4. Check that the orphaned session was closed with `[Abnormal End]`

### Task 6.4: Update README.md

Update with:
- Installation instructions (marketplace)
- How it works explanation
- session_stats.md format documentation
- /session_stats command usage
- Troubleshooting tips

---

## Next Steps (Post-Launch Ideas)

### [Keith's idea]
- Add weekly/monthly summary aggregations
- Export to CSV for spreadsheet analysis

### [Claude's idea]
- Add model cost breakdown chart in terminal output
- Support for custom stats file location via config
- Integration with time-tracking tools (Toggl, Clockify)
- Historical trend visualization (cost over time)
- Budget alerts when cost exceeds threshold
- Multi-project dashboard aggregating all projects
