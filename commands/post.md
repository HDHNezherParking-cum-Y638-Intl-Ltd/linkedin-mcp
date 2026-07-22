---
description: Draft and publish a LinkedIn post, to your profile or to a Page you admin
argument-hint: "[what the post should say]"
allowed-tools:
  [
    "mcp__plugin_linkedin_linkedin__linkedin_session_status",
    "mcp__plugin_linkedin_linkedin__list_pages",
    "mcp__plugin_linkedin_linkedin__create_post",
    "mcp__plugin_linkedin_linkedin__create_page_post",
  ]
---

Publish a post. Topic / draft from the user: **$ARGUMENTS**

1. `linkedin_session_status` — if not logged in, stop and point at `/linkedin:login`.
2. Draft the post from $ARGUMENTS. Keep it under 3000 characters. Match the user's own voice;
   if you have no sample of it, ask rather than inventing a house style. No hashtag spam,
   no invented facts, no fabricated metrics or quotes.
3. **Show the full draft and get explicit approval before publishing.** Publishing is public and
   irreversible from here — this server has no delete tool.
4. Identity:
   - Personal profile (default) → `create_post`.
   - "as <Page>" → `list_pages` first, confirm the exact Page, then `create_page_post`.
     `list_pages` is best-effort and can list Pages the user merely follows; confirm they
     actually admin it before posting.
5. Report the result and any URL returned. LinkedIn does not always expose the new post's URL —
   if it is missing, say so plainly rather than guessing one.

For a future publish time, use `/linkedin:schedule` instead.
