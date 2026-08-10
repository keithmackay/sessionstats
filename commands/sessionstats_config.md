---
description: Interactively set the plugin-level sessionstats config (websiteUrl, apiKey, scanRoots)
---

# sessionstats Plugin Config

Read `~/.claude/sessionstats/config.json` (defaults: `websiteUrl: null`, `apiKey: null`, `scanRoots: ["~/Projects"]` if the file doesn't exist yet).

Interactively confirm or update:
1. **Website URL** (`websiteUrl`) — where session data gets posted for projects with `postToWeb` enabled, e.g. `https://your-sessionstats-web-deployment.example.com`.
2. **API key** (`apiKey`) — your account's API key from the website's `/report` page. Required (along with `websiteUrl`) for posting to actually happen; if either is unset, posting silently no-ops and sessions are still tracked locally as normal.
3. **Scan roots** (`scanRoots`) — directories `/sessionstats_report` searches for `.sessionstats/` folders. Defaults to `["~/Projects"]`.

Write the updated JSON back to `~/.claude/sessionstats/config.json` (create the directory if needed) and confirm the saved values.
