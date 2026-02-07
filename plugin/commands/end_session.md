---
description: Record the end of a work session in session_stats.md and update the totals header.
---

Record the end of a work session in session_stats.md and update the totals header.

## Instructions

### Step 1: Gather session data
1. Get the project folder name from the current working directory
2. Get the current local date and time
3. Read `session_stats.md` and find the most recent UNMATCHED "Start Time:" entry
   - An "unmatched" start is a Start Time line that has no End Time line after it
   - Parse the file from bottom to top: if the last session-related line contains "End Time:", there's no open session
4. If an unmatched Start Time exists:
   - Calculate Session Length (elapsed time from that Start Time to now)
5. If NO unmatched Start Time exists:
   - Warn the user: "Warning: No /start_session found for this session. Session Length will be recorded as N/A."
   - Set Session Length to "N/A"
   - Still proceed with recording the end entry (other metrics are still valuable)
6. Get session metrics from Claude Code (check /status or session info for):
   - Claude Time Spent (active processing time)
   - Claude Cost ($ amount)
   - Tokens Used

### Step 2: Append Session End row
Add a new line at the end of the file:
```
[project folder name] session, End Time: [YYYY-MM-DD HH:MM:SS], Session Length: [Xm Ys], Claude Time Spent: [Xm Ys], Claude Cost: [$X.XX], Tokens Used: [N]
```

### Step 3: Update or add the header
Parse ALL "Session End" rows in the file (those containing "End Time:") and calculate totals:
- Total Session Time: sum of all Session Length values
- Total Claude Time: sum of all Claude Time Spent values
- Total Claude Cost: sum of all Claude Cost values
- Total Tokens: sum of all Tokens Used values

Update (or add if missing) the FIRST line of the file to be:
```
[project folder name] totals, Total Session Time: [Xm Ys], Total Claude Time: [Xm Ys], Total Claude Cost: [$X.XX], Total Tokens: [N]
```

### Step 4: Confirm
Report the session stats and updated totals to the user.

## Notes
- If session metrics aren't available, note "N/A" for those values
- When calculating totals, skip any "N/A" values (only sum numeric entries)
- Time formats should be "Xm Ys" (e.g., "45m 30s" or "1h 23m 15s" for longer durations)
- Cost should include $ sign and 2 decimal places
- Preserve all existing content in the file when updating the header
