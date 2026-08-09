---
description: Interactively confirm or edit this project's sessionstats configuration
---

# Session Setup

Read `.sessionstats/config.json` in the current project (create it via a normal session start if it doesn't exist yet — run `node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/session-start.js"` is not appropriate here; instead just read the file, and if missing, tell the user no session has started yet and to try again after their first message).

Interactively confirm or update each field with the user, showing current values as defaults:

1. **Project name** (`projectName`) — currently shown value; ask if they want to change it from the folder-name default.
2. **Tags** (`tags`) — currently shown array; ask what tags to set (e.g. team, feature/epic). Multiple tags are supported — this project can belong to more than one aggregation group at once.
3. **User email** (`userEmail`) — currently shown value (defaulted from `git config user.email`); ask if it should change.
4. **Post to web** (`postToWeb`) — currently `true`/`false`; ask whether this project's sessions should (eventually) be posted to the configured website. Explain that the actual upload isn't implemented yet — this just sets the intent.

After confirming all four, write the updated JSON back to `.sessionstats/config.json`, preserving `schemaVersion`, and set `needsSetupConfirmation` to `false`. Confirm the saved values to the user.
