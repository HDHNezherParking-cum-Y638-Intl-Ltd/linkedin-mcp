---
name: linkedin-account
description: Operating rules for the bundled LinkedIn MCP server, which drives a real local Chrome under the user's own logged-in session. Use whenever the user wants to post, schedule a post, read their feed, list or post as a Company/showcase Page, or read and reply to comments on LinkedIn — and whenever a LinkedIn tool fails with a selector or session error. Covers tool ordering, the approval rule before anything public, the local-scheduler caveat, and selector repair.
---

# LinkedIn account operations

This plugin automates the **LinkedIn website** through a real Chrome window running the user's
own logged-in session. It is not the official LinkedIn API. Everything below follows from that.

## Order of operations

1. `linkedin_session_status` before anything else. It is read-only and cheap, and every other
   tool fails confusingly without a session.
2. Not logged in → `linkedin_login`. It opens a headed browser and the **user** signs in by hand
   (2FA and device checkpoints included). No password is ever read or stored. Never try to type
   credentials for them; there is no tool that accepts a password, by design.
3. Reading tools (`read_feed`, `list_my_posts`, `read_post_comments`, `list_pages`) are safe to
   call freely. Writing tools are not — see below.

## Approval before anything public

`create_post`, `create_page_post`, `reply_to_comment`, and `schedule_post` all produce output
under the user's real name, to their real network. **Show the exact text and get an explicit
yes before calling them.** There is no delete or edit tool: a mistake has to be cleaned up by
hand on linkedin.com.

Never fabricate content the user would have to stand behind — no invented metrics, quotes,
customers, or credentials. If you lack a fact the draft needs, ask.

## Rate and volume

Automated activity is what gets accounts restricted, so keep it to what the user explicitly
asked for:

- One action per request. No loops over a list of posts, comments, or Pages.
- No bulk replies, no scraping sweeps of the feed, no "engage with everything" runs.
- If a user asks for volume, say plainly that it risks their account and offer the single-action
  version instead.

Automating LinkedIn web browsing violates the LinkedIn User Agreement and can get an account
rate-limited, restricted, or banned. Run it locally, at low volume, for the user's own account.

## Posting as a Page

`list_pages` is best-effort — it reads what the account surfaces and can include Pages the user
merely *follows*. Confirm the user actually admins a Page before `create_page_post`.

Replying to a comment **as a Page** is not supported: LinkedIn does not reliably expose the
identity switcher in reply boxes. Say so rather than replying as the person.

## The scheduler is local

`schedule_post` writes to a SQLite queue and a worker in this process publishes at the due time.
It fires **only while the server process is running**. If the machine is asleep or the client is
closed at that moment, the post goes out on the next poll afterwards — late. State this whenever
scheduling; for a guaranteed time, LinkedIn's own native scheduler is the right tool.

`scheduledAt` must be an ISO-8601 instant in the future (`2026-07-23T14:30:00Z`). Echo the time
back in the user's local timezone before queueing so a timezone slip surfaces immediately.

## When a tool breaks

LinkedIn ships markup changes constantly, so selector drift is the normal failure, not a bug in
the tool call. Two signals: `linkedin_session_status` warns that selectors drifted, or a tool
errors with *"update src/linkedin/selectors.ts"*.

Every LinkedIn locator lives in exactly one file — `src/linkedin/selectors.ts` in the plugin
root. Repair it there, nowhere else, then rebuild
(`node scripts/launch.mjs --build-only`) and verify with a read-only call before any write.
`/linkedin:doctor` walks this end to end.

## Known limits — state these instead of working around them

- Text posts only. No image, video, document, or poll upload.
- The URL of a newly created post is often not captured; LinkedIn does not reliably expose it.
- Feed, Page listing, and comment parsing are best-effort and sensitive to DOM changes.
- No messaging, no connection management, no analytics, no post deletion or editing.
