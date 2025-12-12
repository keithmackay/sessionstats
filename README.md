# cc-session-track

Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)

## Description

cc-session-track is a Claude Code marketplace plugin that automatically tracks session statistics using lifecycle hooks. When a Claude session starts, the plugin records the project name, timestamp, and session ID. When a session ends, it captures end time, calculates duration, and retrieves cost/token metrics from ccusage. All statistics are stored in `session_stats.md` at the project root.

**Key Features:**
- **Automatic tracking** - Hooks fire on session lifecycle events, no manual commands needed
- **Per-project stats** - Each project maintains its own `session_stats.md` file
- **Running totals** - Header line shows cumulative sessions, duration, cost, and tokens
- **Orphan detection** - Crashed sessions are auto-closed with `[Abnormal End]` flag
- **Visual reporting** - `/session_stats` command shows formatted statistics

## Requirements

- Node.js 18.0.0 or higher
- Claude Code with plugin support

## Installation

```bash
# Add marketplace (if not already added)
claude plugin marketplace add keithmackay/cc-session-track

# Install plugin
claude plugin install cc-session-track
```

## Usage

Once installed, the plugin works automatically:

1. **Start a Claude session** - A START row is added to `session_stats.md`
2. **End the session** - An END row is added with duration, cost, and token metrics
3. **View stats** - Run `/session_stats` for a formatted summary

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
  Claude Time:  01:45:30
  Total Cost:   $8.42
  Total Tokens: 2,345,678

  RECENT SESSIONS (last 5)
  ────────────────────────────────────
  Dec 12, 2:30 PM   1h 15m   $2.34   opus-4-5
  Dec 12, 4:00 PM   30m      $0.89   sonnet-4-5  [Abnormal End]
```

## How It Works

cc-session-track uses Claude Code's hook system to intercept session lifecycle events:

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
│ ├─ Query ccusage for session metrics (cost, tokens)        │
│ ├─ Calculate duration from START timestamp                 │
│ ├─ Record END row with all metrics                         │
│ └─ Update running totals in header                         │
└─────────────────────────────────────────────────────────────┘
```

## session_stats.md Format

The stats file uses a CSV format with a plain-text totals header:

```
Sessions: 5 | Duration: 02:30:00 | Claude: 00:45:00 | Cost: $12.50 | Tokens: 125,000
session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags
abc123,my-project,START,2025-01-01T10:00:00Z,claude-opus-4,,,,,
abc123,my-project,END,2025-01-01T10:30:00Z,claude-opus-4,00:30:00,,2.50,25000,
def456,my-project,START,2025-01-01T11:00:00Z,claude-sonnet-4,,,,,
def456,my-project,END,2025-01-01T11:30:00Z,claude-sonnet-4,00:30:00,,1.50,15000,[Abnormal End]
```

### Flags

| Flag | Meaning |
|------|---------|
| `[Abnormal End]` | Session was closed by orphan detection (crash/force quit) |
| `[No Start Found]` | END recorded without a matching START row |

## Development

```bash
# Clone the repository
git clone https://github.com/keithmackay/cc-session-track.git
cd cc-session-track

# Install dependencies
npm install

# Run tests (30 unit tests)
npm test

# Build hooks
npm run build
```

### Project Structure

```
cc-session-track/
├── src/
│   ├── hooks/           # SessionStart/SessionEnd hook scripts
│   ├── lib/             # Core logic (stats-file, orphan-detector, formatters)
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
