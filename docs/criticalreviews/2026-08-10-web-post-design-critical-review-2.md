# Critical Design Review: 2026-08-10-web-post-design (Round 2)

**Spec:** `/Users/Keith.MacKay/Projects/sessionstats/docs/plans/2026-08-10-web-post-design.md`
**Verified Assumptions section:** present

## 0. Coverage enumeration

| # | Item | Disposition |
|---|---|---|
| 1 | Background | ok — unchanged, no new claims |
| 2 | Design: `PluginConfig.apiKey` new field | ok — unchanged from round 1 |
| 3 | Design: `commands/sessionstats_config.md` extension | ok — unchanged |
| 4 | Design: `web-post.ts`'s `postSessionToWeb` (no-op guard, POST shape, timeout, error handling) | ok — unchanged |
| 5 | Design: wiring into `session-end.ts` | ok — unchanged |
| 6 | Design: **new** second wiring point into `session-start.ts` for orphan-closed sessions (round 1's fix) | ok — see detailed check below |
| 7 | Producer sweep: every producer of an END `SessionRow` (re-run fresh, not trusting round 1's count) | ok — `grep -rn "event: 'END'" src/ scripts/` still returns exactly 2 hits (`session-end.ts:34`, `orphan-detector.ts:26`), both now covered by the design |
| 8 | New rule: `session-start.ts` passes `projectName` (freshly computed for the current invocation) rather than `orphan.project` (the original START row's project) to `postSessionToWeb` | ok — both values originate from `path.basename(cwd)` for the same project directory (`detectAndCloseOrphans` only ever reads that one project's `statsPath`), and this matches the existing pattern already accepted in round 1 for `session-end.ts` (which likewise passes `projectName`, not `endRow.project`) — not a new inconsistency |
| 9 | New rule: orphans posted with *current* `config.tags`, not tags-as-of-when-the-orphaned-session-actually-ran | dropped — the design makes no claim about tag-history fidelity anywhere, and the primary `session-end.ts` path already has this identical property (uses `config.tags` at post-time) which round 1 didn't flag; not a new gap introduced by this fix, and not contradicted by anything the spec promises |
| 10 | Known issues / deferred | ok — unchanged |
| 11 | Review history | ok — accurately describes round 1's finding and fix |
| 12 | Span check (verified-assumptions coverage) | span check found no uncovered dependency |

## 1. Verified-assumptions cross-check

All 6 listed assumptions still hold — no cited evidence changed since round 1's fresh re-verification; not re-litigated per the skill's rule against re-questioning settled items.

**Span check:** no uncovered dependency found. Round 1's gap (a second END-row producer with no posting path) is now covered — the producer sweep was re-run from scratch this round (not trusted from round 1) and confirms both producers are wired.

## 2. Literal-wrongness findings

No literal-wrongness findings.

## 3. Forced decisions

No forced decisions found.

## 4. Previously addressed

- Round 1 §2.1 (orphan-closed sessions never posted, even with `postToWeb: true`, because `orphan-detector.ts`'s END-row production bypassed the design's only wiring point) — resolved: `session-start.ts` now loops over `detectAndCloseOrphans`'s returned `closedOrphans` and posts each one via the same `postSessionToWeb` function, gated on the same `config.postToWeb` check. Re-verified independently this round via a fresh producer-sweep grep (not reused from round 1).

## 5. Recommendation

✅ **Approve as-is** — §2 and §3 are both empty. Spec is ready for implementation planning.
