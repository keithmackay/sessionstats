---
description: Display session statistics for the current project
---

Run the session statistics script to display usage data:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/show-stats.js"
```

If the user's message includes `md` or `markdown`, add the flag:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/show-stats.js" md
```

The script outputs formatted statistics directly - no additional formatting needed.
