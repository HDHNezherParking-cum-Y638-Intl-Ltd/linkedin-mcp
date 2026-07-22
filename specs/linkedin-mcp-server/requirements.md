# Requirements: linkedin-mcp-server

Status: draft (autonomous flow) · Phase: requirements · Updated: 2026-07-22

## 1. Summary

A **local stdio MCP server** (TypeScript, `@modelcontextprotocol/sdk` v1 + Playwright)
that lets its single operator manage their **own** LinkedIn account and the Company/
showcase **Page(s) they admin**, by driving a real local Chromium under the user's
established web session. It exposes ~13 one-per-action tools for login/session,
posting, local scheduling, reading feeds/posts, and reading/replying to comments —
for the personal profile and for admin Pages.

## 2. Personas

- **Operator (only persona):** the LinkedIn account owner, acting through Claude. They
  have already, or will interactively, log into LinkedIn in a browser window the server
  opens. Technically comfortable running a local Node process. Non-goal: multi-tenant,
  other people's accounts, or unattended server operation.

## 3. In scope

- Session: interactive first-run login, session persistence, session-status check.
- Personal profile: create post, schedule post (local), list/cancel scheduled, list own
  recent posts, read a post's comments, reply to a comment.
- Pages: list admin Pages, create a post as a Page, read/reply to comments on Page posts.
- Home feed read (light — for "view my account").

## 4. Out of scope (non-goals)

- Official LinkedIn API / partner OAuth. (Explicitly web automation.)
- Direct messages / InMail, connection requests, endorsements, reactions beyond replies.
- Analytics/metrics scraping, bulk data export, lead-gen scraping.
- Multiple accounts, multi-user, or cloud/Docker/headless-server deployment (raises
  detection + ToS risk — see NFRs).
- Media/video posting in the POC (text + optional single link/image is a stretch goal).
- Editing or deleting already-published posts.

## 5. Functional requirements (user stories + acceptance criteria)

Acceptance criteria use EARS-ish "SHALL". A tool "returns an error result" means an MCP
`isError` result with a human-readable message, never a thrown/uncaught crash.

### FR-1 — Interactive login (`linkedin_login`)
As the operator, I want to log in once in a real browser so the server can act as me.
- SHALL open a **headed** Chromium window using a persistent profile under `session/`.
- SHALL wait (with a generous timeout) for the user to complete login, including 2FA /
  email / device checkpoints, detecting success by presence of the authenticated feed.
- SHALL persist the session (persistent `userDataDir` + a `storage_state.json` snapshot)
  under the gitignored `session/` directory.
- SHALL NOT accept, store, or log a password. SHALL return whether login succeeded.

### FR-2 — Session status (`linkedin_session_status`)
As the operator, I want to know if I'm still logged in before attempting actions.
- SHALL report `loggedIn: true|false` and, when logged in, the account's display name.
- SHALL detect an expired `li_at`/session and instruct the user to re-run login.
- SHALL NOT open a headed window (uses the persisted session, headless).

### FR-3 — Create post (`create_post`)
- SHALL publish `text` to the operator's personal profile via the web composer.
- SHALL support an optional `visibility` (public | connections) where the UI allows.
- SHALL confirm success (return the new post URL/URN when obtainable) or an error result.
- SHALL refuse (error result) if not logged in.

### FR-4 — Schedule post (`schedule_post`)
- SHALL accept `text` and a future ISO-8601 `scheduledAt`; SHALL reject a past time.
- SHALL persist the job to a local SQLite queue with status `pending` and return an id.
- SHALL be fired by a background worker (FR-11) — NOT LinkedIn's native scheduler.
- SHALL accept an optional `asPageId` to schedule a Page post.

### FR-5 — List scheduled posts (`list_scheduled_posts`)
- SHALL return all jobs with id, text (truncated), scheduledAt, status
  (`pending|posting|posted|failed|canceled`), and last error if any.

### FR-6 — Cancel scheduled post (`cancel_scheduled_post`)
- SHALL set a `pending` job to `canceled`; SHALL no-op-with-message for jobs already
  posted/posting/failed/canceled.

### FR-7 — List my recent posts (`list_my_posts`)
- SHALL return the operator's recent posts (URL/URN, text preview, timestamp) so other
  tools can target them for comment reading/replying.

### FR-8 — Read post comments (`read_post_comments`)
- SHALL take a post URL or URN and return comments: author name, text, a comment ref,
  and (best-effort) timestamp. SHALL support a `limit`.
- Works for personal AND Page posts (same mechanics).

### FR-9 — Reply to comment (`reply_to_comment`)
- SHALL post `text` as a reply to a referenced comment on a given post.
- SHALL accept an optional `asPageId` to reply under a Page identity.
- SHALL confirm success or return an error result.

### FR-10 — List admin Pages (`list_pages`)
- SHALL enumerate the Company/showcase Pages the account administers (name + page id/URL).
- SHALL return an empty list (not an error) when the account admins none.

### FR-11 — Post as Page (`create_page_post`)
- SHALL publish `text` to a specified admin Page (`pageId`) via the composer identity
  switcher or the Page admin composer.
- SHALL return an error result if the account lacks admin rights / the Page is absent
  from the identity switcher.

### FR-12 — Read feed (`read_feed`)
- SHALL return a light snapshot of the home feed (author, text preview, post ref) with a
  `limit`, for "view my account" use. Best-effort; feed DOM is the most volatile.

### FR-13 — Background scheduler worker (internal, supports FR-4)
- SHALL poll the SQLite queue on an interval; on a due `pending` job, mark `posting`,
  drive the browser to publish, then mark `posted` or `failed` (+ error).
- SHALL late-fire overdue jobs on the next tick after a restart/wake.
- SHALL serialize browser actions (one at a time) to avoid concurrent-page races.

## 6. Non-functional requirements

- **NFR-1 Secrets:** No credential, cookie, session file, or SQLite DB is ever committed.
  `session/`, `auth/`, `*.sqlite`, `.env` gitignored (already in place). A secret scan
  passes at land. Persistent-context `userDataDir` lives under `session/`.
- **NFR-2 Resilience to DOM churn:** ALL LinkedIn selectors live in one module; role/
  aria/text locators only; a startup smoke check warns on 0-match core selectors. A
  broken selector yields a clear error naming the selector module, never a silent hang.
- **NFR-3 Detection safety:** Headed real Chrome, user's residential IP, reused local
  session, human-like pacing (small randomized delays), serialized actions, no bulk
  loops. Documented: never run in cloud/Docker/headless-server.
- **NFR-4 ToS honesty:** README + relevant tool descriptions state that web automation
  violates the LinkedIn User Agreement and risks restriction; low-volume personal use
  only; user-initiated.
- **NFR-5 Fail safe:** Every tool validates input (zod) and returns structured error
  results; the server never crashes the stdio loop on an action failure. Not-logged-in
  is a first-class, friendly error across all action tools.
- **NFR-6 No auto-commit:** No phase, executor, or land step performs `git commit`/`push`.
- **NFR-7 Verifiability without LinkedIn:** Scheduler queue logic and input validation are
  unit-testable with Playwright mocked; the server boots and lists tools in CI-style check
  with no network. Live LinkedIn flows are manual local smoke only (never automated in CI).

## 7. Acceptance (definition of done)

- `npm run build` compiles; `npm run typecheck` clean.
- Server boots over stdio and responds to `tools/list` with all tools (no session needed).
- Scheduler unit tests pass (enqueue → due detection → status transitions; past-time
  rejection; cancel).
- `linkedin_login` opens a headed window and persists a session locally (manual smoke).
- At least the vertical slice works against a real account (manual): login → create_post →
  read_post_comments → reply_to_comment.
- Secret scan clean; `git status` shows no session/DB/env files tracked.
- README documents setup, the ToS/risk warning, and the "local only" constraint.
- NO commit or push performed.

## 8. Open questions (resolved by defaults unless operator overrides)

- Media posting: deferred (text + optional link only in POC).
- `read_feed`/`list_my_posts` depth: default limit 10, best-effort parsing.
- Exact "post as Page" DOM: derived empirically during build; both switcher and Page-admin
  paths attempted, clearest one kept.
