# sessionstats

Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)

## Description

sessionstats is a Claude Code marketplace plugin that automatically tracks session statistics using lifecycle hooks. When a Claude session starts, the plugin records the project name, timestamp, and session ID. When a session ends, it captures end time, calculates duration, and computes cost/token metrics by parsing the session transcript directly against an internal pricing table (no external CLI dependency). All statistics are stored per-project in `.sessionstats/session_stats.json`, with `.sessionstats/session_stats.md` regenerated from it as a human-readable view.

**Key Features:**
- **Automatic tracking** - Hooks fire on session lifecycle events, no manual commands needed
- **Per-project stats** - Each project maintains its own `.sessionstats/` folder with JSON source-of-truth data
- **Direct transcript parsing** - Cost and token counts are computed from the session transcript with a built-in pricing table, no `ccusage` dependency
- **Per-model breakdown** - Stats and reports break down cost/tokens by model
- **Tagging** - Projects can carry multiple tags for grouping and cross-project aggregation
- **Multi-user support** - Machine ID field enables team collaboration with git merge-friendly append-only data
- **Orphan detection** - Crashed sessions are auto-closed with `[Abnormal End]` flag
- **Visual reporting** - `/session_stats` shows per-project stats; `/sessionstats_report` shows cross-project totals, optionally filtered by tag
- **Cross-platform** - Works on Mac, Windows, and Linux

## Requirements

- Node.js 18.0.0 or higher
- Claude Code with plugin support

## Installation

```bash
# Add marketplace (if not already added)
claude plugin marketplace add keithmackay/sessionstats

# Install plugin
claude plugin install sessionstats
```

## Usage

Once installed, the plugin works automatically:

1. **Start a Claude session** - A START row is added to `.sessionstats/session_stats.json` (and `.sessionstats/config.json` is created for the project if it doesn't exist yet)
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
  ────────────────────────────────────
  Sessions:     12
  Total Time:   04:23:15
  Total Cost:   $8.42
  Total Tokens: 2,345,678

  RECENT SESSIONS (last 5)
  ────────────────────────────────────
  Dec 12, 2:30 PM   1h 15m   $2.34   opus-4-5
  Dec 12, 4:00 PM   30m      $0.89   sonnet-4-5  [Abnormal End]
```

### Other Commands

| Command | Purpose |
|---------|---------|
| `/session_setup` | Interactively confirm/edit this project's full config: project name, tags, user email, and the (not-yet-implemented) post-to-web intent |
| `/session_tags` | Quick edit of just this project's `tags`, leaving the rest of the config untouched |
| `/session_stats` | Display this project's session statistics |
| `/sessionstats_report` | Cross-project cost/token totals (with per-project and per-model breakdown), optionally filtered with `--tag <tag-name>` |
| `/sessionstats_config` | Set plugin-level config: `websiteUrl` and `scanRoots` (used by `/sessionstats_report` to find `.sessionstats/` folders) |
| `/build_story` | Generate or update `docs/BUILD_STORY.md` documenting project development history |

## How It Works

sessionstats uses Claude Code's hook system to intercept session lifecycle events:

```
┌─────────────────────────────────────────────────────────────┐
│ SessionStart Hook                                           │
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
│ ├─ Parse the session transcript directly (no ccusage)      │
│ ├─ Compute per-model cost/tokens via internal pricing      │
│ ├─ Calculate duration from START timestamp                 │
│ └─ Record END row with all metrics                         │
└─────────────────────────────────────────────────────────────┘
```

## .sessionstats/ Storage

Each project gets a `.sessionstats/` folder at its root:

- **`config.json`** - per-project config: `projectName`, `tags` (array, multiple tags per project supported), `userEmail`, `postToWeb` (intent flag for a future posting feature, see below)
- **`session_stats.json`** - the source of truth: schema version, running totals, and a `rows` array of START/END session records, each END row carrying a per-model breakdown of input/output/cache tokens and cost
- **`session_stats.md`** - a regenerated, human-readable rendering of `session_stats.json`. It is not hand-edited and gets rewritten whenever stats change.

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
  "flags": null,
  "machineId": "Keith.MacKay@Keiths-MacBook"
}
```

**Design for multi-user collaboration:**
- JSON is the source of truth; append-only `rows` array
- `machineId` field identifies which user/machine generated each session
- `sessionId` UUID pairs START/END rows even after merging
- Totals computed dynamically when viewing stats

## Tagging and Cross-Project Reporting

Each project's `.sessionstats/config.json` can carry any number of `tags` (set via `/session_setup` or quickly via `/session_tags`). `/sessionstats_report` scans the directories configured in `scanRoots` (via `/sessionstats_config`, default `~/Projects`) for `.sessionstats/` folders and aggregates cost/token totals across all of them, or just the ones matching a given `--tag`, with per-project and per-model breakdown.

## Posting to a Website (planned, not yet implemented)

`ProjectConfig.postToWeb` and the plugin-level `websiteUrl` (set via `/sessionstats_config`) record the *intent* to eventually push session data to a configured website for shared visibility. This upload mechanism does not exist yet -- setting these flags today has no effect beyond recording the setting.

### Flags

| Flag | Meaning |
|------|---------|
| `[Abnormal End]` | Session was closed by orphan detection (crash/force quit) |
| `[No Start Found]` | END recorded without a matching START row |

## Development

```bash
# Clone the repository
git clone https://github.com/keithmackay/sessionstats.git
cd sessionstats

# Install dependencies
npm install

# Run tests (61 unit tests)
npm test

# Build hooks
npm run build
```

### Project Structure

```
sessionstats/
├── src/
│   ├── hooks/           # SessionStart/SessionEnd hook scripts
│   ├── lib/             # Core logic (stats-parser, stats-writer, orphan-detector, formatters, token-engine, pricing)
│   ├── scripts/         # CLI scripts (show-stats, report, extract-prompts)
│   └── types/           # TypeScript interfaces
├── plugin/              # Built distribution for marketplace
├── tests/unit/          # Unit tests (vitest)
├── commands/            # Slash command definitions
└── docs/                # Documentation
```

## Documentation

- [Implementation Plan](docs/plans/IMPLEMENTATION_PLAN.md) - Detailed development guide
- [Phases Summary](docs/plans/PHASES_SUMMARY.md) - Quick reference to implementation phases
- [Build Story](docs/BUILD_STORY.md) - How this project was built (including AI assistance)
- [Deployment Guide](docs/plans/DEPLOYMENT_GUIDE.md) - Publishing to marketplaces

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT

## Author

Keith MacKay

---

*Built with Claude Code assistance. See [BUILD_STORY.md](docs/BUILD_STORY.md) for details.*
