# LinkedIn MCP Server

A **local** [MCP](https://modelcontextprotocol.io) server (TypeScript + Playwright) that lets
Claude manage **your own** LinkedIn account and the Company/showcase **Pages you admin** —
post, schedule, read the feed, and read/reply to comments — by driving a real local Chrome
under your existing logged-in web session.

---

## ⚠️ Read this first — Terms of Service & risk

- This automates the **LinkedIn website**. It does **not** use the official LinkedIn API.
- **Automating LinkedIn web browsing violates the [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)** and can get your account **rate-limited, restricted, or banned**.
- Use it for **your own** account, at **low volume**, for actions **you initiate**. Do not bulk-post, scrape, or run it across many accounts.
- Run it **locally only** — your own machine, your own residential IP, a **headed** (visible) browser. **Never** run it in the cloud, in Docker, or on a datacenter IP: that fingerprint is exactly what LinkedIn flags.
- Provided as-is, no warranty. You accept the risk.

---

## Requirements

- **Node.js ≥ 22.5** (uses the built-in `node:sqlite` — no native build step).
- **Google Chrome** installed (Playwright drives your system Chrome via `channel: "chrome"`; no separate browser download).

## Setup

```bash
npm install      # Playwright's browser download is skipped — it uses your system Chrome
npm run build
```

> If Chrome isn't found, either install Google Chrome, or run `npx playwright install chromium`
> and delete the `channel: 'chrome'` option in `src/browser.ts`.

## Register with an MCP client

**Claude Desktop** (`claude_desktop_config.json`) or **Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "node",
      "args": ["C:\\Users\\david\\Desktop\\Projects\\Linkedin-MCP\\dist\\index.js"]
    }
  }
}
```

For development without building, use `"command": "npx"`, `"args": ["tsx", "…/src/index.ts"]`.

## First run — log in once

1. Call the **`linkedin_login`** tool. A real Chrome window opens.
2. Log in by hand (2FA, email, and device checkpoints all work — you're driving).
3. Your session is saved to `./session/` (gitignored) and reused on later runs.
4. Call **`linkedin_session_status`** to confirm you're logged in.

Re-run `linkedin_login` whenever the session expires (LinkedIn's `li_at` cookie lasts weeks to
months; there's no fixed TTL).

---

## Tools

| Tool | What it does |
|---|---|
| `linkedin_login` | Open a headed browser and wait for you to log in manually. No password stored. |
| `linkedin_session_status` | Report whether you're logged in; warn if page selectors have drifted. |
| `create_post` | Publish a text post to your personal profile. |
| `schedule_post` | Queue a post for a future time (local scheduler — see caveat). |
| `list_scheduled_posts` | List queued posts and their status. |
| `cancel_scheduled_post` | Cancel a still-pending scheduled post. |
| `list_my_posts` | List your recent posts (their refs feed `read_post_comments`). |
| `read_post_comments` | Read comments on a post (URL or activity/share URN). |
| `reply_to_comment` | Reply to a comment. |
| `list_pages` | List Company/showcase Pages surfaced to your account. |
| `create_page_post` | Publish a post **as** a Page you admin. |
| `read_feed` | Light snapshot of your home feed. |

## Scheduling — how it works (and its limit)

`schedule_post` writes to a local SQLite queue (`./data/schedule.sqlite`). A background worker
polls and publishes each post at its due time via the browser.

> **It fires only while this server process is running.** If your machine is off or the server
> isn't running at the scheduled time, the post goes out on the next poll after the server is
> running again. This is a *local* scheduler, not LinkedIn's native one.

## Configuration

All optional — set as environment variables or in a `.env` file (loaded automatically). See
[`.env.example`](./.env.example).

| Env | Default | Meaning |
|---|---|---|
| `LINKEDIN_SESSION_DIR` | `./session` | Persistent Chrome profile (your logged-in session). |
| `LINKEDIN_DB_PATH` | `./data/schedule.sqlite` | Scheduler database. |
| `LINKEDIN_HEADLESS` | `false` | Run non-login actions headless. Login is always headed. |
| `LINKEDIN_LOGIN_TIMEOUT_SEC` | `300` | How long login waits for you. |
| `LINKEDIN_POLL_MS` | `30000` | Scheduler poll interval. |
| `LINKEDIN_PACING_MS` | `400,1200` | Randomized delay between UI steps (`min,max`). |

## Security & secrets

- **No password is ever read, stored, or logged** — login is interactive in a real browser.
- Your **session cookies** live in `./session/` and the **scheduler DB** in `./data/`. Both are
  gitignored. **Treat `./session/` like a password** — anyone with it can act as you on LinkedIn.
- `.gitignore` covers `session/`, `data/`, `.env`, `*.sqlite`, `dist/`, `node_modules/`.

## Selector maintenance (expect this)

LinkedIn's markup changes constantly. **Every LinkedIn selector lives in one file:**
[`src/linkedin/selectors.ts`](./src/linkedin/selectors.ts). When a tool errors with
*"update src/linkedin/selectors.ts"*, or `linkedin_session_status` warns that a selector drifted,
fix the locator there — nowhere else. The comment / feed / page selectors are **best-effort** and
may need a live tuning pass against your account the first time you use those tools.

## Known limitations

- The exact URL of a new post isn't always captured (LinkedIn doesn't reliably expose it).
- `read_feed`, `list_pages`, and comment parsing are best-effort and sensitive to DOM changes.
- Replying **as a Page** isn't supported (LinkedIn doesn't reliably expose the identity switcher in reply boxes).
- Text posts only — no media/video upload.
- Not the official API; no analytics, messaging, or connection management.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
npm test            # node:test — scheduler + validation (no browser, no network)
npm run smoke       # boot the server in-memory and list tools (no LinkedIn contact)
npm run dev         # run from source via tsx
```

The scheduler is unit-tested with the browser mocked (the worker takes an injectable `poster`).
Live LinkedIn flows are verified manually — never in CI (needs a real session and would violate ToS).

## License

MIT — see [LICENSE](./LICENSE).
