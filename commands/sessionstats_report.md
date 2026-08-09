---
description: Show cost/token totals across all projects, optionally filtered by tag
---

Run the cross-project report script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/report.js"
```

If the user specifies a tag (e.g. "show me team-infra"), pass it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/report.js" --tag <tag-name>
```

The script outputs formatted totals directly — no additional formatting needed.
