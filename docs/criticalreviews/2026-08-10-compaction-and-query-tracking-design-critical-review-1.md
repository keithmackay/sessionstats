# Critical Design Review: 2026-08-10-compaction-and-query-tracking-design (Round 1)

**Spec:** `/Users/Keith.MacKay/Projects/sessionstats/docs/specs/2026-08-10-compaction-and-query-tracking-design.md`
**Verified Assumptions section:** present

## 0. Coverage enumeration

**Sections**
- Goal — ok — descriptive only, no claims to check
- Background — ok — re-verified against `hooks/hooks.json` (SessionStart matcher includes `compact`) and `src/hooks/session-start.ts` (writes unconditional START row) — matches spec's stated gap
- 1. Compaction tracking — see rule R1
- 2. `/session_break` command — see rules R3
- 3. Verbose per-query tracking — see rule R4 → §2.2
- Bugfix in scope — see rule R2 → §2.1
- Data model changes (`QueryRow` shape) — ok — fields (`timestamp`, `duration`, `models`, `toolCalls`) are self-consistent, no undefined references
- Verified assumptions — see §1 below
- Out of scope — ok — explicitly excludes website/report UI changes beyond the named bugfix; this scoping is what allows dropping the website-propagation candidate below

**Rules and operands**
- R1: `findStartRow` "most recent START by `session_id`" match feeds PreCompact/session-break END-row duration calc — ok — re-read `src/lib/stats-parser.ts:18-22` (filters by `sessionId` + `event==='START'`, returns last) and `src/lib/orphan-detector.ts` (`hasStart && !hasEnd` per `session_id`, using `.some()` across all rows) — a session with any END row (flagged or not) is never orphan-flagged, so repeated START/END pairs sharing one `session_id` don't misfire
- R2: `computeTotals`'s `sessions: endRows.length` — spec proposes fixing this in `stats-parser.ts` only → **§2.1**, missing sibling
- R3: `session-break.ts` transcript-path derivation via cwd-encoding — ok — matches existing convention in `src/scripts/extract-prompts.ts:9-13`; a cwd mismatch degrades to "transcript not found" (same graceful path `session-end.ts:23-28` already uses on parse failure), not a wrong-session mixup, since the target filename is a session UUID
- R4: per-turn `QueryRow` data must survive between `Stop` hook invocations (separate processes) until the owning session's END row is written → **§2.2**, no persistence mechanism specified
- R5: whether PreCompact/session-break END rows get posted to the website via `postSessionToWeb` (existing `session-end.ts:54-56` posts every END row when `postToWeb` is on) — spec is silent → **§3.1**
- R6: spec says the state file "added to .gitignore" — dropped, `.gitignore` already has a blanket `.sessionstats/` entry (confirmed: `.gitignore:31`), so this is redundant but not wrong; no behavior depends on it

**Data-flow arrows (persistence boundaries flagged)**
- A1: `PreCompact` stdin JSON → `precompact.ts` → `session_stats.json` write — ok — fields (`session_id`, `transcript_path`, `trigger`) confirmed present per spec's own Verified Assumptions (cited web evidence, re-checked, unchanged)
- A2: `CLAUDE_CODE_SESSION_ID` env var → `session-break.ts` arg → `session_stats.json` write — ok — re-confirmed present in this actual session's Bash env (spec's own cited evidence, unchanged)
- A3: `Stop` hook stdin → incremental tail-parse → `queries[]` on the session's END row — same gap as R4, folded into **§2.2**
- A4: END row (with populated `queries[]`) → `postSessionToWeb` → website `POST /api/sessions` route — ok/dropped — read `sessionstats-web/app/api/sessions/route.ts:12-32`: the row-mapping object literal explicitly whitelists named fields and does not include `queries`, so it's silently dropped, not stored. Not a finding: the spec's own "Out of scope" section already excludes website/report changes beyond the named bugfix, so no propagation was ever promised.

## 1. Verified-assumptions cross-check

- "`session_id` is stable across context compaction" — still holds (no new evidence found to the contrary).
- "`PreCompact` hook JSON input carries `session_id`, `transcript_path`, `hook_event_name`, `trigger`, `custom_instructions`" — still holds (cited evidence unchanged).
- "`CLAUDE_CODE_SESSION_ID` env var is available in the Bash tool execution context" — still holds — re-checked, this session's actual env still shows `CLAUDE_CODE_SESSION_ID=b545304c-9cdc-4605-965c-0d4dc4708cbb`.
- "Transcript path convention (`~/.claude/projects/<encoded-cwd>/<session_id>.jsonl`)" — still holds — the `find` result cited in the spec located this session's real transcript file.
- "`orphan-detector.ts`'s `hasStart && !hasEnd` logic won't misfire on multi-START sessions" — still holds — re-read the file this round, logic unchanged from spec's description.
- "`build-hooks.js` bundling is purely additive" — still holds — re-read the file this round, `HOOKS`/`CLI_SCRIPTS` are plain arrays.
- "NOT verified: exact `UserPromptSubmit`/`Stop` field names" — correctly labeled pending in the spec itself (a resolved deferral — "verify live before writing parsing code" — not an open fork), not re-litigated here.

**Span check:** one dependency load-bearing for the design with no covering bullet — that `Stop` fires exactly once per full agentic turn (after all nested tool-use round-trips complete), not once per tool call. The incremental tail-read design (§3, "read from `byteOffset` to EOF" on `Stop`) depends on this to capture a turn's *entire* content in one shot. Verifiable now with evidence already gathered this session: code.claude.com/docs/en/hooks (fetched earlier in this design session) states the hook lifecycle as `UserPromptSubmit → (agentic loop with tool calls) → Stop`, i.e. `Stop` fires once, after the loop — confirms the dependency holds. Re-confirmed in-round; no forced decision needed.

## 2. Literal-wrongness findings

**2.1 — Session-count bugfix is incomplete; a sibling call site has the identical bug.**
The spec's "Bugfix in scope" section fixes `computeTotals()` in `src/lib/stats-parser.ts:48` (`sessions: endRows.length`) so `/session_stats` reports accurate session counts. But `src/scripts/report.ts:79` — the aggregation function backing `/sessionstats_report` — computes `sessions: endRows.length` the identical way, with no flag filtering. After implementing exactly what the spec says, a session compacted twice would still report as 3 sessions in `/sessionstats_report`'s cross-project totals, even though `/session_stats` reports it correctly. This is the same bug the spec explicitly set out to fix, left half-fixed.
*Fix:* apply the same flags-based exclusion (`endRows.filter(r => r.flags !== '[Compacted]' && r.flags !== '[Manual Break]').length`) in `report.ts`'s `aggregateByTag`, in the `sessions: endRows.length` line at `src/scripts/report.ts:79`.

**2.2 — No persistence mechanism specified for per-turn query data between `Stop` hook invocations.**
Each `Stop` hook invocation is a fresh, short-lived process with no memory of prior turns. The spec's incremental-parsing checkpoint file is scoped to hold only `{ byteOffset: number }` (§3). But §3 also states "Each query's stats accumulate into a `queries: QueryRow[]` array added to the session's END row" — and the END row is written by an entirely different process, potentially dozens of turns later (`session-end.ts`, or the new `precompact.ts`/`session-break.ts`). Nothing in the design specifies where the `QueryRow` objects computed by each `Stop` invocation are stored so that the later END-row-writing code can read them all back. As written, verbose mode computes per-turn stats every turn and then has nowhere to put them — the accumulation the design promises is impossible with the state file schema as specified.
*Fix:* extend the checkpoint file's schema to `{ byteOffset: number, queries: QueryRow[] }`; each `Stop` invocation appends its computed `QueryRow` to this array (read-modify-write, same pattern already used by `appendRow` in `stats-writer.ts`) alongside advancing `byteOffset`. The END-row-writing code (`session-end.ts`, `precompact.ts`, `session-break.ts`) reads `.sessionstats/.state/<sessionId>.json`, attaches its `queries` array to the outgoing END row, and deletes the state file (matching the "transient" framing already used in the spec).

## 3. Forced decisions

**3.1 — Should `[Compacted]`/`[Manual Break]` END rows post to the website?**
`session-end.ts:54-56` currently posts every END row to the configured website when a project's `postToWeb` is `true`. The design adds two new END-row-producing code paths (`precompact.ts`, `session-break.ts`) but doesn't say whether they follow the same convention.
- **Why forced:** both options are internally consistent (nothing about the existing `postToWeb` mechanism dictates one answer), but the choice is user-visible: it decides whether compaction/break-boundary rows show up in the website's "All sessions" list and cost/token totals, or only true session-ends do.
- **Options:**
  a) Post them too, matching `session-end.ts`'s existing "every END row" behavior — compaction/break exercises become visible cross-machine.
  b) Post only true session-end rows — `precompact.ts`/`session-break.ts` never call `postSessionToWeb`, keeping the website's session list matched 1:1 with real Claude Code sessions.

## 5. Recommendation

🛑 **Surface forced decisions to user** — §2 and §3 are both non-empty.
