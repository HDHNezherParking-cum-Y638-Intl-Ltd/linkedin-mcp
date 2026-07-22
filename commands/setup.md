---
description: Install dependencies and build the bundled LinkedIn MCP server (run once after installing the plugin)
allowed-tools: ["Bash(node:*)"]
---

Bootstrap the bundled LinkedIn MCP server so its first tool call is instant instead of
waiting on an install.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" --build-only`
   - It installs npm dependencies and compiles `src/` → `dist/`. Playwright's browser
     download is skipped on purpose — this server drives the user's **system Chrome**.
   - It is idempotent: a no-op when the build is already current.
2. If it fails, report the exact error and the likely cause:
   - `Node >= 22.5 required` → the user must upgrade Node (the server uses built-in `node:sqlite`).
   - npm network/proxy errors → the install could not reach the registry.
3. On success, tell the user to run `/linkedin:login` next, and that they must have
   **Google Chrome** installed.

Do not attempt to install Chrome or Node for the user — report and let them decide.
