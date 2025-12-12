# cc-session-track

A Claude Code plugin that automatically tracks session statistics, recording start times, end times, session duration, Claude processing time, costs, and token usage across all your projects.

## Description

cc-session-track automates what manual `/start_session` and `/end_session` commands do, but triggers automatically via Claude Code hooks. When a Claude session starts, the plugin records the project name, timestamp, and model. When a session ends, it captures end time, calculates session length, and logs Claude's time spent, cost, and tokens used. All statistics are stored in `session_stats.md` at the project root with running totals.

**Key Features:**
- **Automatic tracking** - No manual commands needed; hooks fire on session lifecycle events
- **Per-project stats** - Each project maintains its own `session_stats.md` file
- **Running totals** - Header line automatically updates with cumulative session time, Claude time, cost, and tokens
- **Model tracking** - Records which Claude model was used for each session
- **Graceful handling** - Works even if a session wasn't properly started (logs "N/A" for unavailable metrics)

## Installation

_Coming soon_

## Usage

_Coming soon_

## License

_TBD_
