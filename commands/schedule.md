---
description: Schedule, list, or cancel LinkedIn posts in the local queue
argument-hint: "[post text and when — or 'list' / 'cancel <id>']"
allowed-tools:
  [
    "mcp__plugin_linkedin_linkedin__linkedin_session_status",
    "mcp__plugin_linkedin_linkedin__list_pages",
    "mcp__plugin_linkedin_linkedin__schedule_post",
    "mcp__plugin_linkedin_linkedin__list_scheduled_posts",
    "mcp__plugin_linkedin_linkedin__cancel_scheduled_post",
  ]
---

Manage the local post queue. Request: **$ARGUMENTS**

Route on intent:

- **list** → `list_scheduled_posts` (optionally filtered by status).
- **cancel** → `cancel_scheduled_post` with the id. Only `pending` jobs can be canceled.
- **schedule** → draft the text, resolve the time to an **ISO-8601 instant** (e.g.
  `2026-07-23T14:30:00Z`), echo it back in the user's local time to confirm you read it right,
  get approval on the draft, then `schedule_post`. Use `asPage` only for a Page confirmed via
  `list_pages`.

State this limit whenever you schedule something — it is the one that surprises people:

> The scheduler is local. A post fires only while this MCP server process is running. If the
> machine is asleep or Claude is closed at the scheduled time, it goes out on the next poll
> after the server is running again — not at the requested time.

If the user needs a guaranteed send time, tell them to use LinkedIn's own native scheduler.
