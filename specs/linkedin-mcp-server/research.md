---
spec: linkedin-mcp-server
phase: research
created: 2026-07-22
---

# Research: linkedin-mcp-server

## Executive Summary

Decided design is sound and matches the safest known pattern for this problem (local stdio MCP + Playwright driving a **real** browser under the user's **own** logged-in session on a **residential** IP — the exact config that avoids LinkedIn's "cookie-from-datacenter" detection trap). Main refinements: **pin the MCP SDK to stable v1 (`@modelcontextprotocol/sdk@^1.29`) — do NOT ride the v2 beta** (released `2.0.0-beta.5` on 2026-07-21, renamed packages, API still churning, stable ~2026-07-28); **prefer `launchPersistentContext` over a bare `storageState` file** for a more human, stable fingerprint; and **centralize all DOM selectors in one module** because they will break. Everything else (SQLite + poll-loop scheduler, one-tool-per-action, headful-first login) is confirmed.

---

## External Research

### 1. MCP TypeScript SDK — current API

| Fact | Value | Source |
|------|-------|--------|
| Latest published | `2.0.0-beta.5` (2026-07-21) — **beta** | GH releases |
| Latest **stable** | `@modelcontextprotocol/sdk@1.29.x` (v1 line) | npm |
| v2 stable target | ~2026-07-28 (MCP spec date); still beta today | GH |
| v2 breaking change | package split: `@modelcontextprotocol/server` + `/client` + `/core` (NOT the unified `/sdk`), Zod v4 | GH README |
| Recommended tool API | `registerTool` (legacy `tool()` still works, deprecated for new code) | SDK docs |

Stable v1 idiom (confirmed):
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "linkedin-mcp", version: "0.1.0" });

server.registerTool(
  "create_post",
  {
    title: "Create post",
    description: "Publish a post to the logged-in personal profile.",
    inputSchema: { text: z.string().describe("Post body") }, // RAW zod shape, not z.object()
  },
  async ({ text }) => ({ content: [{ type: "text", text: "posted" }] }),
);

await server.connect(new StdioServerTransport());
```
- `inputSchema` is a **raw shape object** of zod validators; SDK wraps in `z.object` internally.
- Handler returns `{ content: [...] }`; signal failure with `{ content: [...], isError: true }` (return errors as data so the LLM sees them, don't throw).
- **Unverified / conflicting:** whether a bare `npm i @modelcontextprotocol/sdk` resolves to 1.29 or a 2.x beta dist-tag — sources disagreed. **Mitigation: pin `@modelcontextprotocol/sdk@^1.29.0` explicitly**, which removes the ambiguity regardless.

### 2. Playwright session persistence

| Option | What it is | Fit for LinkedIn |
|--------|-----------|------------------|
| `storageState` (JSON) | Temp context + injected cookies/localStorage. Cheap, file-based, easy to back up. | OK. Simple. Re-injects a session into a *fresh* context each run. |
| `launchPersistentContext(userDataDir)` | Real on-disk browser profile (cookies + cache + localStorage + profile entropy). | **Better.** Stable, aging profile looks more human; fewer "brand-new context every time" tells. One context at a time, tied to a dir. |

- `li_at` is the auth session cookie; captured by either method. **It expires** (weeks–months, sooner on password change / security events) → a `session-status` tool + re-login path is mandatory (approx duration unverified, treat as "will expire, detect and re-auth").
- Capture: after manual headful login, `await context.storageState({ path: "storage_state.json" })`.
- **Headless is more detectable than headed.** Use a real Chrome (`channel: "chrome"`) not bundled Chromium to reduce fingerprint anomalies; if restrictions appear, fall back to headed/backgrounded. Playwright sets `navigator.webdriver`; stealth plugins exist but add deps — skip until needed (IP + real browser + pacing are the bigger levers).

### 3. LinkedIn automation reality (2025/2026)

- Detection is aggressive and layered: **TLS/JA3 fingerprint, HTTP/2 header order, a ~48-point device fingerprint** (canvas/audio/fonts, WebRTC local IP), an in-page extension scanner (thousands of targets), DOM checks, and automation flags.
- **Key insight that validates our design:** copying a cookie into a script is the right mental model but the wrong *implementation when the fingerprint/IP don't match* — "once the fingerprint is wrong, the cookie becomes evidence rather than authentication." Our design (real local Chrome, user's residential IP, the user's own established session) is precisely the configuration that keeps the cookie as valid auth. **This is the low-risk path; do not move it to a cloud/datacenter host.**
- LinkedIn **restricts before it bans.** Documented triggers: high volume (e.g. >100 connection requests/week cited), scraping at scale, fake profiles, datacenter IPs, obvious automation fingerprints.
- Stay-under-radar for a low-volume personal poster: user-initiated only, **human-paced random delays**, low daily volume, reuse the established session (don't re-login repeatedly), never run from cloud, real browser.

### 4. DOM interaction strategy

- Playwright's own guidance: **user-facing locators first** — `getByRole` (95% of cases), `getByLabel`/aria-label, `getByText`/`getByPlaceholder`. These survive CSS class churn (LinkedIn obfuscates + rotates classes constantly). Avoid class/`data-*` selectors unless proven stable.
- Durable anchors to target (verify against live DOM at build time):
  - Composer open: `getByRole("button", { name: /start a post/i })`
  - Publish: `getByRole("button", { name: "Post" })` (inside the composer dialog)
  - Comment box: field with aria-label like "Add a comment"
  - Comment author/text: read within the comment article/list items by role/text, not classes
- **Non-negotiable design mandate:** put every selector in ONE module (e.g. `src/selectors.ts`) so a LinkedIn redesign is a one-file fix. Add a startup smoke check that fails loudly when a critical selector matches 0 nodes.
- Text-based locators are **locale-dependent** → pin the account UI language or match tolerantly. Expect A/B variants; selectors WILL break — design for it, don't fight it.
- Prior-art READMEs (below) did not expose stable selectors → they must be derived empirically during implementation and treated as fragile config, not spec.

### 5. "Post as a Page"

- Flow: log in as the personal profile, then in the composer use the **author/identity switcher** (avatar dropdown at top of "Start a post" — "Post as [You] ▾") to select a Page you admin; OR post from the Page's **admin view** (`linkedin.com/company/<id>/admin/`).
- Requires **super admin or content admin** role on the Page. If the Page isn't offered in the switcher, role/verification is missing or an A/B variant is active — handle "page not in switcher" gracefully.
- Enumerate admin pages: the "My Pages" / Page-switcher list in the LinkedIn nav (me-menu → Manage, or the Pages hub left rail). Read the list via role/text locators.
- Reading/replying to comments on Page posts: **same comment UI mechanics** as personal; the differences are (a) you reach them from the Page's admin activity/feed and (b) replies are attributed to the Page identity. (LinkedIn Help: "Post as your LinkedIn Page".)

### 6. Node local scheduling

- **SQLite lib: `better-sqlite3`** — synchronous API, single-process, fast, no async ceremony. Confirmed standard for exactly this (in-process, single writer).
- **Queue: do NOT add a job-queue library.** Lazy-correct = one table `scheduled_posts(id, run_at, payload_json, status)` + a single `setInterval` poll (~30–60s) that `SELECT ... WHERE status='pending' AND run_at <= now()`, marks `processing`, drives Playwright, marks `done`/`failed`. Restart-safe (state lives in DB), catches up overdue rows on next tick for free.
- `node-cron`/`croner` = **recurring cron expressions**, wrong shape for one-shot due-times (overkill). `setTimeout`-per-job = **lost on restart**. Polling + DB wins on both.
- Use **WAL mode**. Single writer (the server) → no concurrency headaches.
- **Documented limitation (must surface in README + tool output):** posts only fire while the server process is running. If the machine is asleep/off at `run_at`, the post fires **late** (next tick after wake) — the poll picks up overdue rows on start. Optional `max_staleness` guard: skip + mark `missed` if >N hours late instead of posting stale content. (ponytail: catch-up is free; add the missed-guard only if it matters.)

### 7. Prior art

| Project | Stack / license | Reusable lesson |
|---------|-----------------|-----------------|
| `alinaqi/mcp-linkedin-server` | Python, Playwright, FastMCP, **MIT** | Headful secure login + session persistence + recovery is the established pattern. ~5 tools (feed/profile/interact). No selectors exposed. |
| `Eldasoky1/linkedin-mcp` | Playwright, real Chromium, 20 tools | Confirms feasibility of our exact approach: real browser vs web UI, bypassing unofficial APIs. |
| `Bishwas-py/supermcp` (+ dev.to writeup) | Playwright, reuses existing Chrome session, no API key / no cloud | Closest to our design — reuse the user's established local session, local-only. Safest pattern. |
| `southleft/linkedin-mcp` | Playwright fallback + LinkedIn Community Management API | Shows an official comments/reactions API exists if web scraping ever becomes untenable (not our path today). |
| `microsoft/playwright-mcp` | Official Playwright MCP | Reference for MCP-over-Playwright wiring, not LinkedIn-specific. |

Lessons: most are MIT — **read for patterns, don't vendor code** (and avoid GPL). Universal pain points across all: selectors break on redesigns; volume triggers restrictions. None solve the fragility — they just re-fix selectors when they break, which is why the one-module selector design matters.

### 8. ToS / risk framing (for README + tool descriptions)

Automating LinkedIn through a logged-in web session violates the **LinkedIn User Agreement** (prohibits bots, scraping, and automated access/use of the service). Doing so risks account **restriction or permanent ban**, and LinkedIn typically restricts before banning. Mitigate by keeping this **personal-account-only, user-initiated, low-volume, human-paced, and local (residential IP, real browser) — never cloud/datacenter, never bulk**. There are no guarantees; the user accepts the risk. This warning must appear in the README and be echoed in tool descriptions so the calling LLM/user is on notice.

---

## Codebase Analysis

### Existing patterns
- Greenfield: only `LICENSE`, `README.md` (14 bytes), `.gitignore`, and this spec dir. No `package.json`, no source. Nothing to reuse; nothing constrains stack choices.

### Constraints (from repo + hard constraints)
- **No git commit/push at any point** (overrides ralph auto-commit/land).
- **`.gitignore` already covers the secret surface**: `.env*`, `storage_state.json` / `*.storage_state.json` / `session/` / `auth/`, `*.sqlite*` / `*.db` / `data/`, Playwright artifacts. ✅
  - **Gap to close in design:** if `launchPersistentContext` is chosen, its `userDataDir` must live under an already-ignored path (`session/` or `auth/`) or add its dir — a stray `user-data-dir/` would leak auth cookies.

### Related Specs
- **None.** Single spec in repo (`linkedin-mcp-server`). No overlap/conflict to track.

---

## Quality Commands

Greenfield — none exist yet. Planned (design/task-planner should establish these in `package.json`):

| Type | Command (planned) | Source |
|------|-------------------|--------|
| Lint | `npm run lint` (eslint) | Not found — to be added |
| TypeCheck | `npm run typecheck` (`tsc --noEmit`) | Not found — to be added |
| Unit Test | `npm test` (node:test or vitest) | Not found — to be added |
| Integration/E2E | n/a (see Verification Tooling) | Not found |
| Build | `npm run build` (`tsc`) | Not found — to be added |

**Local CI (planned):** `npm run lint && npm run typecheck && npm test && npm run build`

---

## Verification Tooling

| Tool | Status | Notes |
|------|--------|-------|
| Dev server | n/a | It's a stdio MCP server, not an HTTP app. "Run" = spawn the binary, list tools over stdio. |
| Browser automation | Playwright (to be added) | Also usable to smoke-test selectors against live LinkedIn. |
| E2E config | none | No CI E2E against LinkedIn (needs real logged-in session; running it in CI both fails and violates ToS). |
| Port / health endpoint | none | stdio transport; "health" = server boots + `tools/list` responds. |
| Docker | none / discouraged | Containerizing pushes toward datacenter IP + non-real browser = higher ban risk. Keep it on the user's machine. |

**Project type:** Local stdio MCP server (Node/TypeScript).
**Verification strategy:** (1) build (`tsc`) + boot check: server starts and returns the ~12 tools over stdio; (2) unit-test pure logic (scheduler due-time query, payload validation) with mocked Playwright; (3) **manual/local** smoke against a real logged-in session for the browser flows — **not** automatable in CI.

---

## Feasibility Assessment

| Aspect | Assessment | Notes |
|--------|------------|-------|
| Technical viability | **High** | Every piece is proven; multiple prior-art projects do this. |
| Effort | **M–L** | Wiring is small; the cost is Playwright flows + selector maintenance + login/session UX. |
| Risk level | **Medium** | Not technical risk — **account restriction** risk (ToS) + selector churn. Both are managed, not eliminated. |

---

## Recommendations

Each decided design point — confirm or adjust:

1. **Stack (TS + `@modelcontextprotocol/sdk` + Playwright)** — ✅ **Confirm**, with: **pin `@modelcontextprotocol/sdk@^1.29` (stable v1); do NOT install v2 beta.** Use `McpServer` + `registerTool` + `StdioServerTransport`. Revisit v2 only after its stable release (~2026-07-28) and only if a v2 feature is needed.
2. **Headful-first login → persist → reuse** — ✅ **Confirm.** Adjust: use **`channel: "chrome"`** (real Chrome), and **prefer `launchPersistentContext(userDataDir)`** over a bare `storageState` file for a stabler/more-human profile. Keep `storageState` export as a portable backup. Note headless raises detection risk — keep headed as the fallback.
3. **SQLite queue + poll-loop worker** — ✅ **Confirm.** `better-sqlite3` + `setInterval` poll over a `scheduled_posts` table. **No job-queue dependency, no `node-cron`.** WAL mode. Document the "only fires while running / late-fires overdue on restart" limitation; optional `max_staleness` → `missed`.
4. **~12 one-tool-per-action tools** — ✅ **Confirm.** Add a `session-status` tool (detect expired `li_at` and prompt re-login) — already in the list; make it first-class since sessions expire.
5. **Selector handling** — ⚠️ **Add constraint:** all selectors in ONE module using `getByRole`/aria/text; startup smoke check fails loudly on 0-match. Treat selectors as fragile config, expect breakage, budget for it.
6. **Risk posture** — ✅ **Confirm + enforce:** local/residential only, low volume, human-paced delays, user-initiated, personal account. Never cloud/Docker. ToS warning in README + tool descriptions.
7. **Secrets** — ✅ `.gitignore` sufficient; in design, ensure any persistent-context `userDataDir` sits under an ignored path.

---

## Risks & Unknowns

- **MCP SDK v2 timing:** stable lands ~6 days out (2026-07-28) with renamed packages. Pinning v1 avoids scaffolding on a moving beta; flagged because a naive `npm i` might pull a 2.x tag — **pin explicitly.** *(Version-resolution behavior of the bare install was the one point sources conflicted on.)*
- **Selector fragility (highest ongoing cost):** LinkedIn redesigns/A-B tests + locale variance break locators. Mitigated by the one-module design, not eliminated.
- **Account restriction (highest consequence):** inherent ToS risk; mitigated by low-volume/local/real-browser, never zero.
- **`li_at` expiry:** exact lifetime unverified (weeks–months, event-driven). Handle via `session-status` + re-login, don't assume a fixed TTL.
- **Post-as-Page DOM:** identity-switcher exact markup not verified at selector level — derive empirically; handle "Page absent from switcher".
- **Scheduler durability:** bounded by process uptime by design (documented, not a bug). Machine asleep at `run_at` ⇒ late/missed fire.

---

## Key References

- MCP TS SDK repo/releases: https://github.com/modelcontextprotocol/typescript-sdk , https://github.com/modelcontextprotocol/typescript-sdk/releases
- MCP v2 Server Guide: https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Server_Guide.html
- MCP SDK on npm: https://www.npmjs.com/package/@modelcontextprotocol/sdk
- Playwright auth/storageState vs persistent context: https://dev.to/web4browser/playwright-storagestate-vs-persistent-context-which-one-should-you-use-for-multi-account-k86 , https://www.browserstack.com/guide/playwright-persistent-context
- Playwright locator best practices: https://momentic.ai/blog/playwright-locators-guide , https://qaskills.sh/blog/playwright-locator-strategies-getbyrole-guide
- LinkedIn detection engine study: https://www.linkedhelper.com/blog/linkedin-automation-security-study/
- LinkedIn automation risk (2026): https://getsales.io/blog/linkedin-automation-safety-guide-2026/ , https://www.linkednav.com/blog/will-linkedin-ban-me-for-using-automation
- Cookie-based posting (no official API): https://dev.to/aniefon_umanah_ac5f21311c/publishing-to-linkedin-without-the-official-api-a-cookie-based-approach-5enf
- LinkedIn Help — Post as your Page: https://www.linkedin.com/help/linkedin/answer/a1660869 ; admin roles: https://www.linkedin.com/help/linkedin/answer/a541981
- Prior art: https://github.com/alinaqi/mcp-linkedin-server , https://github.com/Bishwas-py/supermcp , https://github.com/southleft/linkedin-mcp , https://github.com/microsoft/playwright-mcp
- SQLite job queue patterns: https://gist.github.com/leafac/eabf18127d72fa59328e44c50def92eb , https://github.com/WiseLibs/better-sqlite3
