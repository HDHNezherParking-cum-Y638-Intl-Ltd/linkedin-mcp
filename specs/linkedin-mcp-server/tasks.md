# Tasks: linkedin-mcp-server

Status: execution · POC-first · Updated: 2026-07-22
Legend: [AUTO] verifiable without LinkedIn · [MANUAL] needs a real logged-in session ·
Constraint on every task: **no git commit / push**.

## T1 — Scaffold + build green  ✅ gate: boots
- `package.json` (type:module, scripts), `tsconfig.json` (NodeNext/ES2022/strict).
- Install pinned deps (§10 design). Minimal `src/index.ts`: build an empty `McpServer`,
  connect `StdioServerTransport`. `src/server.ts` `buildServer()` stub.
- `npm run smoke` script that instantiates the server and prints registered tool names.
- **[VERIFY][AUTO]** `npm run build` + `npm run typecheck` clean; `npm run smoke` runs.

## T2 — Browser session + utils  gate: context launches
- `config.ts` (env+defaults), `util.ts` (async mutex, `humanDelay`, `NotLoggedInError`,
  `ok()/err()` result helpers), `browser.ts` `BrowserSession` (lazy
  `launchPersistentContext`, `getPage()`, mutex-guarded `run()`, `close()`).
- **[VERIFY][AUTO]** typecheck clean. **[MANUAL]** scratch launch+close of headed context.

## T3 — Selectors + session tools  gate: login persists
- `linkedin/selectors.ts` (role/aria/text factories + `assertCoreSelectors`).
- `linkedin/session.ts` `login()` (headed, wait for manual auth) + `sessionStatus()`.
- Register tools `linkedin_login`, `linkedin_session_status` in `tools.ts`.
- **[VERIFY][AUTO]** build/typecheck; smoke lists the 2 tools.
  **[MANUAL]** login opens window, complete 2FA, session persists under `session/`;
  `session_status` → loggedIn:true + name.

## T4 — create_post  gate: posts to profile
- `linkedin/posts.ts` `createPost()`; register `create_post`.
- **[VERIFY][MANUAL]** a test post appears on the profile; returns post URL when available.

## T5 — Comments read/reply + my posts  gate: VERTICAL SLICE complete
- `linkedin/comments.ts` `readPostComments()`, `replyToComment()`; `listMyPosts()`.
- Register `list_my_posts`, `read_post_comments`, `reply_to_comment`.
- **[VERIFY][MANUAL]** slice works end-to-end: login → create_post → read_post_comments →
  reply_to_comment.

## T6 — Scheduler (db + worker + tools)  gate: unit tests pass
- `scheduler/db.ts` (`ScheduleDb`, WAL, CRUD), `scheduler/worker.ts` (`startWorker` poll,
  status transitions, injectable `poster`). Wire real poster + `startWorker` in `index.ts`.
- Register `schedule_post`, `list_scheduled_posts`, `cancel_scheduled_post`.
- **[VERIFY][AUTO]** `test/scheduler.test.ts` (enqueue→due→posted; poster-throws→failed;
  cancel→skipped; past-time reject at tool layer; overdue late-fire) + `validation.test.ts`
  pass via `node --test`.

## T7 — Pages + feed  gate: builds, page path attempted
- `linkedin/pages.ts` (`listPages`, `createPagePost`), `linkedin/feed.ts` (`readFeed`);
  thread `asPageId` into reply/schedule paths.
- Register `list_pages`, `create_page_post`, `read_feed`.
- **[VERIFY][AUTO]** build/typecheck; smoke lists all 12 tools.
  **[MANUAL]** `list_pages` returns admin Pages; `create_page_post` posts as a Page
  (or returns a clear "not admin / page absent from switcher" error).

## T8 — Harden + docs + LAND  gate: green + secret-clean
- README (quickstart, MCP client config JSON, ToS/risk + **local-only** warning, selector-
  maintenance note, scheduler-uptime caveat), `.env.example`.
- Selector smoke wired into `session_status`; error-model polish; graceful shutdown.
- **[VERIFY][AUTO]** build + typecheck + `node --test` + smoke(12 tools) all green.
- **[VERIFY][SECURITY]** secret scan clean; `git status`/`git ls-files` show no
  session/DB/env artifacts tracked; independent review subagent.
- **NO commit / push.** Report to operator.

## Quality checkpoints
- After T5: vertical slice demoable.
- After T6: automated test suite green (the CI-able core).
- After T8: full server, docs, secret-clean, reviewed.

## Verification commands (added by T1)
- Build: `npm run build` · Type: `npm run typecheck` · Test: `npm test` (node --test) ·
  Boot: `npm run smoke` · Secret scan: `git ls-files | grep -Ei 'session|\.env$|sqlite'` (expect empty).
