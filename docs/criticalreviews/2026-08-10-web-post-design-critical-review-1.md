# Critical Design Review: 2026-08-10-web-post-design (Round 1)

**Spec:** `/Users/Keith.MacKay/Projects/sessionstats/docs/plans/2026-08-10-web-post-design.md`
**Verified Assumptions section:** present

## 0. Coverage enumeration

| # | Item | Disposition |
|---|---|---|
| 1 | Background | ok — factual framing, no claims to break |
| 2 | Design: `PluginConfig.apiKey` new field | ok — additive optional field, matches spec's own verified-assumption re: `loadPluginConfig`'s merge tolerating new fields |
| 3 | Design: `commands/sessionstats_config.md` extension | ok — text-only instruction change, no code dependents |
| 4 | Design: `web-post.ts`'s `postSessionToWeb` — no-op guard when `apiKey`/`websiteUrl` missing | ok — both directions checked: correctly no-ops when either is absent (checked over-inclusion: won't fire with partial config; under-inclusion: fires whenever both are present, no missed case) |
| 5 | Design: `web-post.ts`'s POST body shape `{apiKey, project, tags, sessions: [row]}` | ok — matches `sessionstats-web`'s `app/api/sessions/route.ts` exactly (spec's own verified assumption, re-confirmed on fresh read) |
| 6 | Design: wiring into `session-end.ts` after `appendRow` succeeds, gated on `config.postToWeb` | ok — the call site itself is correctly placed and gated |
| 7 | **Eligibility/producer sweep: every producer of an END `SessionRow` in this codebase** | → §2.1 — found a second producer (`orphan-detector.ts`) the design never mentions |
| 8 | Known issues / deferred (no retry/queueing) | ok — consistent with prior established precedent in this project, not re-litigated |
| 9 | Span check (verified-assumptions coverage) | span check found no uncovered dependency beyond the producer-sweep gap already captured in row 7 |

**Producer sweep detail** (per the skill's rule: enumerate every producer of the eligibility class the spec's rule fires on — here, "an END `SessionRow` that should be posted when `postToWeb` is true"):

```
grep -rn "event: 'END'" src/
  src/hooks/session-end.ts:34   ← covered by the spec's wiring
  src/lib/orphan-detector.ts:26 ← NOT covered by the spec
```

## 1. Verified-assumptions cross-check

All 6 listed assumptions still hold on a fresh re-check:
- Node `fetch` availability — `node --version` re-run, still v26.7.0; `engines.node >= 18.0.0` unchanged in `package.json`.
- `loadPluginConfig`'s merge tolerance — `src/lib/plugin-config.ts` unchanged, still `{...defaults(), ...JSON.parse(...)}`.
- `PluginConfig`/`loadPluginConfig` consumer count — re-grepped, still only `src/lib/plugin-config.ts` and `src/types/index.ts`.
- `report.ts`'s raw-`fs` read of `scanRoots` (not via `loadPluginConfig`) — `src/scripts/report.ts:97-99` unchanged.
- `session-end.ts`'s current shape (`void config;` placement) — unchanged, confirmed at the same location.
- `sessionstats-web`'s `POST /api/sessions` payload shape — `app/api/sessions/route.ts` unchanged, still `{apiKey, project, tags, sessions}`.

**Span check:** one uncovered dependency found (see row 7 above) — the spec verifies that `session-end.ts` is the right wiring point, but never verifies (or even states) that it's the *only* place an END row is produced. That's exactly the kind of dependents-direction gap the span check exists to catch: a design dependency ("wiring the one place END rows are created is sufficient") that no listed assumption actually confirms. Verified in-round via the grep above — the claim of sufficiency is false. See §2.1.

## 2. Literal-wrongness findings

### 2.1 — Orphan-closed sessions never get posted to the web, even when `postToWeb` is true

**Description:** The design's stated outcome is "when a project's `postToWeb` is `true`, its session data actually gets sent" (Background). But `src/lib/orphan-detector.ts:9-38` (`detectAndCloseOrphans`) is a second, independent producer of END `SessionRow`s — it auto-closes crashed/orphaned sessions (START with no matching END) and calls `appendRow` directly, writing an END row with `flags: '[Abnormal End]'`. This function is called from `src/hooks/session-start.ts:19-24`, entirely bypassing `session-end.ts`. The design only wires `postSessionToWeb` into `session-end.ts`'s success path — `detectAndCloseOrphans`'s own `appendRow` call has no equivalent. As specified, any project with `postToWeb: true` that has a crashed/orphaned session will record that session locally but silently never send it to the website — the asked-for "its session data actually gets sent" is false for this real, already-exercised code path (orphan detection already exists and fires on every `SessionStart`, not a hypothetical).

**Evidence:**
- `src/lib/orphan-detector.ts:9` — `export function detectAndCloseOrphans(filePath: string): SessionRow[]` — takes only a file path, no config/project-name parameters, and calls `appendRow(filePath, endRow)` at line 36 with no posting step.
- `src/hooks/session-start.ts:19-24` — the only call site, inside `sessionStartHook`, which already has `config` (loaded at line 15, includes `.tags`/`.postToWeb`) and `projectName` (line 13) in scope at the call site.
- `grep -rn "event: 'END'" src/` — confirms exactly two producers, only one covered by the design.

**Proposed fix:** Extend the design's wiring section to also cover `session-start.ts`'s orphan-closing path, using the same `postSessionToWeb` function (no new module needed — the fix reuses the already-designed function). Two concrete options, since `detectAndCloseOrphans` currently doesn't have access to `project`/`tags`:
- **(a)** Pass `projectName` and `config.tags` into `detectAndCloseOrphans` as new parameters, and inside the function, after each `appendRow(filePath, endRow)`, call `if (config.postToWeb) await postSessionToWeb(endRow, projectName, tags)` for each closed orphan (mirrors `session-end.ts`'s pattern exactly).
- **(b)** Keep `detectAndCloseOrphans`'s signature unchanged (it already returns `closedOrphans: SessionRow[]`), and in `session-start.ts` — which already has `config`/`projectName` in scope — loop over the returned `closedOrphans` after the existing `try/catch` and call `postSessionToWeb` for each one if `config.postToWeb` is true.

Option (b) is smaller (no signature change to `orphan-detector.ts`, no new parameters to thread through) and keeps `detectAndCloseOrphans` free of web-posting concerns, consistent with its current single responsibility (detect + locally record). Recommend (b), but this is the spec author's call to make explicit before implementation.

## 3. Forced decisions

No forced decisions found.

## 5. Recommendation

⚠️ **Approve with literal-wrongness fixes** — §2 is non-empty, §3 is empty.
