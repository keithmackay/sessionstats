---
description: Display session statistics for the current project
---

Read the `session_stats.md` file from the current project root and display formatted statistics.

## Arguments

Check if the user's message includes `md` or `markdown`:
- If yes: Output in **markdown format** (tables suitable for docs/GitHub)
- If no: Output in **color-coded terminal format** (default)

## Behavior

1. Look for `session_stats.md` in the current working directory
2. If the file doesn't exist, inform the user: "No session statistics found. Sessions will be tracked automatically when you start and end Claude Code sessions."
3. Parse the file and display:

### Totals Section
- Sessions: count of completed sessions
- Total Duration: cumulative session time
- Claude Time: cumulative Claude processing time (if available)
- Total Cost: cumulative cost in dollars
- Total Tokens: cumulative token usage

### Recent Sessions Section
- Show the last 5-10 sessions
- Include: date, duration, cost, model, any flags (like [Abnormal End])

### Model Breakdown (if multiple models used)
- Show cost breakdown by model

## Output Formats

### Terminal (default)
Use box-drawing characters and color for emphasis:
- Use cyan/blue for borders and headers
- Use green for positive values (cost, tokens)
- Use yellow for warnings/flags like [Abnormal End]
- Use bold for section headers

Example:
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
  Dec 11, 9:15 AM   45m      $1.23   opus-4-5
```

### Markdown (with `md` or `markdown` flag)
Output proper markdown tables:

```markdown
## Session Statistics: my-project

### Totals

| Metric | Value |
|--------|-------|
| Sessions | 12 |
| Total Duration | 04:23:15 |
| Claude Time | 01:45:30 |
| Total Cost | $8.42 |
| Total Tokens | 2,345,678 |

### Recent Sessions

| Date | Duration | Cost | Tokens | Model | Flags |
|------|----------|------|--------|-------|-------|
| 2025-12-12 | 01:15:00 | $2.34 | 234,567 | opus-4-5 | |
| 2025-12-12 | 00:30:00 | $0.89 | 89,012 | sonnet-4-5 | [Abnormal End] |
```

## Notes

- The session_stats.md file is automatically created and updated by the cc-session-track plugin hooks
- START rows indicate session beginnings (no metrics yet)
- END rows contain the actual metrics from that session
- [Abnormal End] indicates a session that was closed by orphan detection (crash/force quit)
- [No Start Found] indicates an END was recorded without a matching START
