# sessionstats

Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)

## Description

sessionstats is a Claude Code marketplace plugin that automatically tracks session statistics using lifecycle hooks. When a Claude session starts, the plugin records the project name, timestamp, and session ID. When a session ends, it captures end time, calculates duration, and computes cost/token metrics by parsing the session transcript (plus any subagent transcripts) directly against an internal pricing table. All statistics are stored per-project in `.sessionstats/session_stats.json`, and `/session_stats` renders them to `.sessionstats/session_stats.md` as a human-readable view.

## Table of Contents

- [Description](#description)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [.sessionstats/ Storage](#sessionstats-storage)
- [Tagging and Cross-Project Reporting](#tagging-and-cross-project-reporting)
- [Posting to a Website](#posting-to-a-website)
- [Flags](#flags)
- [Pricing](#pricing)
- [Privacy: What's Tracked (and What Isn't)](#privacy-whats-tracked-and-what-isnt)
- [Limitations](#limitations)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)
- [Author](#author)

## Key Features

- **Automatic tracking** - Hooks fire on session lifecycle events, no manual commands needed
- **Per-project stats** - Each project maintains its own `.sessionstats/` folder with JSON source-of-truth data
- **Direct transcript parsing** - Cost and token counts are computed from the session transcript and its subagent transcripts with a built-in pricing table
- **Per-model breakdown** - Stats and reports break down cost/tokens by model
- **Tagging** - Projects can carry multiple tags for grouping and cross-project aggregation
- **Multi-user support** - Machine ID field and append-only rows keep data from different users/machines distinguishable
- **Orphan detection** - Crashed sessions are auto-closed with `[Abnormal End]` flag
- **History rebuild** - `/sessionstats_rebuild` reconstructs stats from raw Claude Code transcripts for projects that predate the plugin
- **Visual reporting** - `/session_stats` shows per-project stats; `/sessionstats_report` shows cross-project totals, optionally filtered by tag
- **Optional web posting** - Push session stats to a [sessionstats-web](https://github.com/keithmackay/sessionstats-web) deployment for cross-machine reporting
- **Cross-platform** - Works on Mac, Windows, and Linux

## Requirements

- Node.js 18.0.0 or higher
- Claude Code with plugin support

## Installation

### From the mackayi marketplace (recommended)

```
/plugin marketplace add keithmackay/mackayi
/plugin install sessionstats@mackayi
```

sessionstats is distributed through [mackayi](https://github.com/keithmackay/mackayi), Keith MacKay's Claude Code plugin marketplace — not through its own marketplace file. `/plugin marketplace add` and `/plugin install` are slash commands — run them inside an active Claude Code session, not in your shell.

If the install summary says `Run /reload-plugins to activate.`, run that command too.

For non-interactive installs (e.g. a setup script), the marketplace must already be known — either added once via `/plugin marketplace add` in a prior session, or declared in `.claude/settings.json` under [`extraKnownMarketplaces`](https://code.claude.com/docs/en/settings#extraknownmarketplaces) — then install with the shell CLI:

```bash
claude plugin install sessionstats@mackayi --scope user
```

## Usage

Once installed, the plugin works automatically:

1. **Start a Claude session** - A START row is added to `.sessionstats/session_stats.json`. The first time this happens in a project, `.sessionstats/config.json` is created with defaults (folder name as project name, no tags, your `git config user.email`, `postToWeb: false`) and Claude is prompted to walk you through confirming them — the same flow as `/session_setup`. If the project has a `.gitignore`, `.sessionstats/` is appended to it.
2. **End the session** - An END row is added with duration, per-model cost, and token metrics
3. **View stats** - Run `/session_stats` for a formatted summary, or `/sessionstats_report` for totals across all projects

### /session_stats Command

```bash
/session_stats           # Color-coded terminal output
/session_stats md        # Markdown table format
```

**Terminal Output Example:**
```
╭────────────────────────────────────────────────────────────╮
│  SESSION STATISTICS: my-project                            │
╰────────────────────────────────────────────────────────────╯

  TOTALS
  ────────────────────────────────────────
  Sessions:     12
  Total Time:   04:23:15
  Total Cost:   $8.42
  Total Tokens: 2,345,678

  RECENT SESSIONS (last 5)
  ────────────────────────────────────────
  Dec 12, 4:00 PM    00:30:00   N/A [Abnormal End]
  Dec 12, 2:30 PM    01:15:00   $2.34
```

The terminal view lists the last 5 completed sessions, newest first. The markdown view (`md`) lists the last 10 with tokens, models, and flags, and is also written to `.sessionstats/session_stats.md` every time `/session_stats` runs.

### Other Commands

| Command                | Purpose                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/session_setup`       | Interactively confirm/edit this project's full config: project name, tags, user email, and whether this project posts to the configured website. Supports `--dry-run` to preview the config that would be written. |
| `/session_tags`        | Quick edit of just this project's `tags`, leaving the rest of the config untouched. Supports `--dry-run` to preview the tag change.              |
| `/session_stats`       | Display this project's session statistics                                                                                                       |
| `/sessionstats_report` | Cross-project cost/token totals (with per-project and per-model breakdown), optionally filtered with `--tag <tag-name>`                         |
| `/sessionstats_config` | Set plugin-level config: `websiteUrl`, `apiKey`, and `scanRoots` (used by `/sessionstats_report` to find `.sessionstats/` folders). Supports `--dry-run` to preview the config that would be written. |
| `/sessionstats_rebuild` | Rebuild `.sessionstats/session_stats.json` from this project's raw Claude Code transcripts — recovers history for projects that predate live tracking. Supports `--dry-run` to preview what would be rebuilt without writing anything. |
| `/help`                | Show a summary of what the plugin does and its commands                                                                                          |
| `/version`             | Show the installed plugin version and, if the `gh` CLI is available, whether a newer GitHub release exists                                       |

All commands are also available in plugin-namespaced form, e.g. `/sessionstats:session_stats` or `/sessionstats:help`.

> [!WARNING]
> `/sessionstats_rebuild` overwrites `.sessionstats/session_stats.json`. Existing rows are discarded and replaced with rows reconstructed from transcripts under `~/.claude/projects/`, flagged `[Reconstructed]` and with `machineId: null`. Run it with `--dry-run` first.

## How It Works

sessionstats uses Claude Code's hook system to intercept session lifecycle events:

```
┌─────────────────────────────────────────────────────────────┐
│ SessionStart Hook (startup, clear, compact, resume)         │
│ ├─ Create .sessionstats/config.json if missing             │
│ ├─ Detect orphaned sessions (crashed without END)          │
│ ├─ Auto-close orphans with [Abnormal End] flag             │
│ └─ Record START row: project, timestamp, session_id        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Your Claude Code Session                                    │
│ (work normally - tracking happens automatically)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SessionEnd Hook                                             │
│ ├─ Parse the session transcript + subagent transcripts     │
│ ├─ Compute per-model cost/tokens via internal pricing      │
│ ├─ Calculate duration from START timestamp                 │
│ ├─ Record END row with all metrics                         │
│ └─ Post the END row to the website (if opted in)           │
└─────────────────────────────────────────────────────────────┘
```

The hooks run the bundled scripts in `plugin/scripts/` (built from `src/` with esbuild). Hook failures are logged to stderr and never block the session.

## .sessionstats/ Storage

Each project gets a `.sessionstats/` folder at its root:

- **`config.json`** - per-project config: `projectName`, `tags` (array, multiple tags per project supported), `userEmail`, `postToWeb` (whether this project's sessions are posted to the configured website, see below), and `needsSetupConfirmation` (cleared once you've confirmed the config)
- **`session_stats.json`** - the source of truth: a schema version and a `rows` array of START/END session records, each END row carrying a per-model breakdown of input/output/cache tokens and cost
- **`session_stats.md`** - a rendered, human-readable view of `session_stats.json`. It is not hand-edited and gets rewritten each time `/session_stats` runs.

Example `session_stats.json` row (abridged):

```json
{
  "sessionId": "abc123",
  "project": "my-project",
  "event": "END",
  "timestamp": "2025-01-01T10:30:00Z",
  "duration": "00:30:00",
  "models": [
    { "model": "claude-opus-4-5-20251101", "input": 12000, "output": 3000, "cacheRead": 8000, "cacheWrite": 2000, "cost": 2.5 }
  ],
  "apiMessages": 42,
  "userMessages": 9,
  "toolCalls": 31,
  "subagentCount": 1,
  "cacheHitRate": 0.36,
  "flags": null,
  "machineId": "Keith.MacKay@Keiths-MacBook"
}
```

**Design for multi-user collaboration:**
- JSON is the source of truth; append-only `rows` array
- `machineId` field identifies which user/machine generated each session
- `sessionId` UUID pairs START/END rows even after merging
- Totals are computed from the rows whenever stats are read, never stored

> [!NOTE]
> The SessionStart hook appends `.sessionstats/` to the project's `.gitignore` (if one exists and doesn't already mention `.sessionstats/`), so stats stay local by default. To commit and share them through git instead, replace that line with `!.sessionstats/` — the hook sees the existing mention and won't re-add the ignore rule.

## Tagging and Cross-Project Reporting

Each project's `.sessionstats/config.json` can carry any number of `tags` (set via `/session_setup` or quickly via `/session_tags`). `/sessionstats_report` looks at the immediate subdirectories of each directory in `scanRoots` (via `/sessionstats_config`, default `~/Projects`) for `.sessionstats/` folders and aggregates cost/token totals across all of them, or just the ones matching a given `--tag`, with per-project and per-model breakdown.

Plugin-level config lives in `~/.claude/sessionstats/config.json`.

## Posting to a Website

sessionstats can push each session's stats to a companion website ([sessionstats-web](https://github.com/keithmackay/sessionstats-web)) for shared, cross-machine reporting — useful for teams, or just to check your usage from a browser instead of the terminal.

### Getting an API key

1. Sign up for an account on your team's/your own sessionstats-web deployment (or run one locally — see that project's README).
2. Once logged in, your **API key** is shown at the top of the `/report` page. Copy it.

### Configuring the plugin

Posting is opt-in at two levels — both must be set for anything to actually happen:

1. **Plugin-wide** (once per machine): run `/sessionstats_config` and set:
   - `websiteUrl` — where your sessionstats-web deployment is running (e.g. `https://sessionstats.yourteam.com`)
   - `apiKey` — the key from your `/report` page
   - `scanRoots` — unrelated to posting, used by `/sessionstats_report` (see above)
2. **Per-project**: run `/session_setup` and turn on `postToWeb` for any project whose sessions should be posted. Projects default to `postToWeb: false` — nothing is posted anywhere until you explicitly opt a project in.

If either `apiKey` or `websiteUrl` is unset, posting silently does nothing — sessions are still tracked locally exactly as before. A failed or slow post (network issue, website down) never blocks or breaks your session; it's a best-effort background step with a 5-second timeout, logged to stderr on failure. There's currently no retry — a session that fails to post stays only in your local `.sessionstats/session_stats.json`.

Each completed session (and each orphaned session closed with `[Abnormal End]`) is sent as a `POST` to `<websiteUrl>/api/sessions` with this body:

```json
{
  "apiKey": "<your api key>",
  "project": "my-project",
  "tags": ["team-infra"],
  "sessions": [ { "...": "the END row, same shape as in session_stats.json" } ]
}
```

### Using the website

Once you've posted at least one session, the website's `/report` page shows:
- Your API key (for pasting into other machines' configs)
- Totals grouped by tag, then by project within each tag — so a project tagged `["team-infra", "epic-billing"]` shows up under both groups
- A chronological list of every session posted to your account

## Flags

| Flag | Meaning |
|------|---------|
| `[Abnormal End]` | Session was closed by orphan detection (crash/force quit). Detected at the next session start in the same project; carries duration but no token/cost data. |
| `[No Start Found]` | END recorded without a matching START row |
| `[Reconstructed]` | Row was rebuilt from raw transcripts by `/sessionstats_rebuild` |

## Pricing

Cost is computed locally from token counts using a built-in per-model pricing table (`src/lib/pricing.ts`) — USD per million tokens, broken out by input, output, cache read, and cache write:

| Model ID | Input | Output | Cache Read | Cache Write |
|-------|------:|-------:|-----------:|-------------:|
| `claude-opus-4-5-20251101` | $15.00 | $75.00 | $1.50 | $18.75 |
| `claude-opus-4-6` | $15.00 | $75.00 | $1.50 | $18.75 |
| `claude-sonnet-4-5-20250929` | $3.00 | $15.00 | $0.30 | $3.75 |
| `claude-haiku-4-5-20251001` | $0.80 | $4.00 | $0.08 | $1.00 |

A transcript's model ID matches a row if either string contains the other. An unrecognized model ID falls back to Opus-tier pricing (the most expensive tier in the table), so an unexpected model never silently under-reports cost.

**Update cadence:** this table is a static snapshot — it is not fetched live and does not update itself. If Anthropic changes [pricing](https://www.anthropic.com/pricing) or ships a new model, the table in `src/lib/pricing.ts` needs a manual edit and a new release; until then, historical and new cost figures alike will reflect whatever's in the table at the time. Check it against Anthropic's current published prices before relying on cost figures.

## Privacy: What's Tracked (and What Isn't)

sessionstats is designed to track *usage*, not *content*. Every session record (`.sessionstats/session_stats.json`, and the same shape if posted to a website) contains only:

- **Token counts** — input, output, cache-read, cache-write, per model
- **Computed cost** — derived from the token counts above, never sent anywhere separately
- **Duration** — wall-clock time between session start and end
- **Counts** — number of API messages, user messages, tool calls, and subagents, plus the session's cache hit rate
- **Identifiers** — session ID, project name, tags, machine ID (`username@hostname`), timestamps
- **Status flags** — e.g. `[Abnormal End]` if a session crashed

**What is explicitly NOT tracked:**

- **Prompt or query content** — nothing you type, and nothing Claude responds with, is ever read, stored, or transmitted. The transcript is parsed only for its `usage` token counts and message/tool-call counts; the actual message text is never touched.
- **File contents or paths** you worked with, beyond the project's own folder name.
- **Per-turn or per-request processing time** — this is not a privacy choice, it's an availability one: Claude Code's CLI doesn't expose per-turn timing data anywhere sessionstats can read it (confirmed against real transcript JSONL — the closest available field, `message.diagnostics`, only carries a cache-miss reason, no timing). The only timing data available is the START/END session timestamps, which is what `duration` is computed from.

Your `userEmail` is stored in the local `.sessionstats/config.json` only; it is not part of session records and is not posted.

If you post to a website, this exact same data (and nothing more, apart from your API key, project name, and tags) is what gets sent — see [Posting to a Website](#posting-to-a-website) above for the full payload shape.

## Limitations

- **No `~` expansion in `scanRoots`** — `/sessionstats_report` passes `scanRoots` entries to the filesystem as-is, so an entry like `~/Projects` written to `~/.claude/sessionstats/config.json` is silently skipped. Use absolute paths (the built-in default, used when no config file exists, is already absolute).
- **One level deep** — `/sessionstats_report` only finds projects that are direct children of a scan root.
- **No web-post retry** — a failed post is logged and dropped.
- **Orphaned sessions have no cost data** — a session that crashes before its SessionEnd hook runs is closed with duration only.
- **Static pricing** — see [Pricing](#pricing).

## Development

```bash
# Clone the repository
git clone https://github.com/keithmackay/sessionstats.git
cd sessionstats

# Install dependencies
npm install

# Run tests (57 unit tests, Vitest)
npm test

# Run tests in watch mode
npm run test:watch

# Build hooks
npm run build
```

`npm run build` bundles `src/hooks/` and `src/scripts/` into `plugin/scripts/` with esbuild, and copies `hooks/hooks.json`, `.claude-plugin/plugin.json`, and `commands/` into `plugin/`. The hooks and commands run the files in `plugin/scripts/`, so rebuild and commit `plugin/` after changing anything in `src/`.

### Project Structure

```
sessionstats/
├── .claude-plugin/      # Plugin manifest (plugin.json)
├── src/
│   ├── hooks/           # SessionStart/SessionEnd hook sources
│   ├── lib/             # Core logic (token-engine, pricing, stats-parser, stats-writer, orphan-detector,
│   │                    #   formatters, project-config, plugin-config, rebuild, web-post, transcript-dir)
│   ├── scripts/         # CLI scripts (show-stats, report, rebuild-stats)
│   └── types/           # TypeScript interfaces
├── hooks/hooks.json     # Hook registration
├── commands/            # Slash command definitions
├── plugin/              # Built output that the hooks and commands execute
├── scripts/             # Build script and a one-off legacy-data migration script
├── tests/unit/          # Unit tests (vitest)
├── help.md              # Text shown by /help
└── docs/                # Documentation
```

## Documentation

- [Implementation Plan](docs/plans/IMPLEMENTATION_PLAN.md) - Detailed development guide
- [Phases Summary](docs/plans/PHASES_SUMMARY.md) - Quick reference to implementation phases
- [Build Story](docs/BUILD_STORY.md) - How this project was built (including AI assistance)
- [Deployment Guide](docs/plans/DEPLOYMENT_GUIDE.md) - Publishing to marketplaces
- [Testing Guidelines](docs/TESTING_GUIDELINES.md) - How tests are written for this project

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for bug-report and feature-request templates, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE) © 2026 Keith MacKay

## Author

Keith MacKay

---

*Built with Claude Code assistance. See [BUILD_STORY.md](docs/BUILD_STORY.md) for details.*
