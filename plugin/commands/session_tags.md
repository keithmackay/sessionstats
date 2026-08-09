---
description: Interactively review or update this project's tags only, leaving other config untouched
---

# Session Tags

Read `.sessionstats/config.json` in the current project. Show the user the current `tags` array. Ask which tags to add and/or remove (e.g. "starting work on the billing epic — add epic-billing, keep team-infra").

Update only the `tags` field — do not modify `projectName`, `userEmail`, `postToWeb`, or `needsSetupConfirmation`. Write the file back and confirm the new `tags` array to the user.

If `.sessionstats/config.json` doesn't exist yet, tell the user no session has been tracked for this project yet and to try again after their first message, or run `/session_setup` for full configuration.
