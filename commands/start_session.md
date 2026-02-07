---
description: Record the start of a work session in session_stats.md.
---

Record the start of a work session in session_stats.md.

## Instructions

1. Get the project folder name from the current working directory (just the folder name, not full path)
2. Get the current local date and time
3. Note the current LLM model in use

4. Append a new line to `session_stats.md` (create the file if it doesn't exist) in this format:
   ```
   [project folder name] session, Start Time: [YYYY-MM-DD HH:MM:SS], Model: [model name]
   ```

5. Confirm the session start was recorded.

## Example output line
```
budget session, Start Time: 2024-12-04 14:30:15, Model: claude-opus-4-5-20251101
```
