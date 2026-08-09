# Critical Design Review: 2026-08-09-sessionstats-rebuild-design (Round 2)

**Spec:** `/Users/Keith.MacKay/Projects/cc-session-track/docs/plans/2026-08-09-sessionstats-rebuild-design.md`
**Verified Assumptions section:** present

## 0. Coverage enumeration

| # | Item | Disposition |
|---|---|---|
| 1 | Background | ok — unchanged from round 1, no new claims |
| 2 | Scope (now 7 items incl. new §7 deletion) | ok — each item maps to a Design subsection; out-of-scope list unchanged and still consistent |
| 3 | Design §1 Rename | ok — unchanged from round 1, previously verified |
| 4 | Design §2 Extract `git-analysis.py` | ok — unchanged |
| 5 | Design §3 Token engine port | ok — unchanged, previously verified against real transcript JSONL |
| 6 | Design §4 dependents rework (`formatters.ts`, `orphan-detector.ts`, totals) | ok — this is round 1's §2.1 fix; fresh read of the new spec text confirms both files are now explicitly named with the correct required change (sum across `models[]`, drop `totalClaudeTime`) — resolved, not re-raised |
| 7 | Design §4 `/session_tags` command (new) | ok — narrower scope than `/session_setup`, edits only `tags`; no consumer contract broken since it writes the same `config.json` shape §4 already defines |
| 8 | Design §4 `tags` array + "contains" semantics | ok — no over/under-inclusion issue found: array membership check is unambiguous, no reserved-prefix parsing to get wrong |
| 9 | Design §5 report command, `scanRoots` default `~/Projects` | → §3.1 (see below) — scan target and the actual on-disk state of `~/Projects` diverge |
| 10 | Design §6 Web posting | ok — unchanged, still explicitly data-contract-only |
| 11 | Design §7 Delete legacy commands | ok — this is round 1's §3.1 resolution; matches the forced decision as resolved (deletion), consistent with Scope item 7 |
| 12 | Producer sweep: "what already exists on disk at the locations this design reads from or writes to" | → §1 span check / §3.1 — found ~70 pre-existing root-level `session_stats.md` files across `~/Projects/*` with real accumulated historical rows, none accounted for by the migration |
| 13 | Verified-assumptions cross-check | → §1 |

## 1. Verified-assumptions cross-check

All 8 live assumptions (the struck-through one is round-1 history, not re-verified) still hold under a fresh read:
- Hook build/`${CLAUDE_PLUGIN_ROOT}` wiring — still holds.
- `session_stats.md` path is a simple parameter — still holds (the design supersedes the value, not the fact that it was easy to repoint).
- `HookInput.cwd` is project root — still holds.
- `git config user.email` resolves — still holds.
- Directory-source marketplace — still holds.
- No per-turn timing data in transcript JSONL — still holds.
- `claude-metrics.py` stdlib-only — still holds.
- `docs/plans/*.md` convention — still holds.

**Span check:** one uncovered dependency found. The spec verifies facts about the *codebase* (hooks, parsers, formatters) but never checks the *state already on disk* at the locations Design §4/§5 write to and scan. Verified directly: `find ~/Projects -maxdepth 2 -iname "session_stats.md"` returns **70 files**, ranging from 6 to 118 lines each, all containing real historical `SessionRow` CSV data written by the currently-installed `cc-session-track` hooks (including the plugin's own repo — its root `session_stats.md` has 8 rows of real data). This dependency is verifiable (not a "grep can't verify" case) and is addressed as a forced decision in §3.1, per the span-check rule that an uncovered dependency must not remain §1-only.

## 2. Literal-wrongness findings

No literal-wrongness findings. (The historical-data question below is a forced decision, not an asked-for behavior the spec claims and breaks — the spec never claims migration happens, so there's no false claim to fail against; it's an unpicked choice.)

## 3. Forced decisions

### 3.1 — ~70 projects have pre-existing, real `session_stats.md` history at the old root-level location; the spec doesn't say what happens to it

**The choice:** Design §4 moves session output from `<project root>/session_stats.md` to `.sessionstats/session_stats.json`, and Design §5's `/sessionstats_report` scans for `.sessionstats/` folders (which won't exist yet anywhere). Verified on disk: `~/Projects/*/session_stats.md` exists in ~70 projects today (`cc-session-track` itself, `modelrouter` with 118 rows, `dujour` with 80, `snapabrick` with 63, etc.) — real, already-accumulated cost/token/duration history from the currently-installed hooks. None of this is read, migrated, or referenced anywhere in the spec.

**Why it's forced:** This directly bears on the stated goal driving this whole redesign — "insuring accurate token usage reporting... to see work from many different projects" and capturing "the actual token usage within a project... across different sessions." As written, the day this ships, every one of those 70 projects' historical totals becomes invisible to both the rendered `session_stats.md` view (now regenerated from an empty `.sessionstats/session_stats.json` until the project is next visited) and to `/sessionstats_report`'s cross-project aggregation (which only scans `.sessionstats/` folders that don't exist yet). The spec must pick one of:
- **One-time migrate**: on first `SessionStart` after upgrade, if `.sessionstats/session_stats.json` doesn't exist but a root `session_stats.md` does, parse the old CSV rows and seed the new JSON file with best-effort converted data (no per-model breakdown available for that historical data, only the old flat `cost`/`tokens`/`model` — would need a clearly-marked "legacy" shape or partial-data flag).
- **Leave both files coexisting**: old `session_stats.md` stays as a historical record at the root, untouched; new tracking starts fresh in `.sessionstats/` with no continuity. Simpler, but breaks the "across different sessions" continuity goal for every project with existing history.
- **Explicitly accept the loss**: document in the spec that historical pre-migration data is out of scope / accepted as lost, so it's a documented decision rather than a silent gap.

**Options:** as listed above; the spec currently contains none of them.

## 4. Previously addressed

- Round 1 §2.1 (`formatters.ts`/`orphan-detector.ts` rework claimed unnecessary but actually required) — resolved: Design §4 now explicitly names both files and the required change (sum across `models[]`, drop `totalClaudeTime` from `StatsFileTotals` and both render functions).
- Round 1 §3.1 (legacy `/start_session`/`/end_session` commands, unaddressed second writer) — resolved: Design §7 deletes both commands outright, consistent with the automated/failsafe-tracking goal.

## 5. Recommendation

🛑 **Surface forced decisions to user** — §3 is non-empty.
