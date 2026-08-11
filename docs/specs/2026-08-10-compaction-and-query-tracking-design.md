# Compaction Tracking, Session Breaks, and Verbose Query Tracking — Design

## Goal

Track context-compaction exercises as their own bounded session-stat entries, let users manually split a session's tracked stats mid-conversation, and add an opt-in per-query (per-turn) tracking mode for finer-grained analysis.

## Background

`sessionstats` tracks Claude Code sessions via `SessionStart`/`SessionEnd` hooks, writing paired START/END rows to `.sessionstats/session_stats.json`. `SessionStart` is already registered with matcher `startup|clear|compact|resume`, so it fires after a context compaction — but there is no corresponding pre-compaction `SessionEnd`-equivalent, so a compaction today silently produces an extra START row with no matching END, until the next real `SessionStart`'s orphan-detector eventually closes it with `[Abnormal End]`.

## Aggregation model

Every reporting view — user/cross-project, project, session, segment (row), and query — is a **pure sum over the layer below it**, computed from a single granular source of truth: the individual API call. This holds only if each layer's own figures never overlap with a sibling's; the design below is built around that invariant end to end, not just at the layer it was first asked for.

```
API call (one assistant JSONL entry, main transcript or subagent)
  → Query/turn  (all API calls, incl. spawned subagents, between one UserPromptSubmit and the following Stop)
    → Segment/row (all queries within one START/END pair — a real session start, or a resume after [Compacted]/[Manual Break])
      → Session  (all segments/rows sharing one session_id)
        → Project (all sessions in one project's session_stats.json)
          → Cross-project (all projects — /sessionstats_report locally, or the website across posted rows)
```

Each arrow is a plain sum (cost, tokens, tool calls) once the layer below is correct — session/project/cross-project aggregation code (`computeTotals`, `aggregateByTag`, the website's `groupByTagAndProject`) needs no change beyond the session-count fix below; they already sum whatever rows they're given. The layer that must be correct at the source is the query/segment layer, addressed next.

## 1. Compaction tracking, session breaks, and per-row/per-query stats: unified incremental parsing

The original design called `parseSessionTranscript` (a full-file, from-byte-0 parse) at every END-row site — `session-end.ts`, and the new `precompact.ts`/`session-break.ts`. Since `transcript_path` is the same file across compaction (verified: `session_id` is stable), this means a `[Compacted]` row and the session's eventual real END row both include the pre-compaction portion in full — `computeTotals` then sums both, double- (or triple-, with multiple compactions) counting that portion. The same full-parse re-reads every subagent `.jsonl` file present under the transcript's subagent directory on every call, so subagent usage double-counts the same way.

**Fix: every END-row site computes only its own segment's delta**, using one shared incremental-parsing mechanism (this also serves verbose per-query tracking — one mechanism, not two):

- A per-session checkpoint file `.sessionstats/.state/<sessionId>.json` (gitignored — already covered by the existing blanket `.sessionstats/` entry, no new `.gitignore` line needed) holds:
  ```ts
  { byteOffset: number; processedSubagents: string[]; queries: QueryRow[] }
  ```
- `token-engine.ts` gains an incremental sibling to `parseSessionTranscript`: `parseTranscriptSince(transcriptPath, byteOffset, processedSubagents)`, built from the same per-line parsing logic already in `parseTranscript` (extracted into a reusable per-line function, not duplicated). It reads the main transcript only from `byteOffset` to EOF, and only subagent files not already listed in `processedSubagents`; returns the delta stats plus the new `byteOffset` and the updated `processedSubagents` list.
- **`UserPromptSubmit`** (turn start, checked only if `config.verbose`): records the turn's start timestamp — no transcript read needed yet.
- **`Stop`** (turn end): if `config.verbose`, calls `parseTranscriptSince` for the delta since the last checkpoint, builds a `QueryRow` (see below) from it, appends the row to the checkpoint's `queries[]`, and advances `byteOffset`/`processedSubagents` in the checkpoint. If `config.verbose` is `false`, `Stop` is a no-op (no checkpoint write) — see "Non-verbose bookkeeping" below for how `byteOffset` still advances.
- **Every END-row site** (`session-end.ts`, `precompact.ts`, `session-break.ts`) reads the checkpoint file (if present), calls `parseTranscriptSince` itself for anything not yet covered by the checkpoint's `byteOffset` (covers the non-verbose case, where `Stop` never advanced it), sums that with whatever `queries[]` already accumulated (verbose case) to get the segment's own `models[]`/`apiMessages`/`toolCalls`/etc., and writes the END row with:
  - **Continuation rows** (`[Compacted]`, `[Manual Break]`): attach `queries` (if `verbose`, else omit), then **reset** the checkpoint to `{ byteOffset: <current EOF>, processedSubagents: <current list>, queries: [] }` — carrying `byteOffset`/`processedSubagents` forward (the transcript file keeps growing across the boundary; re-reading from 0 would re-count the segment just closed) while clearing `queries` (the next segment's queries are its own).
  - **True end** (`session-end.ts`): attach `queries` (if `verbose`), then delete the checkpoint file entirely — nothing will read this `session_id`'s transcript again.

**Non-verbose bookkeeping.** For a non-verbose project, `Stop` never runs, so the checkpoint never gets created or advanced mid-session — each END-row site simply finds no checkpoint (first segment) or the checkpoint left by the *previous* END-row site (subsequent segments after a compaction/break), and calls `parseTranscriptSince` from wherever that leaves off. This means non-verbose projects still get correct, non-overlapping per-segment totals — verbose mode only adds the `queries[]` breakdown on top, it isn't required for the double-counting fix itself.

- New `src/hooks/precompact.ts`, built to `plugin/scripts/precompact.js` via `scripts/build-hooks.js` (added to its `HOOKS` array), registered in `hooks/hooks.json` under a new `PreCompact` event with no matcher restriction (fires for both `manual` and `auto` triggers). On invocation: read hook JSON from stdin, find the most recent START row for `session_id` (`findStartRow`), compute duration via `calculateDuration` from that START, compute this segment's token stats via the incremental mechanism above, append an END row flagged `[Compacted]`, and — matching `session-end.ts`'s existing behavior — call `postSessionToWeb` for this row when the project's `postToWeb` config is `true` (see "Website posting" below).
- No changes to `session-start.ts` — its existing `source: 'compact'` invocation already writes a plain START row. `session_id` is stable across compaction, so this new START row links correctly via `findStartRow`'s "most recent START for this session_id" lookup.

## 2. `/session_break` command

- New `commands/session_break.md`, invoked with no arguments. Its Bash step passes `$CLAUDE_CODE_SESSION_ID` (confirmed present in the Bash tool's environment) to a new `src/scripts/session-break.ts` (added to `build-hooks.js`'s `CLI_SCRIPTS` array), which also derives the transcript path from the current working directory using the same project-dir-encoding convention already implemented in `extract-prompts.ts` (`projectDir.replace(/[/.]/g, '-')` under `~/.claude/projects/`). That encoding logic moves into a small shared helper (e.g. `src/lib/transcript-path.ts`) that both `extract-prompts.ts` and `session-break.ts` import, since it's now used in two places.
- The script writes an END row flagged `[Manual Break]` (duration/tokens computed via the same incremental mechanism as `precompact.ts`), calls `postSessionToWeb` for that row when `postToWeb` is `true` (same as `precompact.ts`), then immediately writes a new START row with the same `session_id` and the current timestamp.

## Website posting

**Resolved:** `[Compacted]` and `[Manual Break]` END rows post to the website exactly like every other END row does today — `precompact.ts` and `session-break.ts` both call `postSessionToWeb` when the project's `postToWeb` config is `true`, with no special-casing by flag. This matches `session-end.ts`'s existing "every END row posts" behavior, so posting logic stays uniform across all three END-row sites. Safe now that the double-counting fix (§1) guarantees every posted row — continuation or true end — carries only its own non-overlapping segment's totals, so the website's `groupByTagAndProject` sums stay correct regardless of which rows get posted. No changes needed to `src/lib/web-post.ts` or the website's `POST /api/sessions` route — both already accept and store any `SessionRow`-shaped payload regardless of `flags`.

## 3. Verbose per-query tracking

- New per-project config field `verbose: boolean` (default `false`) on `ProjectConfig`, set via `/session_setup` alongside the existing four fields (mirrors how `postToWeb` is presented and saved). See "Why opt-in, not default-on" below for the reasoning.
- New hooks `UserPromptSubmit` (turn start) and `Stop` (turn end), both registered with no matcher.
- **Field names for these hook JSON payloads must be confirmed against a live invocation before the parsing code is written** — search sources disagree on exact field names (`user_prompt` vs. `prompt` for `UserPromptSubmit`; some report `session_id` was historically inconsistent on `Stop`). Implementation's first step is to temporarily log the raw stdin JSON for `PreCompact`, `UserPromptSubmit`, and `Stop` to stderr during a real compaction/turn, confirm the actual field names against this machine's installed Claude Code version, then write the typed parsing against confirmed field names (not documentation).
- A query's `models[]` includes any subagent transcripts spawned and completed during that turn (via `processedSubagents`, see above) — a turn that dispatches a subagent gets that subagent's tokens/cost attributed to it, matching how subagent usage already rolls up to the session level today. A subagent's own internal turns are not separately broken out — it's attributed as one unit to the parent query, matching the existing `subagentCount` rollup's level of detail; further exploding a subagent's internals into its own turn-by-turn breakdown is out of scope (see "Out of scope").
- Each query's stats accumulate into a `queries: QueryRow[]` array added to the session's END row (not a new top-level schema, no nested `sessions[]` restructure, no schema-version bump). Non-verbose sessions simply omit or leave `queries` empty.

### Why opt-in, not default-on

Verbose mode is deliberately per-project opt-in rather than the default, for reasons with a real, literal cost — not just caution:

- **Added latency on every turn, for every project.** A `Stop` hook is a new process spawned after every single response, in every project, whether or not anyone will ever look at the per-query data. Non-verbose projects pay none of this.
- **Every hook invocation across the whole plugin reads and rewrites the full `session_stats.json` file** (`stats-writer.ts`'s `appendRow` does read-modify-write, not true append). `queries[]` grows `session_stats.json` roughly in proportion to turn count (tens to hundreds of entries per session) rather than session count — for a project where nobody needs query-level detail, that's a strictly larger file for every future `SessionStart`/`SessionEnd`/`PreCompact` hook to parse, forever, for no benefit.
- **Most projects don't need this level of detail.** The plugin's existing design already establishes "quiet by default, explicit opt-in for extra work" (`postToWeb` follows the same pattern) — verbose tracking is speculative value for a project that hasn't asked for it, at a real, always-on cost.

None of this blocks turning verbose on where it's wanted — it's a one-line `/session_setup` toggle, per project, at any time.

## Bugfix in scope: session count double-counting

`src/lib/stats-parser.ts`'s `computeTotals()` and `src/scripts/report.ts`'s `aggregateByTag()` both currently compute `sessions: endRows.length` — every END row counts as one session. Once `[Compacted]`/`[Manual Break]` END rows exist, a single real session compacted twice would report as 3 sessions in **both** `/session_stats` (via `computeTotals`) and `/sessionstats_report` (via `aggregateByTag`) — the original draft of this fix only covered the former. Fix, applied identically in both places: `sessions` counts only END rows whose `flags` is **not** `[Compacted]` or `[Manual Break]` — i.e. only rows that represent the true end of a real Claude Code session. Duration/cost/token totals continue summing across all END rows (including flagged continuation rows) — with the double-counting fix above, those figures are now genuinely additive with no overlap.

## Data model changes

`SessionRow.flags` gains two new possible string values: `[Compacted]`, `[Manual Break]` (existing type is already `string | null` — this is additive, not a type change).

`SessionRow` gains an optional `queries?: QueryRow[]` field, populated only when the owning project's `verbose` config is `true`.

```ts
export interface QueryRow {
  timestamp: string;       // UserPromptSubmit time
  duration: string;        // time from UserPromptSubmit to Stop
  models: ModelUsage[];    // includes any subagents spawned during this turn
  toolCalls: number | null;
  subagentCount: number | null;
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
- **`parseSessionTranscript` always reads the whole transcript file from byte 0, and re-reads every subagent `.jsonl` file present, on every call** — confirmed by reading `src/lib/token-engine.ts:129-147` (`fs.readFileSync(transcriptPath, ...)` with no offset; `fs.readdirSync(subagentDir)` iterates all files present, unconditionally). This is the root cause of the double-counting bug this revision fixes, and the reason the incremental `byteOffset`/`processedSubagents` mechanism is needed for every END-row site, not just verbose mode.
- **Subagent transcript files are immutable and persistent once written** (not modified or deleted after the subagent completes) — this is required for `processedSubagents` tracking to be safe (a file, once counted, must never change or disappear). Not independently re-verified this round; it's a natural extension of the already-verified "transcripts are append-only, persistent for the life of the session" behavior, and no code anywhere in this codebase deletes or rewrites subagent transcript files. Flagged here rather than silently assumed — if this turns out to be wrong, `processedSubagents` tracking would need to switch from filename-based to content-hash-based tracking.
- **NOT verified (flagged above as a required first implementation step, not assumed):** exact JSON field names for `UserPromptSubmit` and `Stop` hook payloads. Search sources disagreed (`user_prompt` vs. `prompt`; an open GitHub issue suggested `session_id` was historically inconsistent on `Stop`). These must be confirmed by logging real hook invocations before the parsing code is written.

## Out of scope

- Migrating existing `.sessionstats/session_stats.json` files — the new `flags` values and `queries` field are purely additive; no migration needed.
- Any UI/reporting changes to `/session_stats`, `/sessionstats_report`, or the website beyond the session-count fix above. Whether/how to surface `[Compacted]`/`[Manual Break]` counts or per-query drill-down in reports is a separate follow-up, not part of this design.
- Blocking compaction from `PreCompact` (exit code 2) — this design only observes compaction to record stats, never blocks it.
- Breaking a subagent's own transcript down turn-by-turn — subagent usage is attributed as one unit to the query that spawned it (see section 3).
- Building session-level (or query-level) grouping/drill-down UI on the website itself — this design makes the necessary rows available (see "Website posting"), but the website's `/report` page and `groupByTagAndProject` are not changed here to add that view.
