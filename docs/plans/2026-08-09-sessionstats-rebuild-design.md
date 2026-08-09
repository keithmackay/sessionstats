# sessionstats Rebuild — Design

Date: 2026-08-09
Status: Approved, ready for implementation planning

## Background

Two projects currently overlap:

- **`claude-sessions`** (`~/Projects/claude-sessions`) — a manual, copy-paste-per-project command set (`/project:session-*`) plus two standalone Python scripts: `claude-metrics.py` (JSONL-based cost/token analysis) and `git-analysis.py` (git history analysis, unrelated to sessions).
- **`cc-session-track`** (`~/Projects/cc-session-track`) — an actual installed Claude Code plugin using `SessionStart`/`SessionEnd` hooks to auto-track sessions into a per-project `session_stats.md`, with cost/tokens currently sourced from the `ccusage` npm package.

`cc-session-track` is the real plugin infrastructure; `claude-metrics.py` has the more accurate/granular cost & token engine. This design merges the useful parts of `claude-sessions` into `cc-session-track`, renames it to **`sessionstats`**, and adds tagging, cross-project reporting, and an opt-in web-posting mechanism (data contract only — the upload/website is a later phase).

`claude-sessions` itself is **not deleted or archived** as part of this work — that's revisited after migration lands.

## Scope

1. Rename `cc-session-track` → `sessionstats`.
2. Extract `git-analysis.py` (and anything that exists solely to support it) into a new, separate project: `~/Projects/gitanalysis`. It does not belong in `sessionstats`.
3. Port `claude-metrics.py`'s JSONL-parsing engine into `sessionstats` (TypeScript), replacing the current `ccusage`-derived flat `cost`/`tokens` fields.
4. Add a `.sessionstats/` per-project folder: project config + JSON output, replacing the root-level `session_stats.md`.
5. Add tagging and a local cross-project report command.
6. Add an opt-in "post to web" config flag and a stable JSON data contract for it — **no actual HTTP upload in this phase**; that's explicitly a later, separate design.

Out of scope (explicitly deferred, not forgotten):
- The website itself and the real upload/HTTP POST implementation.
- Retry/queueing/encryption for the eventual upload.
- Any rework of `git-analysis.py`'s own logic — it just moves, unchanged.
- Deleting/archiving `claude-sessions`.

## Design

### 1. Rename to `sessionstats`

- `plugin.json` `name`/`description`/`repository` updated to `sessionstats`.
- `stats-parser.ts`'s `FILE_HEADER` string and README/docs updated from "cc-session-track" to "sessionstats".
- Because the plugin is installed via a **directory-source marketplace** pointed at `~/Projects` (confirmed in `known_marketplaces.json`: `{"source": "directory", "path": "/Users/Keith.MacKay/Projects"}`), renaming the project folder to `~/Projects/sessionstats` means Claude Code will discover it as a new plugin. The old `cc-session-track@local-dev` install entry needs to be uninstalled and `sessionstats` reinstalled — an implementation/deployment step, not a design concern.

### 2. Extract `git-analysis.py` → `~/Projects/gitanalysis`

- New standalone project. `git-analysis.py` and any code that exists only to support it move there as-is (no logic changes).
- Gets its own `README.md` and `.gitignore` as part of the move (baseline project hygiene), matching how `claude-sessions` and `sessionstats` are each set up — not new scope, just carrying the existing convention over.

### 3. Port `claude-metrics.py`'s engine into `sessionstats`

- New TS module (e.g. `src/lib/token-engine.ts`) that parses the session's transcript JSONL directly (`HookInput.transcript_path`), computing, per model used in the session:
  - `input`, `output`, `cacheRead`, `cacheWrite` tokens
  - `cost` (via an explicit, versioned pricing table — same approach as `claude-metrics.py`, ported into TS)
  - message count, subagent rollup (subagent token/cost folded into the parent session, matching `claude-metrics.py`'s existing subagent-merge behavior)
- This **replaces** the current `ccusage`-based `getSessionMetrics()` in `src/hooks/session-end.ts`. `ccusage` dependency is dropped once the port is complete and verified equivalent (or better) in accuracy.
- Additional per-session stats now available "for free" from direct JSONL parsing (added per user request):
  - `apiMessages` (assistant turn count)
  - `userMessages` count
  - `toolCalls` count
  - `subagentCount`
  - `cacheHitRate` (cache-read tokens ÷ total input tokens)
- **`claudeTime` field is dropped.** Verified against a real transcript JSONL: no per-turn processing-duration data exists in stored data (`message.diagnostics` only carries cache-miss reasons; no timing fields). The "Crunched for Xs" CLI status line is ephemeral terminal UI output, never persisted to the transcript or exposed to hooks (`HookInput` only provides `session_id`/`transcript_path`/`cwd`/etc., not terminal output history). Carrying a permanently-null field forward serves no purpose.

### 4. `.sessionstats/` per-project folder

Created (or updated) by the `SessionStart` hook when missing, and directly by `/session_setup`.

**Setup flow** (first-run and `/session_setup` share the same flow):
- Hook detects no `.sessionstats/config.json` on `SessionStart`. It creates the file with defaults and a `needsSetupConfirmation: true` marker (hooks can't prompt interactively — they're non-interactive shell processes), and includes a note in its output instructing Claude to interactively confirm/adjust the config with the user on the next turn.
- Defaults: `projectName` = project folder name (`path.basename(cwd)`), `userEmail` = `git config user.email` (verified working), `tag` = `""`, `postToWeb` = `false`.
- Once the user confirms/adjusts via the interactive flow, `needsSetupConfirmation` is cleared.
- `/session_setup` command runs the identical interactive flow anytime, pre-filled with current values — this is how the config gets edited later (in addition to hand-editing the JSON).

**`.sessionstats/config.json` schema:**
```json
{
  "schemaVersion": 1,
  "projectName": "string",
  "tag": "string",
  "userEmail": "string",
  "postToWeb": false
}
```

**`.sessionstats/session_stats.json`** — JSON is the source of truth (not CSV/Markdown), since data is now nested (per-model breakdown) and needs to be reused as-is for the future web POST payload. Each row:
```json
{
  "sessionId": "string",
  "project": "string",
  "event": "START | END",
  "timestamp": "ISO8601",
  "duration": "HH:MM:SS | null",
  "models": [
    {"model": "string", "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "cost": 0}
  ],
  "apiMessages": 0,
  "userMessages": 0,
  "toolCalls": 0,
  "subagentCount": 0,
  "cacheHitRate": 0,
  "flags": "string | null",
  "machineId": "string"
}
```
`schemaVersion` is stored at the file level alongside the row array, so both the local report and the future website can detect format changes.

`session_stats.md` becomes a **rendered view only**, regenerated from the JSON (not hand-appended) — same terminal/markdown formatting `formatters.ts` already produces, just sourced from JSON rows instead of parsed CSV lines.

**`.gitignore` handling:** if the project already has a `.gitignore`, `.sessionstats/` is appended to it. If no `.gitignore` exists, nothing is created — the project is left as-is.

### 5. Tagging + cross-project reporting

- `tag` (from project config) is stored on every row via `.sessionstats/session_stats.json`.
- New command, e.g. `/sessionstats_report --tag <name>` (omit `--tag` for all), scans configurable `scanRoots` (plugin-level config, default `["~/Projects"]`) for `.sessionstats/` folders and aggregates matching sessions: totals plus per-project and per-model breakdown.
- This local aggregation logic is deliberately the same shape the future website will implement server-side over POSTed data — no separate design needed later, just a different data source.

### 6. Web posting — config + data contract only

- **Plugin-level config**: `~/.claude/sessionstats/config.json`, holding `websiteUrl` (shared across all projects). Set via a new `/sessionstats_config` command, prompted interactively (same non-interactive-hook constraint doesn't apply here since this is a real command, not a hook).
- **Per-project `postToWeb` flag** (Section 4) controls whether a given project's sessions *would* be sent.
- **Data contract**: the POST payload is the same `session_stats.json` row object already defined in Section 4 — no separate schema. This phase stores/prepares this data; it does not implement the actual HTTP POST call. When the later phase adds real uploading, it reads `postToWeb` + `websiteUrl` and sends the existing JSON rows — no data-model rework required then.

## Verified assumptions

| Assumption | Verification |
|---|---|
| Hook scripts are built from `src/` via esbuild into `plugin/scripts/*.js`, referenced via `${CLAUDE_PLUGIN_ROOT}` | Read `hooks/hooks.json` and `plugin/scripts/*.js` — confirmed |
| `session_stats.md` path is a simple parameter (`path.join(input.cwd, 'session_stats.md')`), not hardcoded deep in logic | Read `session-start.ts`, `session-end.ts`, `stats-writer.ts` — confirmed, trivial to repoint |
| `HookInput.cwd` is the project root | Confirmed via `types/index.ts` and both hook files' usage |
| `git config user.email` resolves in this environment | Ran the command — returned a valid email |
| Plugin installed via directory-source marketplace pointed at `~/Projects` | Read `known_marketplaces.json` — confirmed; rename requires reinstall |
| No per-turn processing-duration data exists in transcript JSONL (`claudeTime` can't be derived) | Parsed a real transcript JSONL directly — `message.diagnostics` only contains `cache_miss_reason`; no timing fields found across all assistant entries |
| Nothing outside `stats-parser.ts`/`stats-writer.ts`/`formatters.ts` reads the flat `cost`/`tokens` fields | Read `tests/unit/*.test.ts` and all `src/` files — only those three modules plus their tests touch `SessionRow.cost`/`.tokens` |
| `claude-metrics.py`'s JSONL parsing logic uses only Python stdlib (no exotic deps to reconcile when porting to TS) | Read full `claude-metrics.py` — only `json`, `os`, `sys`, `argparse`, `datetime`, `pathlib`, `collections` |
| Docs/plans convention in this repo is `docs/plans/*.md`, not `docs/specs/` | `ls docs/plans` — confirmed existing files there (`IMPLEMENTATION_PLAN.md`, etc.) |

## Known issues / deferred

- Actual web upload (HTTP POST implementation, retries, error handling) — explicitly deferred to a later phase/design, per user direction.
- `git-analysis.py`'s own code/tests are unaudited as part of this move — it transfers as-is.
- `claude-sessions` repo itself is left in place, not deleted/archived, pending a follow-up decision after this migration ships.
