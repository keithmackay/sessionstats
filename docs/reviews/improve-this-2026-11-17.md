# improve-this review: sessionstats (2026-11-17)

## How this review was run

- **Skill:** `improve-this` (evaluates and reports only; no project files were changed)
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Scope:** the whole repository at commit `9830f71`: code (`src/`, `scripts/`), tests (`tests/unit/`), committed build output (`plugin/`), command files (`commands/`), `help.md`, README, CHANGELOG/CONTRIBUTING, `docs/`, and the agent instruction files (`CLAUDE.md`, `AGENTS.md`).
- **Non-interactive run:** this ran as a Snugban task, so Step 3 (asking the user to confirm the categories) and Step 6 (asking whether to save or plan) were not interactive. The proposed categories below were used as-is. The report was saved to the path the task gave (`docs/reviews/improve-this-2026-11-17.md`) instead of the skill's default path. No implementation plan was written.
- **Rubric files were not available:** reading `references/skill-rubric.md`, `references/readme-rubric.md` and `references/agent-instructions-rubric.md` was denied in this session. The Skill Effectiveness, README Quality and Agent Instructions sections therefore use general criteria (accuracy, completeness, actionability, internal consistency), not the skill's written rubrics.
- **Checks run:** `npm ci` followed by `npx vitest run`: 10 files and 57 tests, all passing. I bundled each `src/` entry point with esbuild into a scratch directory under the gitignored `node_modules/` and diffed the results against `plugin/scripts/`. All five scripts match, and `commands/` and `help.md` match their `plugin/` copies.

## Step 1: Scope

The whole repository: code, tests, docs, README and agent instruction files.

## Step 2: Project type and artifacts

**Inferred type:** a Claude Code **plugin**, which is a Node/TypeScript CLI hook package. `SessionStart`/`SessionEnd` hooks (`hooks/hooks.json` → `plugin/scripts/*.js`, bundled from `src/hooks/*.ts` by esbuild) write per-project usage rows to `.sessionstats/session_stats.json`. Slash-command markdown files in `commands/` drive interactive configuration and reporting. There are no runtime dependencies. Tests use Vitest.

**Artifacts present:**
- **Skill/command files:** 8 command `.md` files with frontmatter (`commands/`, mirrored in `plugin/commands/`), plus plugin manifests `.claude-plugin/plugin.json` and `plugin/.claude-plugin/plugin.json`
- **README:** `README.md` (281 lines)
- **Agent instruction files:** `CLAUDE.md` (169 lines) and `AGENTS.md` (a heading only)

**Claims inventory (mismatches found):**

| Claim | Where | Reality |
|---|---|---|
| "73 unit tests" | README.md:228 | 57 tests in 10 files |
| `extract-prompts` CLI script | README.md:242, docs/specs/…compaction…:56 | No such file in `src/scripts/` |
| `/build_story` command | CHANGELOG.md:30 | No `commands/build_story.md` |
| Version | `.claude-plugin/plugin.json` = 1.1.0 | `package.json`, `plugin/package.json` and `plugin/.claude-plugin/plugin.json` all say 1.0.0 |
| `/sessionstats:version` command | commands/version.md | Missing from help.md and the README command table |
| `postToWeb` is an "intent flag for a future posting feature" | README.md:119, commands/session_setup.md:14 | Posting is implemented (`src/lib/web-post.ts`, called from both hooks) |
| `session_stats.json` holds "running totals" | README.md:120 | The writer stores only `{schemaVersion, rows}` (stats-writer.ts:21); totals are computed when read (README.md:144 says so too) |
| `session_stats.md` "gets rewritten whenever stats change" | README.md:121 | It is rewritten only when `/session_stats` runs (show-stats.ts:27) |
| Terminal output example (`1h 15m`, model column) | README.md:74-75 | The formatter prints `HH:MM:SS` and no model column (formatters.ts:68) |
| Pricing table (3 models) | README.md:189-193 | The code has 4 entries, including `claude-opus-4-6` (pricing.ts:20) |
| "see [Posting to a Website] above for the full payload shape" | README.md:216 | No payload shape is documented anywhere |
| Docs name the project `cc-session-track` and reference ccusage | DEPLOYMENT_GUIDE, IMPLEMENTATION_PLAN, PHASES_SUMMARY, TESTING_GUIDELINES, BUILD_STORY, build-hooks.js:23 | The project is `sessionstats`, and ccusage was removed |

## Step 3: Categories used

1. **Calculation Accuracy** (cost, token and session counts are the product)
2. **Clarity & Simplification** (code)
3. **Test Coverage & Quality**
4. **Security**
5. **Code Efficiency & Scalability**
6. **Accuracy & Consistency** (docs, command files, manifests)
7. **Skill Effectiveness** (command `.md` files)
8. **Token Efficiency & Progressive Disclosure** (command files)
9. **README Quality**
10. **Agent Instructions** (`CLAUDE.md`, `AGENTS.md`)

*(Confirmation was skipped because the run was non-interactive. See "How this review was run".)*

---

## Part 1: Priority list

```
#1  [Impact: High   | Confidence: High]   Calculation Accuracy — Current models (claude-sonnet-5, claude-opus-5, …) are priced at the legacy Opus-4 fallback ($15/$75)
#2  [Impact: High   | Confidence: High]   Calculation Accuracy — Every compaction, and any concurrent session in the same project, gets closed as a spurious [Abnormal End]
#3  [Impact: High   | Confidence: High]   Calculation Accuracy — userMessages counts tool_result entries, not just user prompts
#4  [Impact: High   | Confidence: Medium] Calculation Accuracy — Pricing for existing table entries looks out of date (Opus 4.5/4.6, Haiku 4.5)
#5  [Impact: High   | Confidence: Medium] Calculation Accuracy — Assistant entries are not de-duplicated by message ID, which can inflate tokens, cost and apiMessages
#6  [Impact: High   | Confidence: High]   Test Coverage — Importing report.ts runs the real report against ~/Projects during the test run
#7  [Impact: High   | Confidence: Medium] Skill Effectiveness — The setup-confirmation prompt goes to stderr, which the model likely never sees
#8  [Impact: Medium | Confidence: High]   Accuracy & Consistency — The config command writes a literal "~/Projects" that report.ts never expands
#9  [Impact: Medium | Confidence: High]   README Quality — Many stale or incorrect README claims (test count, extract-prompts, posting "future", output sample, totals)
#10 [Impact: Medium | Confidence: High]   Agent Instructions — CLAUDE.md has no project-specific content, and AGENTS.md is empty
#11 [Impact: Medium | Confidence: High]   Test Coverage — Hooks, CLI scripts and transcript-dir have no tests
#12 [Impact: Medium | Confidence: High]   Accuracy & Consistency — Version drift across manifests (1.1.0 vs 1.0.0); CHANGELOG is malformed and has no 1.0.0 entry
#13 [Impact: Medium | Confidence: High]   Clarity & Simplification — Duplicated logic: time helpers, model aggregation, plugin-config loading, build loops
#14 [Impact: Medium | Confidence: High]   Accuracy & Consistency — Stale docs under docs/ (cc-session-track, ccusage, Playwright/"habit" template) are linked from the README
#15 [Impact: Medium | Confidence: High]   Calculation Accuracy — Rows and web posts use basename(cwd), not the configured projectName
#16 [Impact: Medium | Confidence: Medium] Skill Effectiveness — version.md and help.md point at plugin-relative files with no ${CLAUDE_PLUGIN_ROOT}
#17 [Impact: Medium | Confidence: Medium] README Quality — The "multi-user, git merge-friendly" claim contradicts the auto-gitignored .sessionstats/
#18 [Impact: Medium | Confidence: Medium] Calculation Accuracy — Transcript-dir encoding only handles "/" and "."; Windows paths break rebuild (README claims cross-platform)
#19 [Impact: Medium | Confidence: Medium] Test Coverage — Intentional stderr in tests is not captured or asserted (CLAUDE.md requires pristine output)
#20 [Impact: Medium | Confidence: Medium] Code Efficiency — Non-atomic full-file rewrites can race between concurrent hooks
#21 [Impact: Medium | Confidence: Medium] Accuracy & Consistency — Compaction design/plan docs (2026-08-10/11) are not implemented, and nothing says so
#22 [Impact: Low    | Confidence: High]   Skill Effectiveness — Mixed command naming (/session_setup vs /sessionstats:session_setup)
#23 [Impact: Low    | Confidence: High]   Clarity & Simplification — Garbled first paragraph in session_setup.md
#24 [Impact: Low    | Confidence: High]   Security — apiKey stored with default file permissions and allowed over plain http
#25 [Impact: Low    | Confidence: High]   Clarity & Simplification — Config/stats parse errors outside try blocks in the hooks drop START/END rows
#26 [Impact: Low    | Confidence: High]   Accuracy & Consistency — ABOUTME convention: test files and build-hooks.js lack it; plugin-config.ts has 1 line
#27 [Impact: Low    | Confidence: Medium] Code Efficiency — Orphan detection is O(sessions × rows); rebuild parses every transcript twice
#28 [Impact: Low    | Confidence: Medium] Accuracy & Consistency — The role of plugin/ as a separate install root is ambiguous (its hooks.json paths assume the repo root)
#29 [Impact: Low    | Confidence: Medium] Clarity & Simplification — "<synthetic>" model rows show up in reports
#30 [Impact: Low    | Confidence: High]   Accuracy & Consistency — Personal .obsidian/ workspace state is committed
```

---

## Part 2: Categorized breakdown

### 1. Calculation Accuracy

**#1 Current models are priced at the Opus-4 fallback rate.** *Impact: High | Confidence: High*
- **Evidence:** `src/lib/pricing.ts:18-25` lists only `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-sonnet-4-5-20250929` and `claude-haiku-4-5-20251001`. Any other model falls back to `DEFAULT_PRICING` = `{ input: 15.00, output: 75.00, … }` (line 25). The test run's own output (see #6) shows real projects recorded under `claude-sonnet-5` and `claude-opus-5`, for example `tokentamer … claude-sonnet-5 cost:$107.60 tokens:55,042,948`.
- **Why:** Sonnet-tier usage priced at the Opus-4 fallback is overstated by about 5×, and every Claude 5-family model goes unrecognized. README.md:195 calls the fallback a safety net ("never silently under-reports"). In practice it means current-model costs are wrong by a large factor, and cost is the plugin's headline number.
- **Related:** the matcher `model.includes(key) || key.includes(model)` (pricing.ts:29) accepts a short or partial model string (for example `"claude"`) as a match for whichever entry comes first. That fails silently.

**#2 Compaction and concurrent sessions produce spurious `[Abnormal End]` rows.** *Impact: High | Confidence: High*
- **Evidence:** `hooks/hooks.json` registers `SessionStart` with the matcher `startup|clear|compact|resume`. `session-start.ts:20` always calls `detectAndCloseOrphans`, which closes *every* session that has a START and no END (`orphan-detector.ts:19`, `if (hasStart && !hasEnd)`). The repo's own spec says `session_id` stays the same across compaction (`docs/specs/2026-08-10-compaction-and-query-tracking-design.md`: "verified: `session_id` is stable").
- **Why:** On compaction, the SessionStart for the *current* session closes that same session as `[Abnormal End]`, then appends a second START. The session is then counted twice in `totals.sessions` and in the report's `sessions:` column, and gets a misleading crash flag. Likewise, opening a second Claude Code session in the same project closes the first, still-running session as abnormal. Its real END is later appended too, so one session ends up with two END rows. Orphan detection cannot tell "crashed" apart from "still running" or "compacted".

**#3 `userMessages` counts tool results.** *Impact: High | Confidence: High*
- **Evidence:** `src/lib/token-engine.ts:34`, `if (entry.type === 'user') { userMessages++; continue; }`.
- **Why:** Claude Code transcripts record every tool result as a `type: "user"` entry whose content is a `tool_result` block. As written, `userMessages` is roughly *prompts + tool calls*, not the number of prompts the user typed, and README.md:206 presents it as "user messages". The tests (token-engine.test.ts) don't include a tool_result-shaped user entry, so this isn't caught.

**#4 Pricing for existing entries looks out of date.** *Impact: High | Confidence: Medium*
- **Evidence:** `pricing.ts:19-22` prices Opus 4.5 and Opus 4.6 at $15/$75 and Haiku 4.5 at $0.80/$4. README.md:191-193 repeats these figures.
- **Why:** To my knowledge, Anthropic priced Opus 4.5 at $5/$25 per MTok and Haiku 4.5 at $1/$5. If so, historical Opus 4.5 rows are overstated by 3× and Haiku rows are understated. **Check against the current Anthropic pricing page before acting on this.** The table has no "last verified" date, so nobody can tell how fresh it is (README.md:197 admits it is a static snapshot).

**#5 No de-duplication of assistant entries.** *Impact: High | Confidence: Medium*
- **Evidence:** `token-engine.ts:38-60` adds `usage` for every `type: "assistant"` line and increments `apiMessages` (line 45). Nothing in the code references `message.id` or `requestId`.
- **Why:** Claude Code can split one API response (thinking, text and tool_use blocks) across several JSONL lines that share a `message.id` and repeat the same `usage` object. Summing every line then multiplies tokens and cost for that response, and `apiMessages` counts lines, not API calls. Other transcript analyzers de-duplicate on `message.id` plus `requestId` for this reason. **Confirm against a real multi-block transcript.** If confirmed, this inflates every cost figure the plugin reports.

**#15 Rows and web posts use the folder name, not the configured `projectName`.** *Impact: Medium | Confidence: High*
- **Evidence:** `session-start.ts:14` and `session-end.ts:16` use `const projectName = path.basename(input.cwd);`. `postSessionToWeb(endRow, projectName, …)` is called at session-end.ts:54. `report.ts:79`, however, uses `config.projectName`.
- **Why:** `/session_setup` invites the user to rename the project, but the rename never reaches the rows or the website. The local report and the website then disagree on project names. The test output also shows `moneymaker` listed twice, which suggests two folders share a name with nothing to tell them apart.

**#18 Transcript-directory encoding is incomplete.** *Impact: Medium | Confidence: Medium*
- **Evidence:** `src/lib/transcript-dir.ts:8`, `projectDir.replace(/[/.]/g, '-')`.
- **Why:** Windows paths (`C:\Users\…`) are not encoded at all, so `/sessionstats_rebuild` silently finds nothing there. README.md:18 claims "Works on Mac, Windows, and Linux". I believe Claude Code also replaces other non-alphanumeric characters (spaces, underscores), which would break rebuild for those paths on any OS. That part is lower confidence; please verify. There is no test for this helper.

### 2. Clarity & Simplification

**#13 Duplicated logic.** *Impact: Medium | Confidence: High*
- `parseTimeToMs` and `formatMsToTime` are implemented in both `src/lib/formatters.ts:7-19` and `src/lib/stats-parser.ts:51-63`.
- The per-model aggregation (map of input/output/cacheRead/cacheWrite/cost, then cache-hit rate) is written twice in `token-engine.ts`, once in `parseTranscript` (lines 18-88) and again in `mergeStats` (lines 94-123). A third variant lives in `report.ts:64-73`.
- `report.ts:97-100` re-implements the plugin-config path and default `scanRoots` inline, instead of calling `loadPluginConfig()` from `src/lib/plugin-config.ts`. It also has no try/catch, so a malformed config crashes the report.
- `scripts/build-hooks.js:39-96` has two identical esbuild loops (HOOKS and CLI_SCRIPTS). It also defines `__VERSION__`, which no source file uses (`grep __VERSION__ src` returns nothing).
- The empty-transcript-stats literal `{ models: [], apiMessages: 0, … }` appears in both `session-end.ts:27` and `rebuild.ts:57`.
- **Why:** CLAUDE.md asks for strong duplication reduction, and the duplicate pairs can drift apart (for example, a fix to cache-hit-rate maths applied to only one copy).

**#23 Garbled instruction in session_setup.md.** *Impact: Low | Confidence: High*
- **Evidence:** `commands/session_setup.md:7`: "(create it via a normal session start if it doesn't exist yet — run `node …session-start.js` is not appropriate here; instead just read the file…"
- **Why:** The sentence contradicts itself. It says "create it", then says the way to create it is "not appropriate". The model has to guess the intent, which is "don't create it, tell the user to send a message first".

**#25 Parse errors outside try blocks drop rows.** *Impact: Low | Confidence: High*
- **Evidence:** `session-start.ts:16` (`loadOrCreateProjectConfig`) and `session-end.ts:19-20` (`findStartRow`, `loadOrCreateProjectConfig`) sit outside the per-step try/catch blocks. `project-config.ts:28` calls `JSON.parse` with no guard.
- **Why:** A hand-edited or corrupt `config.json` or `session_stats.json` throws to the top-level handler, so no START or END row is recorded at all. The per-step try blocks (lines 49-53) suggest the intent was the opposite.

**#29 `<synthetic>` model rows in reports.** *Impact: Low | Confidence: Medium*
- **Evidence:** the test output includes `↳ <synthetic> cost:$0.00 tokens:0`.
- **Why:** These rows are noise in per-model breakdowns. Filtering zero-usage pseudo-models would make reports cleaner.

### 3. Test Coverage & Quality

**#6 The report test runs the real report on the developer's machine.** *Impact: High | Confidence: High*
- **Evidence:** `src/scripts/report.ts:117` ends with a top-level `printReport();`. `tests/unit/report.test.ts:5` imports `aggregateByTag` from that module. Running `npx vitest run` printed a full `SESSIONSTATS REPORT — all projects` covering real projects under `~/Projects`, including names, costs and token counts.
- **Why:** The test reads the real home directory, the output depends on the machine, private usage data leaks into CI or shared logs, and the output is not "pristine" as CLAUDE.md requires. The pure function and the CLI entry point should be separate modules, or the entry point should be guarded.

**#11 Untested modules.** *Impact: Medium | Confidence: High*
- **Evidence:** no test imports `src/hooks/session-start.ts`, `src/hooks/session-end.ts`, `src/scripts/show-stats.ts`, `src/scripts/rebuild-stats.ts` or `src/lib/transcript-dir.ts` (checked the `import` lines in all 10 test files).
- **Why:** The hooks are the core runtime path: config creation, orphan closing, START/END pairing, posting and stdout JSON. #2, #7, #15 and #25 all live in this untested orchestration. The `--dry-run` paths that 1.1.0 advertises are also untested.

**#19 Intentional stderr is neither captured nor asserted.** *Impact: Medium | Confidence: Medium*
- **Evidence:** the test run printed `stderr | tests/unit/web-post.test.ts > … [sessionstats] Web post failed: Error: network down` (plus 2 more) and `stderr | tests/unit/report.test.ts > … Skipping proj-bad: …`. None of these tests spy on `console.error`. In web-post.test.ts the only `vi.spyOn` calls target `loadPluginConfig`.
- **Why:** CLAUDE.md says: "If logs are expected to contain errors, these MUST be captured and tested." Asserting the message would also pin down the user-facing error text.

### 4. Security

**#24 API key handling.** *Impact: Low | Confidence: High*
- **Evidence:** `src/lib/plugin-config.ts:25`, `fs.writeFileSync(configPath, …)` with default permissions (normally 0644). `web-post.ts:19` posts `{ apiKey, … }` to whatever `websiteUrl` is configured, including `http://`.
- **Why:** The key is readable by other local users, and it can be sent in cleartext if someone configures an http URL. It also travels in the JSON body rather than an `Authorization` header, so any server-side body logging will capture it. That last point is lower impact, and it depends on the companion site.

### 5. Code Efficiency & Scalability

**#20 Non-atomic read-modify-write of the stats file.** *Impact: Medium | Confidence: Medium*
- **Evidence:** `stats-writer.ts:27-31` (`appendRow` parses the whole file, pushes a row and rewrites it). `writeStatsFile` writes in place (line 24) with no temp file and rename.
- **Why:** Two sessions in the same project ending close together, or one hook starting while another ends, can lose a row. A crash mid-write leaves invalid JSON, and per #25 that then breaks every later hook in the project. This becomes more likely the more the plugin is used.

**#27 Minor algorithmic waste.** *Impact: Low | Confidence: Medium*
- **Evidence:** `orphan-detector.ts:15-16` filters all rows once per session ID (O(sessions × rows)). `rebuild.ts:47-55` reads and parses each transcript twice (`firstAndLastTimestamps`, then `parseSessionTranscript`). `findStartRow` re-parses the file that `appendRow` parses again moments later.
- **Why:** This is fine at today's sizes. It is worth fixing when the duplication in #13 is fixed.

### 6. Accuracy & Consistency (docs, command files, manifests)

**#8 `~/Projects` is written literally and never expanded.** *Impact: Medium | Confidence: High*
- **Evidence:** `commands/sessionstats_config.md:7,12,23` tells the model the default is `scanRoots: ["~/Projects"]` and shows it in the JSON to write. `report.ts:34-35` passes each root straight to `fs.existsSync(root)`, and nothing expands `~` anywhere.
- **Why:** If the model writes the documented value, `/sessionstats_report` silently reports nothing. The code default (`path.join(os.homedir(), 'Projects')`) works, so the bug only appears after the user runs the config command.

**#12 Version drift and a malformed CHANGELOG.** *Impact: Medium | Confidence: High*
- **Evidence:** `.claude-plugin/plugin.json` is `"version": "1.1.0"`, while `package.json` and the generated `plugin/package.json` and `plugin/.claude-plugin/plugin.json` are `1.0.0`. `docs/plans/DEPLOYMENT_GUIDE.md` requires the versions to match. In CHANGELOG.md:11-21, the 1.1.0 bullets sit *above* empty `### Added … ### Security` headings (the Unreleased template was pasted below them). There is no 1.0.0 entry, and 0.1.0 lists a `/build_story` command that doesn't exist.
- **Why:** `npm run build` stamps `package.json`'s version into `plugin/`, so the next build ships two different versions. `/sessionstats:version` reads one manifest and could compare the wrong number against GitHub releases.

**#14 Stale docs linked from the README.** *Impact: Medium | Confidence: High*
- **Evidence:** count of `ccusage|cc-session-track|session_stats.csv|Claude Time` matches: IMPLEMENTATION_PLAN 28, BUILD_STORY 26, DEPLOYMENT_GUIDE 20, PHASES_SUMMARY 6, TESTING_GUIDELINES 3. `docs/TESTING_GUIDELINES.md:164,226` mentions `e2e/ # Playwright E2E tests` and `habit_creation_flow_test.ts`, which come from an unrelated project template. README.md:252-255 links four of these as current documentation. `build-hooks.js:23` prints "Building cc-session-track hooks".
- **Why:** New contributors and agents will follow outdated architecture (ccusage, CSV storage) and a testing strategy that does not apply here.

**#21 Unimplemented design docs give no status.** *Impact: Medium | Confidence: Medium*
- **Evidence:** `docs/specs/2026-08-10-compaction-and-query-tracking-design.md` and `docs/superpowers/plans/2026-08-11-compaction-and-query-tracking.md` describe `precompact.ts`, `/session_break`, verbose mode and `extract-prompts.ts`. None of them exist in `src/` or `commands/`.
- **Why:** Readers can't tell whether this is shipped, in progress or abandoned. It also overlaps directly with #2, which is the bug the spec was written to fix.

**#26 ABOUTME convention gaps.** *Impact: Low | Confidence: High*
- **Evidence:** `grep -L ABOUTME` lists all 10 `tests/unit/*.test.ts` files and `scripts/build-hooks.js`. `src/lib/plugin-config.ts` has 1 ABOUTME line, not the 2 required. `formatters.ts:2` ("no longer has a 'Claude Time' concept") and `pricing.ts:2` ("Ported from claude-sessions/…") include historical wording that CLAUDE.md forbids in comments.
- **Why:** These break CLAUDE.md's "All code files MUST start with…" rule and its rule against temporal comments.

**#28 The role of `plugin/` as an install root is ambiguous.** *Impact: Low | Confidence: Medium*
- **Evidence:** `plugin/` contains its own `.claude-plugin/plugin.json` and `hooks.json`, but that `hooks.json` points to `${CLAUDE_PLUGIN_ROOT}/plugin/scripts/…`, which only resolves when the *repo root* is the plugin root.
- **Why:** If anything ever installs `plugin/` as the root, the hooks break. If nothing does, the duplicated manifest and hooks copies only add drift risk (see #12). The intended layout is not documented anywhere.

**#30 Personal editor state is committed.** *Impact: Low | Confidence: High*
- **Evidence:** `.obsidian/workspace.json`, `app.json`, `appearance.json` and `core-plugins.json` are tracked.
- **Why:** This is per-user workspace state with no value to the project.

### 7. Skill Effectiveness (command files)

*(General criteria. The skill rubric file was not readable in this session.)*

**#7 The setup-confirmation instruction probably never reaches the model.** *Impact: High | Confidence: Medium*
- **Evidence:** `src/hooks/session-start.ts:57-61` sends "Please interactively confirm/adjust projectName, tags… with the user now" via `console.error`. Stdout carries only `{continue, suppressOutput}` (line 63).
- **Why:** For SessionStart hooks, Claude Code adds *stdout* (or `hookSpecificOutput.additionalContext` in JSON output) to the model's context. Stderr from a hook that exits 0 is, to my understanding, shown only in verbose or debug mode. If so, the onboarding flow the hook is built around (`needsSetupConfirmation`) never triggers, and `needsSetupConfirmation` stays `true` forever. Verify against the current hooks documentation.

**#16 Plugin-relative file references have no root.** *Impact: Medium | Confidence: Medium*
- **Evidence:** `commands/version.md:7`, "Read the installed version from this plugin's manifest: `.claude-plugin/plugin.json`". `commands/help.md:5`, "`help.md` (at this plugin's repository root)". The script-running commands, by contrast, use `${CLAUDE_PLUGIN_ROOT}`.
- **Why:** The model's working directory is the user's project, so a bare `.claude-plugin/plugin.json` points at the wrong file, or nothing. The model has to search for the plugin's install location. Version step 3a (`.git` "here") has the same ambiguity.

**#22 Mixed command naming.** *Impact: Low | Confidence: High*
- **Evidence:** `help.md` and the dry-run follow-ups use `/sessionstats:session_setup`. `commands/session_tags.md:11`, `session-start.ts:60`, `sessionstats_rebuild.md` ("run `/session_stats`") and the whole README (lines 50-87) use the bare `/session_setup` form.
- **Why:** Users and the model get two names for the same command. Plugin commands are namespaced, so the bare form may not resolve.

### 8. Token Efficiency & Progressive Disclosure (command files)

- No significant findings. Each command file is short (5-33 lines) and loads only when invoked. The one candidate is `commands/version.md`: its update-check procedure (steps 3-4) is only needed on that command, which is already the case. A Clarity & Simplification pass on `session_setup.md` (#23) is the only change worth making here.

### 9. README Quality

*(General criteria. The README rubric file was not readable in this session.)*

**#9 Stale or incorrect claims.** *Impact: Medium | Confidence: High*
- See the claims inventory in Step 2. In summary: the test count (README.md:228, "73 unit tests" vs 57); `extract-prompts` (242); `postToWeb` called a "future posting feature" (119); "running totals" stored in the file (120) vs "Totals computed dynamically" (144); when `.md` gets regenerated (121); the output sample does not match `formatTerminalOutput` (74-75); the pricing table omits `claude-opus-4-6` (189-193); the promised "full payload shape" is missing (216; the payload also includes `apiKey`, which the Privacy section doesn't mention); `/sessionstats_config` is described as setting "`websiteUrl` and `scanRoots`" with no mention of `apiKey` (86); `/sessionstats:version` and `/sessionstats:help` are missing from the command table.
- **Why:** The README is the user-facing contract. Several of these errors (posting is "future", totals are stored) actively mislead users about what the plugin does with their data.

**#17 The multi-user collaboration claim contradicts the gitignore behavior.** *Impact: Medium | Confidence: Medium*
- **Evidence:** README.md:15, "Multi-user support - … git merge-friendly append-only data", and lines 140-144. But `project-config.ts:50-57` (`ensureGitignoreEntry`) automatically adds `.sessionstats/` to the project's `.gitignore`. On top of that, a pretty-printed single JSON array is not merge-friendly: two branches appending rows both edit the closing `]` and conflict.
- **Why:** The claimed feature is effectively disabled by default, and it would cause merge conflicts if enabled. Either the claim or the behavior needs revisiting.

### 10. Agent Instructions (`CLAUDE.md`, `AGENTS.md`)

*(General criteria. The agent-instructions rubric file was not readable in this session.)*

**#10 No project-specific guidance.** *Impact: Medium | Confidence: High*
- **Evidence:** All 169 lines of `CLAUDE.md` are a generic personal working agreement. None mention `npm test`, `npm run build`, Vitest, `plugin/`, hooks, `.sessionstats/` or the pricing table (grep for `sessionstats|vitest|npm|plugin` returns no matches). `AGENTS.md` consists of the single line `# AGENTS.md`.
- **Why:** An agent working here isn't told the most important project facts. `plugin/` is a committed build artifact that must be regenerated with `npm run build` after any `src/` or `commands/` change. Versions must be bumped in `package.json` and `.claude-plugin/plugin.json` together (#12). Pricing must be kept current (#1). The repo's own docs are stale (#14). An empty `AGENTS.md` gives non-Claude agents nothing, when it could point them to `CLAUDE.md`.
- **Internal tensions in CLAUDE.md:**
  - "Fix broken things immediately when you find them" (line 101) conflicts with "document it in your journal rather than fixing it immediately" (line 167).
  - "YOU MUST ALWAYS STOP and ask for clarification" (line 30) conflicts with "When asked to do something, just do it" (line 43).
- **Unfollowed and unverifiable rules:**
  - "YOU MUST include the phase and task number in commit messages" (line 110): none of the 5 most recent commits does, for example `82d4743 Bump version to v1.1.0`.
  - The "journal tool" and "TodoWrite tool" (lines 23, 127, 163) assume tools that may not exist in every agent environment.
- **Why the tensions matter:** Rules that conflict or are routinely ignored teach agents that the file is optional, which weakens the rules that matter.

---

## Step 6: Next steps

This run was non-interactive, so the questions were not asked:
1. *Save the report?* Saved to `docs/reviews/improve-this-2026-11-17.md`, the path the task specified.
2. *Create an implementation plan?* Not created. Pick finding numbers (for example `1,2,3,5,6,7`) to get a phased plan in `docs/plans/improve-this-2026-11-17.md`. For #9 (README) and #23 (command clarity), that plan would use the `make-readme` and `plsfix` skills.
