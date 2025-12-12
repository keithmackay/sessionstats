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

## session_stats.md Format

```
Sessions: 5 | Duration: 02:30:00 | Claude: 00:45:00 | Cost: $12.50 | Tokens: 125,000
session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags
abc123,my-project,START,2025-01-01T10:00:00Z,claude-opus-4,,,,,
abc123,my-project,END,2025-01-01T10:30:00Z,claude-opus-4,00:30:00,,2.50,25000,
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build hooks
npm run build
```

## License

MIT
