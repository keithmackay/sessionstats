# sessionstats Rebuild — Design

Date: 2026-08-09
Status: Revised after critical-design-review round 1 — ready for implementation planning

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
5. Add multi-tagging (with a dedicated tags-only edit command) and a local cross-project report command.
6. Add an opt-in "post to web" config flag and a stable JSON data contract for it — **no actual HTTP upload in this phase**; that's explicitly a later, separate design.
7. Delete the legacy `/start_session` and `/end_session` commands — superseded by the automated hook pipeline and incompatible with the new `.sessionstats/` design (resolved forced decision from critical-design-review round 1; see below).
8. One-time, throwaway migration script: walks `~/Projects`, sets up `.sessionstats/config.json` (defaults) and migrates each project's old root `session_stats.md` CSV into `.sessionstats/session_stats.json`, then deletes the old CSV (resolved forced decision from critical-design-review round 2; see below).

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
- Defaults: `projectName` = project folder name (`path.basename(cwd)`), `userEmail` = `git config user.email` (verified working), `tags` = `[]`, `postToWeb` = `false`.
- Once the user confirms/adjusts via the interactive flow, `needsSetupConfirmation` is cleared.
- `/session_setup` command runs the identical interactive flow anytime, pre-filled with current values — this is how the full config gets edited later (in addition to hand-editing the JSON).
- Setup is the only place session tracking can be blocked by human input, and even then it isn't: if `needsSetupConfirmation` is never resolved, the hooks still record sessions with default config (empty `tags`, folder-name `projectName`, no web posting) — tracking itself never depends on the interactive step completing. This matches the goal of capturing token usage as automatically and failsafe as possible.
- **`/session_tags` command** — a narrower, tags-only interactive flow, for the common case of changing one tag (e.g. switching to a new feature/epic tag when starting new work) without touching `projectName`, `userEmail`, or `postToWeb`. Shows the current `tags` array and lets the user add/remove individual entries; everything else in `config.json` is left untouched. This is the routine day-to-day entry point; `/session_setup` remains for full reconfiguration.

**`.sessionstats/config.json` schema:**
```json
{
  "schemaVersion": 1,
  "projectName": "string",
  "tags": ["string"],
  "userEmail": "string",
  "postToWeb": false
}
```
`tags` is an array (not a single string) so one project can be aggregated at multiple, independent levels — e.g. a team tag and a feature/epic tag simultaneously. No structure is imposed on individual tag values (no reserved "team:" / "epic:" prefix) — they're an unordered set of labels, and Design §5's report command can filter/group by any one of them.

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

`session_stats.md` becomes a **rendered view only**, regenerated from the JSON (not hand-appended).

**Dependents requiring rework for the new schema** (found by critical-design-review round 1 — the earlier draft incorrectly assumed these needed no changes):
- `src/lib/formatters.ts` — `formatTerminalOutput`/`formatMarkdownOutput` currently read flat `row.cost`/`row.tokens`/`row.model` and `stats.totals.totalClaudeTime`/`totalCost`/`totalTokens`. Both functions must be rewritten to sum cost/tokens across each row's `models[]` array (per row and for totals); `totalClaudeTime` is removed from `StatsFileTotals` (`src/types/index.ts`) and both render functions, since nothing produces it under the new schema.
- `src/lib/orphan-detector.ts` — currently builds the auto-closed "END" row with `model: startRow.model`, `cost: null`, `tokens: null`, `claudeTime: null`. Must instead build a row conforming to the new schema (`models: []`, no `claudeTime` field) when auto-closing an orphaned session.
- The totals-computation logic (currently `computeTotals` in `stats-parser.ts`, tied to the CSV format) is superseded by an equivalent JSON-native aggregation that sums across `models[]` per row — this is the same rework as `formatters.ts`'s totals path above, just centralized rather than duplicated.
- **Gap handling for migrated rows (Section 8):** aggregation must treat `null` per-model fields (`input`/`output`/`cacheRead`/`cacheWrite`) and `null` `apiMessages`/`userMessages`/`toolCalls`/`subagentCount`/`cacheHitRate` as "unknown — contributes nothing to that specific breakdown," not as 0-and-therefore-equivalent-to-a-fully-tracked-zero-usage-session. Rows carrying `"[Migrated]"` in `flags` are historical/partial and must be visually distinguishable in both `formatTerminalOutput`/`formatMarkdownOutput` and `/sessionstats_report`'s output (e.g. shown with their known `cost`/`duration` totals, but flagged rather than silently presented as equal-granularity to hook-tracked rows).

**`.gitignore` handling:** if the project already has a `.gitignore`, `.sessionstats/` is appended to it. If no `.gitignore` exists, nothing is created — the project is left as-is.

### 5. Multi-tagging + cross-project reporting

- `tags` (array, from project config) is stored on every row via `.sessionstats/session_stats.json`, so a project's sessions can be aggregated at more than one level at once (e.g. a team tag and a feature/epic tag on the same project).
- New command, e.g. `/sessionstats_report --tag <name>` (omit `--tag` for all), scans configurable `scanRoots` (plugin-level config, default `["~/Projects"]`) for `.sessionstats/` folders and aggregates sessions from any project whose `tags` array **contains** the given tag — a project with `["team-infra", "epic-billing"]` shows up under either `--tag team-infra` or `--tag epic-billing`. Totals plus per-project and per-model breakdown.
- This local aggregation logic is deliberately the same shape the future website will implement server-side over POSTed data (including the "contains" match over the `tags` array) — no separate design needed later, just a different data source.

### 6. Web posting — config + data contract only

- **Plugin-level config**: `~/.claude/sessionstats/config.json`, holding `websiteUrl` (shared across all projects). Set via a new `/sessionstats_config` command, prompted interactively (same non-interactive-hook constraint doesn't apply here since this is a real command, not a hook).
- **Per-project `postToWeb` flag** (Section 4) controls whether a given project's sessions *would* be sent.
- **Data contract**: the POST payload is the same `session_stats.json` row object already defined in Section 4 (including the `tags` array) — no separate schema. This phase stores/prepares this data; it does not implement the actual HTTP POST call. When the later phase adds real uploading, it reads `postToWeb` + `websiteUrl` and sends the existing JSON rows — no data-model rework required then. Posting from multiple machines/team members under the same `tags` is what enables cross-machine/cross-team aggregation once the website exists.

### 7. Delete legacy `/start_session` and `/end_session` commands

**Resolved forced decision from critical-design-review round 1.** `commands/start_session.md` and `commands/end_session.md` are pre-hook, LLM-driven commands that hand-append free-text lines (`[project] session, Start Time: ...`) directly to `session_stats.md` at the project root — a second, incompatible writer alongside the automated hook pipeline, targeting both the wrong location (root instead of `.sessionstats/`) and an incompatible format (free text instead of the JSON schema). Per the automated/failsafe-tracking goal, these are deleted outright rather than rewritten: hooks already capture every session unconditionally (Section 4), so a manual, easy-to-forget alternative path adds risk (silent format drift, missed invocations) without adding coverage.

### 8. One-time migration of legacy `session_stats.md` history

**Resolved forced decision from critical-design-review round 2.** ~70 projects under `~/Projects` already have real accumulated CSV data in a root-level `session_stats.md` (verified: `cc-session-track` itself has 8 rows, `modelrouter` has 118, `dujour` 80, `snapabrick` 63, etc.). A standalone, throwaway Node script (not part of the plugin's runtime, deleted/archived after use) performs a one-time migration:

- Walks `~/Projects/*` (one level deep) for directories containing a root `session_stats.md`.
- For each: creates `.sessionstats/` if missing, writes `.sessionstats/config.json` with defaults — `projectName` = folder name, `userEmail` = `git config user.email` (per-project, falling back to global), `tags: []` (existing projects get no tags by default — the user assigns them later via `/session_tags`), `postToWeb: false`, `schemaVersion: 1`. Skipped if `.sessionstats/config.json` already exists (idempotent — doesn't clobber a project someone has already configured).
- Parses the old CSV (`session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags,machine_id`) and converts each row into the new schema:
  - `models: model ? [{model, input: null, output: null, cacheRead: null, cacheWrite: null, cost}] : []` — the old format never tracked per-token-type or per-model breakdown, only one flat model name and total cost, so those fields are `null` (unknown), not `0` (known-zero).
  - `apiMessages`, `userMessages`, `toolCalls`, `subagentCount`, `cacheHitRate`: all `null` — never tracked by the old format.
  - `flags`: original flags (e.g. `[Abnormal End]`) plus `[Migrated]` appended, so migrated rows are identifiable at aggregation time (see Design §4's gap-handling requirement above).
  - `sessionId`, `project`, `event`, `timestamp`, `duration`, `machineId` carry over unchanged.
- Writes `.sessionstats/session_stats.json` (skipped if it already exists — idempotent).
- Deletes the old root `session_stats.md` **only after** the new JSON file is successfully written and readable back.
- Runs in **dry-run mode by default** (prints the per-project plan: create/skip config, row count to migrate, file to delete) and only performs writes/deletes when passed an explicit confirmation flag — consistent with how destructive, multi-repo operations are otherwise handled in this environment.

This script is explicitly throwaway: it's a migration aid for the one-time cutover, not a feature of `sessionstats` itself, and isn't shipped as part of the plugin.

## Verified assumptions

| Assumption | Verification |
|---|---|
| Hook scripts are built from `src/` via esbuild into `plugin/scripts/*.js`, referenced via `${CLAUDE_PLUGIN_ROOT}` | Read `hooks/hooks.json` and `plugin/scripts/*.js` — confirmed |
| `session_stats.md` path is a simple parameter (`path.join(input.cwd, 'session_stats.md')`), not hardcoded deep in logic | Read `session-start.ts`, `session-end.ts`, `stats-writer.ts` — confirmed, trivial to repoint |
| `HookInput.cwd` is the project root | Confirmed via `types/index.ts` and both hook files' usage |
| `git config user.email` resolves in this environment | Ran the command — returned a valid email |
| Plugin installed via directory-source marketplace pointed at `~/Projects` | Read `known_marketplaces.json` — confirmed; rename requires reinstall |
| No per-turn processing-duration data exists in transcript JSONL (`claudeTime` can't be derived) | Parsed a real transcript JSONL directly — `message.diagnostics` only contains `cache_miss_reason`; no timing fields found across all assistant entries |
~~Nothing outside `stats-parser.ts`/`stats-writer.ts`/`formatters.ts` reads the flat `cost`/`tokens` fields~~ — **FAILED** (critical-design-review round 1) | Full-population grep across `src/` and `tests/` also found `orphan-detector.ts:34` and `formatters.ts` (lines 90, 129–131, 75–77, 116–118) as dependents. Design §4 now explicitly lists all affected files and their required rework instead of assuming no changes needed. |
| `claude-metrics.py`'s JSONL parsing logic uses only Python stdlib (no exotic deps to reconcile when porting to TS) | Read full `claude-metrics.py` — only `json`, `os`, `sys`, `argparse`, `datetime`, `pathlib`, `collections` |
| Docs/plans convention in this repo is `docs/plans/*.md`, not `docs/specs/` | `ls docs/plans` — confirmed existing files there (`IMPLEMENTATION_PLAN.md`, etc.) |

## Known issues / deferred

- Actual web upload (HTTP POST implementation, retries, error handling) — explicitly deferred to a later phase/design, per user direction.
- `git-analysis.py`'s own code/tests are unaudited as part of this move — it transfers as-is.
- `claude-sessions` repo itself is left in place, not deleted/archived, pending a follow-up decision after this migration ships.

## Review history

- **critical-design-review round 1** (`docs/criticalreviews/2026-08-09-sessionstats-rebuild-design-critical-review-1.md`): found the "no rework needed" claim for `formatters.ts`/`orphan-detector.ts` was false (§2.1), and surfaced the legacy `start_session`/`end_session` commands as an unresolved forced decision (§3.1). Both resolved above — §2.1 fix folded into Design §4; §3.1 resolved as deletion (Design §7), per explicit user direction to keep tracking as automated and failsafe as possible.
- **critical-design-review round 2** (`docs/criticalreviews/2026-08-09-sessionstats-rebuild-design-critical-review-2.md`): found ~70 projects have pre-existing `session_stats.md` history unaddressed by the migration (§3.1). Resolved as Design §8 — one-time throwaway migration script, with gap-handling for the resulting partial-data rows folded into Design §4's dependents-rework requirements.
