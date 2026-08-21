# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Add :version command for sessionstats, reporting installed version and a best-effort GitHub update check
- Add Changelog section to README linking CHANGELOG.md
### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [0.1.0]

### Added
- Automatic session tracking via Claude Code lifecycle hooks (SessionStart/SessionEnd)
- Direct transcript parsing for cost/token computation, with a built-in per-model pricing table
- Per-project `.sessionstats/` storage (`config.json`, `session_stats.json`, `session_stats.md`)
- `/session_stats`, `/sessionstats_report`, `/session_setup`, `/session_tags`, `/sessionstats_config`, and `/build_story` commands
- Tagging and cross-project reporting via `scanRoots`
- Orphan session detection with `[Abnormal End]` flagging
- Optional posting of session stats to a companion website ([sessionstats-web](https://github.com/keithmackay/sessionstats-web))
