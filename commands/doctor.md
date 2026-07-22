---
description: Diagnose the LinkedIn plugin — runtime, build, session, and selector drift
allowed-tools:
  [
    "Bash(node:*)",
    "mcp__plugin_linkedin_linkedin__linkedin_session_status",
    "mcp__plugin_linkedin_linkedin__read_feed",
    "Read",
    "Edit",
  ]
---

Work through these checks and report a short PASS/FAIL table, then the single next action.

1. **Runtime** — `node --version`. Needs **≥ 22.5** (the scheduler uses built-in `node:sqlite`).
2. **Build** — `node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" --build-only`. Idempotent;
   it reinstalls or recompiles only if something is missing or stale.
3. **Session** — `linkedin_session_status`. Not logged in → `/linkedin:login`.
4. **Selector drift** — the status call warns when core selectors no longer match. If it does,
   or if a tool errored with *"update src/linkedin/selectors.ts"*:
   - Every LinkedIn locator lives in one file: `${CLAUDE_PLUGIN_ROOT}/src/linkedin/selectors.ts`.
     Fix it there and nowhere else, then re-run step 2 to rebuild.
   - Confirm the repair with a read-only call (`read_feed`) before touching any write tool.
5. **Chrome** — a launch failure mentioning `chrome` means Google Chrome is not installed or not
   found. The server uses the system Chrome (`channel: 'chrome'`) by design; it does not
   download its own browser.

Expect selector breakage periodically — LinkedIn's markup changes constantly, and this is
scraping the site, not calling an API.
