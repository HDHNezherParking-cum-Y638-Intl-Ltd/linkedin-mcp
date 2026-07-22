# Design: linkedin-mcp-server

Status: draft (autonomous flow) · Phase: design · Updated: 2026-07-22

## 1. Architecture at a glance

Single long-lived Node process speaking MCP over **stdio**. Three layers + a scheduler:

```
              stdio (MCP client: Claude)
                        │
        ┌───────────────┴────────────────┐
        │  MCP layer  (src/server.ts)     │  register ~12 tools; each tool = thin
        │  zod-validate → call action →   │  adapter: validate, call action, format
        │  format {content|isError}       │
        └───────┬─────────────────┬───────┘
                │                 │
     ┌──────────▼─────┐   ┌───────▼─────────────┐
     │ LinkedIn actions│   │ Scheduler           │
     │ src/linkedin/*  │   │ src/scheduler/*     │
     │ posts, comments,│   │ db (better-sqlite3) │
     │ pages, feed,    │   │ + worker (setInterval poll)
     │ session         │   │ poster is INJECTED  │
     └──────┬──────────┘   └───────┬─────────────┘
            │ uses                  │ calls createPost/createPagePost
     ┌──────▼───────────────────────▼──┐
     │ Browser session (src/browser.ts) │  singleton Playwright persistent context
     │ launchPersistentContext(userDataDir, channel:'chrome')
     │ one page, actions serialized via a mutex, human-paced
     └──────────────────────────────────┘
            │ reads locators from
     ┌──────▼──────────────────────────┐
     │ Selectors (src/linkedin/selectors.ts)  ALL LinkedIn DOM lives here
     └──────────────────────────────────┘
```

Key seam: **the scheduler worker takes a `poster` function as a dependency.** In
production it's the real browser-driven `createPost`/`createPagePost`; in tests it's a
mock. This is what makes the scheduler unit-testable with **zero** browser/network.

## 2. File layout

```
linkedin-mcp/
  package.json            # type:module, scripts, pinned deps
  tsconfig.json           # NodeNext, ES2022, strict
  .env.example            # documented, non-secret placeholders only
  README.md               # setup + ToS/risk + "local only" warning
  src/
    index.ts              # entry: config → db → server → worker → stdio; graceful shutdown
    config.ts             # paths, headless flag, timeouts, pacing — from env w/ defaults
    server.ts             # buildServer(deps): McpServer + registerTool for each tool
    tools.ts              # tool definitions (schema + handler) — imported by server.ts
    browser.ts            # BrowserSession singleton: getPage(), login(), close(), mutex
    util.ts               # humanDelay, mutex, errors (NotLoggedInError), result helpers
    linkedin/
      selectors.ts        # central locator factories + assertCoreSelectors()
      session.ts          # login(), sessionStatus()
      posts.ts            # createPost(), createPagePost(), listMyPosts()
      comments.ts         # readPostComments(), replyToComment()
      pages.ts            # listPages()
      feed.ts             # readFeed()
    scheduler/
      db.ts               # ScheduleDb: better-sqlite3, WAL, CRUD
      worker.ts           # startWorker({db, poster, intervalMs}) → poll loop
  test/
    scheduler.test.ts     # node:test — db + worker with mock poster
    validation.test.ts    # node:test — zod schemas (past-time reject, etc.)
  session/                # gitignored — chrome-profile/ (userDataDir) lives here
  data/                   # gitignored — schedule.sqlite lives here
```

## 3. Session & browser strategy

- **One persistent context per process.** `chromium.launchPersistentContext(userDataDir, { channel: 'chrome', headless, viewport: null, args: [...] })`. `userDataDir = session/chrome-profile` (under gitignored `session/`). This IS the single source of truth for auth — **we do NOT keep a separate `storage_state.json`** (refines FR-1: one source of truth; the gitignore entry stays as defense-in-depth).
- **Headed by default** (`LINKEDIN_HEADLESS` env to opt into headless for actions). Login is always headed. Research: headed + residential IP + reused profile is the low-detection posture. Never cloud/Docker/headless-server.
- **login():** ensure headed context → `page.goto('https://www.linkedin.com/feed/')` → if it lands on login/guest, surface the window and **wait** for the user to finish auth (poll for an authed nav element, up to `LOGIN_TIMEOUT`, default 300s) → done. No password handled by us.
- **sessionStatus():** navigate to feed headless; logged in iff an authed nav element (the "Me"/global-nav avatar) is present; else `loggedIn:false` with "run linkedin_login".
- **Serialization:** all browser actions go through a promise-chain **mutex** in `BrowserSession` so the worker and interactive tools never drive the same page concurrently.
- **Pacing:** `humanDelay(min,max)` randomized short sleeps between composer steps.

## 4. Selector strategy (NFR-2)

`selectors.ts` exports locator **factories**, role/aria/text only — never brittle class
names. Examples (final values derived empirically during build):

```ts
export const sel = {
  startPost: (p: Page) => p.getByRole('button', { name: /start a post|create a post/i }),
  editor:    (p: Page) => p.getByRole('textbox', { name: /text editor for creating content/i }),
  postBtn:   (p: Page) => p.getByRole('button', { name: /^post$/i }),
  meNav:     (p: Page) => p.getByRole('navigation').getByRole('button', { name: /^me$/i }),
  commentItems: (p: Page) => p.locator('article').filter({ has: p.getByRole('link') }), // refined in build
  // ...
};
export async function assertCoreSelectors(page: Page): Promise<string[]> { /* returns names of 0-match core selectors */ }
```

`assertCoreSelectors` runs inside `session_status` (and logs at boot when a session exists);
a non-empty return = a warning telling the user which selector to fix in this one file.

## 5. MCP tools (contracts)

All handlers return `{ content: [{type:'text', text}] }`; failures return
`{ isError:true, content:[...] }` via a `tool()` wrapper — **never throw across stdio**.
`readOnlyHint` set where true (annotations aid Claude's read/write split, per review criteria).

| Tool | Input (zod) | R/W | Notes |
|---|---|---|---|
| `linkedin_login` | `{}` | write | headed; waits for manual auth |
| `linkedin_session_status` | `{}` | read | loggedIn + display name; runs selector smoke check |
| `create_post` | `{ text:str[1..3000], visibility?:'public'\|'connections' }` | write | personal profile |
| `schedule_post` | `{ text, scheduledAt:ISO, visibility?, asPageId?:str }` | write | enqueues to SQLite; rejects past time |
| `list_scheduled_posts` | `{ status?:enum }` | read | queue view |
| `cancel_scheduled_post` | `{ id:int }` | write | pending→canceled; else no-op msg |
| `list_my_posts` | `{ limit?:int=10 }` | read | own recent posts (refs for commenting) |
| `read_post_comments` | `{ post:str, limit?:int=20 }` | read | post = URL or URN; personal or Page |
| `reply_to_comment` | `{ post:str, commentRef:str, text:str, asPageId?:str }` | write | reply under user or Page identity |
| `list_pages` | `{}` | read | admin Pages (empty list if none) |
| `create_page_post` | `{ pageId:str, text:str }` | write | post as Page |
| `read_feed` | `{ limit?:int=10 }` | read | best-effort home feed snapshot |

`asPageId`/`pageId` = the page's numeric id or URN as returned by `list_pages`.

## 6. Scheduler design

**Table `scheduled_posts`:**

```sql
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  text         TEXT    NOT NULL,
  visibility   TEXT,
  as_page_id   TEXT,                 -- NULL => personal
  scheduled_at TEXT    NOT NULL,     -- ISO-8601 UTC
  status       TEXT    NOT NULL DEFAULT 'pending', -- pending|posting|posted|failed|canceled
  created_at   TEXT    NOT NULL,
  posted_at    TEXT,
  last_error   TEXT,
  post_url     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_posts(status, scheduled_at);
```

**Worker:** `setInterval(tick, intervalMs=30_000)`. Each tick, inside the browser mutex:
`SELECT * WHERE status='pending' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT 1`.
Mark `posting` **before** awaiting the poster (guards against overlap). Call
`poster({text, asPageId, visibility})`. On success → `posted` + `posted_at` + `post_url`.
On throw → `failed` + `last_error`. Process one job per tick (simple, human-paced).
Overdue jobs (machine was off) late-fire on the next tick. Documented limit: **fires only
while the process runs.** `better-sqlite3` synchronous API; WAL mode.

**Injectable poster** = the seam for tests. Signature:
`type Poster = (job: { text:string; asPageId?:string|null; visibility?:string|null }) => Promise<{ postUrl?:string }>`.

## 7. Error model

- `NotLoggedInError` — thrown by browser actions when the authed nav is absent; the
  `tool()` wrapper maps it to a friendly "Not logged in — run linkedin_login first."
- Selector/timeout errors — message names `src/linkedin/selectors.ts` as the fix site.
- zod validation errors — returned as `isError` with the field message (e.g. past time).
- The stdio server never exits on an action error.

## 8. Config (env, all optional)

| Env | Default | Meaning |
|---|---|---|
| `LINKEDIN_SESSION_DIR` | `./session` | persistent chrome profile parent |
| `LINKEDIN_DB_PATH` | `./data/schedule.sqlite` | scheduler db |
| `LINKEDIN_HEADLESS` | `false` | headless for non-login actions |
| `LINKEDIN_LOGIN_TIMEOUT_SEC` | `300` | manual-login wait |
| `LINKEDIN_POLL_MS` | `30000` | scheduler tick |
| `LINKEDIN_PACING_MS` | `400,1200` | humanDelay min,max |

`.env.example` ships these as documentation. No secret values — login is interactive.

## 9. Testing / verification (NFR-7)

- **Unit (node:test, no browser):** `scheduler.test.ts` — enqueue → due detection → status
  transitions with a mock poster (incl. poster-throws→failed, cancel→skipped, overdue
  late-fire). `validation.test.ts` — schemas reject past `scheduledAt`, empty text, etc.
  DB uses a temp/`:memory:` file.
- **Boot check:** `npm run smoke` builds the server object and asserts `tools/list` returns
  all 12 tools — no LinkedIn contact.
- **Build/type:** `npm run build`, `npm run typecheck`.
- **Manual local smoke (documented, not CI):** login → create_post → read_post_comments →
  reply. Never run live LinkedIn flows in CI (needs real session + violates ToS).

## 10. Dependencies (pinned intent)

- runtime: `@modelcontextprotocol/sdk@^1.29`, `playwright@^1.4x`, `better-sqlite3@^11`, `zod@^3`.
- dev: `typescript@^5`, `tsx@^4`, `@types/node`, `@types/better-sqlite3`.
- `channel:'chrome'` uses installed Google Chrome (no Playwright browser download needed;
  README notes the fallback `npx playwright install chromium`).

## 11. Deliverable extras

- README: quickstart, MCP client config JSON (Claude Desktop/Code stdio entry), the ToS/
  risk + "local only" warnings, selector-maintenance note, scheduler-uptime caveat.
- `.env.example`.

## 12. Risks carried into build

Selector fragility (highest ongoing cost) → mitigated by §4. Account restriction (highest
consequence) → §3 posture + NFR-3. Post-as-Page DOM unverified → build empirically, keep
the path that works, fail with a clear message otherwise. SDK v2 churn → pinned v1.
