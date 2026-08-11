# Compaction Tracking, Session Breaks, and Verbose Query Tracking — Design

## Goal

Track context-compaction exercises as their own bounded session-stat entries, let users manually split a session's tracked stats mid-conversation, and add an opt-in per-query (per-turn) tracking mode for finer-grained analysis.

## Background

`sessionstats` tracks Claude Code sessions via `SessionStart`/`SessionEnd` hooks, writing paired START/END rows to `.sessionstats/session_stats.json`. `SessionStart` is already registered with matcher `startup|clear|compact|resume`, so it fires after a context compaction — but there is no corresponding pre-compaction `SessionEnd`-equivalent, so a compaction today silently produces an extra START row with no matching END, until the next real `SessionStart`'s orphan-detector eventually closes it with `[Abnormal End]`.

## 1. Compaction tracking

- New `src/hooks/precompact.ts`, built to `plugin/scripts/precompact.js` via `scripts/build-hooks.js` (added to its `HOOKS` array), registered in `hooks/hooks.json` under a new `PreCompact` event with no matcher restriction (fires for both `manual` and `auto` triggers).
- On invocation: read hook JSON from stdin, find the most recent START row for `session_id` (`findStartRow`), compute duration the same way `session-end.ts` does (`calculateDuration`), parse `transcript_path` with the existing `parseSessionTranscript`, and append an END row flagged `[Compacted]`.
- No changes to `session-start.ts` — its existing `source: 'compact'` invocation already writes a plain START row. `session_id` is stable across compaction (verified), so this new START row links correctly via `findStartRow`'s "most recent START for this session_id" lookup, and the eventual real `SessionEnd` computes its duration from this post-compact START rather than the original session start.

## 2. `/session_break` command

- New `commands/session_break.md`, invoked with no arguments. Its Bash step passes `$CLAUDE_CODE_SESSION_ID` (confirmed present in the Bash tool's environment) to a new `src/scripts/session-break.ts` (added to `build-hooks.js`'s `CLI_SCRIPTS` array), which also derives the transcript path from the current working directory using the same project-dir-encoding convention already implemented in `extract-prompts.ts` (`projectDir.replace(/[/.]/g, '-')` under `~/.claude/projects/`). That encoding logic moves into a small shared helper (e.g. `src/lib/transcript-path.ts`) that both `extract-prompts.ts` and `session-break.ts` import, since it's now used in two places.
- The script writes an END row flagged `[Manual Break]` (duration/tokens computed identically to the PreCompact path), then immediately writes a new START row with the same `session_id` and the current timestamp.

## 3. Verbose per-query tracking

- New per-project config field `verbose: boolean` (default `false`) on `ProjectConfig`, set via `/session_setup` alongside the existing four fields (mirrors how `postToWeb` is presented and saved).
- New hooks `UserPromptSubmit` (turn start) and `Stop` (turn end), both registered with no matcher. Each checks `config.verbose` first and no-ops immediately if false — verbose-off projects pay no added cost.
- **Field names for these hook JSON payloads must be confirmed against a live invocation before the parsing code is written** — search sources disagree on exact field names (`user_prompt` vs. `prompt` for `UserPromptSubmit`; some report `session_id` was historically inconsistent on `Stop`). Implementation's first step is to temporarily log the raw stdin JSON for `PreCompact`, `UserPromptSubmit`, and `Stop` to stderr during a real compaction/turn, confirm the actual field names against this machine's installed Claude Code version, then write the typed parsing against confirmed field names (not documentation).
- Incremental parsing: a transient checkpoint file `.sessionstats/.state/<sessionId>.json` (added to `.gitignore` — ephemeral, not shared data) holds `{ byteOffset: number }`. On `Stop`, read `transcript_path` from `byteOffset` to EOF only (not the whole file), parse just the new complete JSONL lines using the existing per-line parsing logic in `token-engine.ts`'s `parseTranscript` (its loop body extracted into a reusable per-line function so both the whole-file and incremental paths share it, not duplicate it), then update `byteOffset`.
- Each query's stats accumulate into a `queries: QueryRow[]` array added to the session's END row (not a new top-level schema, no nested `sessions[]` restructure, no schema-version bump). `QueryRow` reuses the existing `ModelUsage[]`/`toolCalls`/`apiMessages`/etc. shape plus a `duration` computed from the paired `UserPromptSubmit`→`Stop` timestamps for that turn. Non-verbose sessions simply omit or leave `queries` empty.

## Bugfix in scope: session count double-counting

`src/lib/stats-parser.ts`'s `computeTotals()` currently sets `sessions: endRows.length` — every END row counts as one session. Once `[Compacted]`/`[Manual Break]` END rows exist, a single real session compacted twice would report as 3 sessions in `/session_stats` and `/sessionstats_report`, even though duration/cost/token sums (which are additive across the split) remain correct. Fix: `sessions` counts only END rows whose `flags` does **not** include `[Compacted]` or `[Manual Break]` — i.e. only rows that represent the true end of a real Claude Code session. Duration/cost/token totals continue summing across all END rows (including flagged continuation rows), since those figures are already correct as-is.

## Data model changes

`SessionRow.flags` gains two new possible string values: `[Compacted]`, `[Manual Break]` (existing type is already `string | null` — this is additive, not a type change).

`SessionRow` gains an optional `queries?: QueryRow[]` field, populated only when the owning project's `verbose` config is `true`.

```ts
export interface QueryRow {
  timestamp: string;       // UserPromptSubmit time
  duration: string;        // time from UserPromptSubmit to Stop
  models: ModelUsage[];
  toolCalls: number | null;
}
```

`ProjectConfig` gains `verbose: boolean` (default `false` for new configs; existing configs on disk without the field follow the same no-migration convention already used when `postToWeb` was added — read as `undefined`, treated as falsy at call sites).

`HookInput.hook_event_name` union extends to include `'PreCompact' | 'UserPromptSubmit' | 'Stop'`. `HookInput` gains optional fields `trigger?: 'manual' | 'auto'` (PreCompact) and the confirmed prompt-text field name for `UserPromptSubmit` (pending live verification, see above).

## Verified assumptions

- **`session_id` is stable across context compaction** — confirmed via Claude Code hooks documentation (code.claude.com/docs/en/hooks): "Compaction is a mid-session operation that doesn't create a new session."
- **`PreCompact` hook JSON input** carries `session_id`, `transcript_path`, `hook_event_name: "PreCompact"`, `trigger: "manual"|"auto"`, `custom_instructions` — confirmed via web search against a documented example payload.
- **`CLAUDE_CODE_SESSION_ID` env var is available in the Bash tool execution context** — confirmed empirically: `env | grep -i claude` in this actual session showed `CLAUDE_CODE_SESSION_ID=b545304c-9cdc-4605-965c-0d4dc4708cbb`, matching this session's real ID. (Note: search results incorrectly suggested the var was named `CLAUDE_SESSION_ID` — the real name has a `CODE_` infix. Don't trust the unqualified name without checking.)
- **Transcript path convention** (`~/.claude/projects/<cwd with / and . replaced by ->/<session_id>.jsonl`) — confirmed empirically: `find ~/.claude/projects -name "${CLAUDE_CODE_SESSION_ID}.jsonl"` located the exact real transcript file for this session. Matches the encoding already implemented in `src/scripts/extract-prompts.ts`.
- **`orphan-detector.ts`'s `hasStart && !hasEnd` logic won't misfire** on sessions with multiple START/END pairs from compaction or manual breaks — confirmed by reading `src/lib/orphan-detector.ts`: it uses `.some()` across all rows for a `session_id`, so a session with any END row (flagged or not) is never treated as orphaned.
- **`build-hooks.js` bundling is purely additive** — confirmed by reading `scripts/build-hooks.js`: new hooks/scripts are added as entries to its `HOOKS`/`CLI_SCRIPTS` arrays; no other change needed to the build pipeline.
- **NOT verified (flagged above as a required first implementation step, not assumed):** exact JSON field names for `UserPromptSubmit` and `Stop` hook payloads. Search sources disagreed (`user_prompt` vs. `prompt`; an open GitHub issue suggested `session_id` was historically inconsistent on `Stop`). These must be confirmed by logging real hook invocations before the parsing code is written.

## Out of scope

- Migrating existing `.sessionstats/session_stats.json` files — the new `flags` values and `queries` field are purely additive; no migration needed.
- Any UI/reporting changes to `/session_stats`, `/sessionstats_report`, or the website beyond the `computeTotals` session-count fix above. Whether/how to surface `[Compacted]`/`[Manual Break]` counts or per-query drill-down in reports is a separate follow-up, not part of this design.
- Blocking compaction from `PreCompact` (exit code 2) — this design only observes compaction to record stats, never blocks it.
