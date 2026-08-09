---
description: Interactively set the plugin-level sessionstats config (websiteUrl, scanRoots)
---

# sessionstats Plugin Config

Read `~/.claude/sessionstats/config.json` (defaults: `websiteUrl: null`, `scanRoots: ["~/Projects"]` if the file doesn't exist yet).

Interactively confirm or update:
1. **Website URL** (`websiteUrl`) — where session data would be posted once uploading is implemented (not implemented yet — this just records the intended endpoint).
2. **Scan roots** (`scanRoots`) — directories `/sessionstats_report` searches for `.sessionstats/` folders. Defaults to `["~/Projects"]`.

Write the updated JSON back to `~/.claude/sessionstats/config.json` (create the directory if needed) and confirm the saved values.
