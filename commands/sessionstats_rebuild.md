---
description: Rebuild .sessionstats/session_stats.json from this project's raw Claude Code transcripts
---

This command reconstructs session history by scanning this project's Claude Code transcript JSONL files directly (under `~/.claude/projects/`), independent of any hook-recorded data.

**This overwrites `.sessionstats/session_stats.json`** — any existing rows are discarded and replaced with what's reconstructed from the transcripts. Reconstructed rows are tagged with the flag `[Reconstructed]` and have `machineId: null` (the originating machine can't be recovered from a transcript alone). Confirm with the user before running if `.sessionstats/session_stats.json` already has non-trivial history, since this is not reversible from within the plugin (though the transcripts themselves are untouched, so re-running is idempotent).

Run the rebuild script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/rebuild-stats.js"
```

The script reports how many sessions it found and rebuilt. If it reports zero sessions, tell the user no transcripts were found for this project directory — this can happen if the project was recently moved/renamed (Claude Code keys transcripts by absolute path).

After rebuilding, suggest the user run `/session_stats` to view the reconstructed totals.
