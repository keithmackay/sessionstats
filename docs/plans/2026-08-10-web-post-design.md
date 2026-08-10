# sessionstats plugin — Web posting implementation

Date: 2026-08-10
Status: Revised after critical-design-review round 1 — ready for implementation planning

## Background

`sessionstats` (the Claude Code plugin) already has a `postToWeb` flag per project and a `websiteUrl` field in plugin-level config, both currently inert — the original design spec (`2026-08-09-sessionstats-rebuild-design.md`, Design §6) deliberately deferred the actual HTTP upload to a later phase. `sessionstats-web` (the companion website, `~/Projects/sessionstats-web`) now exists and its `POST /api/sessions` endpoint is live, tested, and unchanged since design. This spec implements the deferred upload: when a project's `postToWeb` is `true`, its session data actually gets sent.

## Design

**New field**: `PluginConfig` (`src/types/index.ts`) gains `apiKey: string | null` alongside the existing `websiteUrl`/`scanRoots`. One developer account → one API key, shared across all projects on this machine — same placement rationale as `websiteUrl`.

**`commands/sessionstats_config.md`**: extended to prompt for `apiKey` (shown on the website's `/report` page) alongside the existing `websiteUrl`/`scanRoots` prompts.

**New module** `src/lib/web-post.ts`:

```typescript
export async function postSessionToWeb(row: SessionRow, project: string, tags: string[]): Promise<void>
```

- Reads plugin config; no-ops immediately (no error) if `apiKey` or `websiteUrl` is missing.
- POSTs `{ apiKey, project, tags, sessions: [row] }` (batch-of-one) to `${websiteUrl}/api/sessions`, using Node's built-in `fetch` — no new dependency (confirmed available: Node v26.7.0 running, `engines.node >= 18.0.0` in `package.json`, and `fetch` has been global since Node 18).
- 5-second timeout via `AbortController`.
- Catches all errors (network failure, timeout, non-2xx response) and logs to stderr only — never throws, matching the hook's existing "never block tracking" error pattern (e.g. `session-end.ts`'s existing try/catch around `appendRow`).

**Wiring** (`src/hooks/session-end.ts`): after `appendRow(statsPath, endRow)` succeeds, replace the current `void config;` placeholder with:
```typescript
if (config.postToWeb) {
  await postSessionToWeb(endRow, projectName, config.tags);
}
```
START rows are never posted — the website's report only aggregates `END` rows (per `sessionstats-web`'s `lib/session-record-aggregation.ts`, which filters to `event === 'END'`), so posting START rows would add cost/token-less noise with no reporting value.

**Second wiring point — orphan-closed sessions** (`src/hooks/session-start.ts`, resolved forced-decision from critical-design-review round 1): `src/lib/orphan-detector.ts`'s `detectAndCloseOrphans` is a second, independent producer of END `SessionRow`s (auto-closes crashed sessions with `flags: '[Abnormal End]'`), called from `session-start.ts` and bypassing `session-end.ts` entirely. Without also wiring this path, a crashed session in a `postToWeb`-enabled project would be recorded locally but never sent to the website. `detectAndCloseOrphans`'s signature is left unchanged (keeps it free of web-posting concerns, consistent with its current single responsibility) — instead, `session-start.ts` (which already has `config`/`projectName` in scope at the call site) loops over the function's existing return value:

```typescript
const closedOrphans = detectAndCloseOrphans(statsPath);
if (closedOrphans.length > 0) {
  console.error(`[sessionstats] Closed ${closedOrphans.length} orphaned session(s)`);
  if (config.postToWeb) {
    for (const orphan of closedOrphans) {
      await postSessionToWeb(orphan, projectName, config.tags);
    }
  }
}
```
This replaces the existing `if (closedOrphans.length > 0) { console.error(...) }` block in `sessionStartHook`, adding the posting loop inside it using the same `postSessionToWeb` function already designed above — no new module needed.

No changes needed on the website side — `POST /api/sessions` already accepts exactly this payload shape (`app/api/sessions/route.ts`, unchanged).

## Verified assumptions

| Assumption | Verification |
|---|---|
| Node's built-in `fetch` is available without a new dependency | `node --version` → v26.7.0; `package.json` `engines.node: ">=18.0.0"`; `fetch` has been a Node global since v18 |
| `loadPluginConfig`'s merge pattern (`{...defaults(), ...JSON.parse(...)}`) tolerates a new field without breaking existing callers | Read `src/lib/plugin-config.ts` — confirmed; also confirmed only 2 files reference `PluginConfig`/`loadPluginConfig` at all (`src/lib/plugin-config.ts` itself, `src/types/index.ts`), so no other consumer can break |
| `src/scripts/report.ts` doesn't consume `PluginConfig` in a way a new field could break | Read `report.ts:97-99` — reads the config file via raw `fs`/`JSON.parse` for `scanRoots` only, doesn't go through `loadPluginConfig()` or destructure the whole object — unaffected by an added field |
| `session-end.ts`'s exact current shape, to know where to splice in the new call | Read the full file — confirmed `void config;` sits exactly where `config.postToWeb`/`config.tags` are meant to be used, right after the local `appendRow` |
| `sessionstats-web`'s `POST /api/sessions` still accepts exactly `{apiKey, project, tags, sessions: SessionRow[]}`, unchanged since its own design | Read `~/Projects/sessionstats-web/app/api/sessions/route.ts` — confirmed unchanged |
| No existing HTTP/fetch helper in this codebase to reuse instead of a new module | `grep -rn "fetch(\|http\.request\|https\.request\|axios" src/` — zero matches |

## Known issues / deferred

- No retry/queueing for failed posts (best-effort only, matches the original design's explicit deferral of this in `2026-08-09-sessionstats-rebuild-design.md`'s Known Issues section). If a post fails, the session is still recorded locally (source of truth) and simply never reaches the website — accepted as out of scope, consistent with prior precedent in this project.

## Review history

- **critical-design-review round 1** (`docs/criticalreviews/2026-08-10-web-post-design-critical-review-1.md`): found the design only wired `session-end.ts`, missing a second END-row producer (`orphan-detector.ts`, via `session-start.ts`) — meaning crashed sessions would never post to the web even with `postToWeb: true`. Resolved above — `session-start.ts` now also posts each closed orphan, reusing `postSessionToWeb`.
