---
description: Log in to LinkedIn once in a real browser window and save the session locally
allowed-tools:
  [
    "mcp__plugin_linkedin_linkedin__linkedin_session_status",
    "mcp__plugin_linkedin_linkedin__linkedin_login",
  ]
---

Establish the local LinkedIn session.

1. Call `linkedin_session_status` first. If it already reports logged in, say so and stop —
   do not open a second browser window for nothing.
2. Otherwise call `linkedin_login`. Tell the user, before the call, that:
   - A real Chrome window opens and **they** sign in by hand — 2FA, email codes, and device
     checkpoints all work because they are driving.
   - No password is read, stored, or logged by this server.
   - The default wait is 5 minutes (`LINKEDIN_LOGIN_TIMEOUT_SEC`).
3. Confirm with `linkedin_session_status` afterwards and report the account name.

The saved session lives in `~/.linkedin-mcp/session/`. Warn the user to treat that directory
like a password — anyone holding it can act as them on LinkedIn.
