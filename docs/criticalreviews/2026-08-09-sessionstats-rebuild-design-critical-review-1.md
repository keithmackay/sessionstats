# Critical Design Review: 2026-08-09-sessionstats-rebuild-design (Round 1)

**Spec:** `/Users/Keith.MacKay/Projects/cc-session-track/docs/plans/2026-08-09-sessionstats-rebuild-design.md`
**Verified Assumptions section:** present

## 0. Coverage enumeration

| # | Item | Disposition |
|---|---|---|
| 1 | Background section | ok — factual framing, no rules/claims to break |
| 2 | Scope (in/out list) | ok — cross-checked against Design sections 1–6; all in-scope items have a corresponding Design subsection; out-of-scope items match "Known issues" |
| 3 | Design §1 Rename to `sessionstats` | ok — checked `known_marketplaces.json` (directory-source, confirmed) and `plugin.json`/`stats-parser.ts` FILE_HEADER as the only hardcoded-name sites (grepped `cc-session-track` across `src/`, `hooks/`, root `*.json` — only those two plus README/docs hit) |
| 4 | Design §2 Extract `git-analysis.py` → `gitanalysis` | ok — out of `cc-session-track`'s codebase entirely (lives in `claude-sessions`), no dependents to trace in this repo |
| 5 | Design §3 Port `claude-metrics.py` engine, drop `claudeTime`, add new stats | → §1 / §2.1 (see below) |
| 6 | Design §4 `.sessionstats/` folder, JSON source of truth, `session_stats.md` as "rendered view only... just sourced from JSON rows instead of parsed CSV lines" | → §2.1 (rendering claim doesn't hold as stated) |
| 7 | Design §5 Tagging + cross-project report | ok — scan mechanism (`scanRoots`, default `~/Projects`) and per-project `.sessionstats/` discovery fully specified; no unaddressed producer of "tag" other than project config |
| 8 | Design §6 Web posting (config + data contract only) | ok — explicitly no HTTP call in this phase; data contract reuses the §4 JSON row shape, which is itself covered by finding §2.1's fix |
| 9 | Rule: SessionRow schema — `model`/`cost`/`tokens`/`claudeTime` (flat) → `models[]` (nested), `claudeTime` dropped | Both directions checked. Over-inclusion (something now included that shouldn't read the old shape): n/a. Under-inclusion (existing consumers not migrated to new shape): **found** — `orphan-detector.ts` and `formatters.ts` still construct/read the old flat fields; see §2.1 |
| 10 | Rule: `.gitignore` append (`.sessionstats/` appended only if `.gitignore` already exists) | ok — self-contained, no dependents |
| 11 | Data-flow arrow: SessionStart hook → `.sessionstats/session_stats.json` (write) → SessionEnd hook `findStartRow`-equivalent (read) | ok — both sides operate on the same new JSON row shape as defined by §4; no persisted-shape mismatch since both ends are being rewritten together |
| 12 | Data-flow arrow: transcript JSONL (`HookInput.transcript_path`) → token-engine parse → per-model breakdown | ok — verified real transcript JSONL has no per-turn timing field (`message.diagnostics` only carries `cache_miss_reason`) and does have `usage`/`model` per assistant entry, matching what the engine needs |
| 13 | Data-flow arrow: `.sessionstats/session_stats.json` (write, new schema) → `session_stats.md` render (read) via `formatters.ts` | → §2.1 — persistence-boundary arrow; the consuming operations (`formatTerminalOutput`, `formatMarkdownOutput`) require `row.cost`, `row.tokens`, `row.model`, `stats.totals.totalClaudeTime` — none of which exist in the artifact §4 defines |
| 14 | Data-flow arrow: `.sessionstats/session_stats.json` → `/sessionstats_report` cross-project aggregation | ok — new command, no existing consumer contract to violate |
| 15 | Producer sweep for "writers of `session_stats.md` at the project root" (eligibility: any code path other than the hooks that writes this file) | → §3.1 — found two additional producers not covered by the spec: `commands/start_session.md` and `commands/end_session.md`, legacy LLM-driven commands that append free-text lines directly to `session_stats.md`, independent of the hook/JSON pipeline |
| 16 | Verified-assumptions cross-check | → §1 |

## 1. Verified-assumptions cross-check

- "Hook scripts are built from `src/`..." — still holds (fresh read of `hooks/hooks.json`, `plugin/scripts/*.js` matches).
- "`session_stats.md` path is a simple parameter..." — still holds.
- "`HookInput.cwd` is the project root" — still holds.
- "`git config user.email` resolves..." — still holds (environment fact, not code-dependent).
- "Plugin installed via directory-source marketplace..." — still holds.
- "No per-turn processing-duration data exists in transcript JSONL" — still holds.
- **"Nothing outside `stats-parser.ts`/`stats-writer.ts`/`formatters.ts` reads the flat `cost`/`tokens` fields" — FAILED.** Fresh grep across `src/` and `tests/` (`grep -rn "\.claudeTime\|\.cost\b\|\.tokens\b\|row\.model\|totalClaudeTime\|totalTokens\|totalCost"`) shows `src/lib/orphan-detector.ts:34` constructing a `SessionRow` with `model: startRow.model` (plus `cost: null`, `tokens: null`, `claudeTime: null` inline in the same object literal, lines 29–38), and `src/lib/formatters.ts` reading `row.cost`, `row.tokens`, `row.model` (lines 90, 129–131) and `stats.totals.totalClaudeTime`/`totalCost`/`totalTokens` (lines 75–77, 116–118). The assumption's own scope named exactly three files; a fourth and fifth exist.
- "`claude-metrics.py`'s JSONL parsing logic uses only Python stdlib" — still holds.
- "Docs/plans convention is `docs/plans/*.md`" — still holds.

**Span check:** the failed assumption above is the only uncovered dependency found; no additional gap beyond what's captured in §2.1 and §3.1.

## 2. Literal-wrongness findings

### 2.1 — Dropping flat `model`/`cost`/`tokens`/`claudeTime` breaks `orphan-detector.ts` and `formatters.ts`, contradicting the spec's own "rendered view, just resourced from JSON" claim

**Description:** Design §3 states `claudeTime` is dropped and per-model breakdown replaces the flat `model`/`cost`/`tokens` fields. Design §4 states `session_stats.md` "becomes a rendered view only... same terminal/markdown formatting `formatters.ts` already produces, just sourced from JSON rows instead of parsed CSV lines" — i.e., the claim is that `formatters.ts` needs no rework, only a different data source. Neither of these is true against the actual dependents:

- `src/lib/orphan-detector.ts:29-38` constructs an "END" `SessionRow` for closing orphaned sessions using `model: startRow.model`, `cost: null`, `tokens: null`, `claudeTime: null` — all fields removed/restructured by §3/§4. Under the new schema this object literal doesn't typecheck and, even if patched ad hoc, produces a row that violates the new schema.
- `src/lib/formatters.ts` — `formatTerminalOutput` (line 90) and `formatMarkdownOutput` (lines 129–131) read `row.cost`, `row.tokens`, `row.model` directly per row; both functions also read `stats.totals.totalClaudeTime`/`totalCost`/`totalTokens` (lines 75–77, 116–118), which come from `StatsFileTotals` (`src/types/index.ts:47-49`) — a type that still declares `totalClaudeTime` even though the field it aggregates is being dropped entirely.
- The asked-for behavior — a `.sessionstats/session_stats.json` conforming to the new per-model schema, rendered to `session_stats.md` via the existing formatting functions "just resourced from JSON" — is literally not achievable without rewriting `formatters.ts`'s row/total access to aggregate across `models[]`, and without deciding what happens to `totalClaudeTime` (drop it from `StatsFileTotals` too, since nothing produces it anymore).

**Proposed fix:** Extend Design §3/§4 to explicitly include `orphan-detector.ts` and `formatters.ts` (plus `StatsFileTotals` in `src/types/index.ts`) as dependents requiring rework: orphan-closing must build a row with `models: []` (or omit models/mark abnormal) instead of the flat fields, and `formatters.ts`'s two render functions plus `computeTotals`-equivalent logic must sum across each row's `models[]` array for per-row and aggregate cost/tokens, with `totalClaudeTime` removed from `StatsFileTotals` and both render functions. This is a spec-level correction (naming the actual dependent set), not merely an implementation detail — the current spec text asserts these areas need no change, and that assertion is what's false.

## 3. Forced decisions

### 3.1 — Legacy `/start_session` and `/end_session` commands are a second, incompatible writer of `session_stats.md`; the spec doesn't say what happens to them

**The choice:** `commands/start_session.md` and `commands/end_session.md` are pre-existing, LLM-driven slash commands (not superseded/removed when hooks were added) that instruct Claude to directly append free-text lines to `session_stats.md` at the **project root** — a format like `[project] session, Start Time: ..., Model: ...` — entirely independent of `stats-writer.ts`/the hook pipeline, and targeting the old root-level path rather than `.sessionstats/`.

**Why it's forced:** Design §4 states `session_stats.md` "becomes a rendered view only... regenerated from the JSON (not hand-appended)." If these two commands remain unchanged, they (a) still write to the wrong location (project root, not `.sessionstats/`) and (b) hand-append arbitrary text in a format incompatible with the new JSON-sourced render, which the next hook-triggered regeneration would either conflict with or silently discard. The spec must pick one of:
- **Delete** `commands/start_session.md` and `commands/end_session.md` — hooks fully automate this now, and the manual format duplicates/conflicts with the automated one.
- **Keep and rewrite** them to write into `.sessionstats/session_stats.json` using the new schema (for users who want a manual override path), consistent with how `/session_setup` and `/sessionstats_report` are specified.

**Options:** as listed above; the spec currently contains neither, and the commands exist in the codebase today (verified: both files present and unmodified from the pre-hook manual-tracking era).

## 5. Recommendation

🛑 **Surface forced decisions to user** — §2 and §3 are both non-empty.
