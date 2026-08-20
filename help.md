sessionstats — auto stats tracker for Claude Code sessions

WHAT IT DOES
  Hooks fire automatically on session start/end to record project name,
  timestamp, session ID, duration, and cost/token metrics parsed from the
  session transcript against a built-in pricing table. Data is stored
  per-project in `.sessionstats/session_stats.json`, with a regenerated
  markdown view kept alongside it. No manual invocation is needed for
  tracking itself — only the commands below are invoked directly.

WHAT IT NEEDS
  - Nothing to configure for tracking to start working automatically
  - Optional: run /sessionstats:sessionstats_config to set a websiteUrl,
    apiKey, or scanRoots for cross-device/cross-user reporting

COMMANDS
  /sessionstats:session_stats        Display session statistics for the
                                      current project
  /sessionstats:sessionstats_report  Show cost/token totals across all
                                      projects, optionally filtered by tag
  /sessionstats:session_setup        Interactively confirm or edit this
                                      project's sessionstats configuration
  /sessionstats:session_tags         Interactively review or update this
                                      project's tags only
  /sessionstats:sessionstats_config  Interactively set plugin-level config
                                      (websiteUrl, apiKey, scanRoots)
  /sessionstats:sessionstats_rebuild Rebuild session_stats.json from raw
                                      Claude Code transcripts, independent
                                      of hook-recorded data
  /sessionstats:help                 Show this message and exit
