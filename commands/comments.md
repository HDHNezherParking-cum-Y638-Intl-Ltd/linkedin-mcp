---
description: Read comments on your recent LinkedIn posts and draft replies
argument-hint: "[post URL/URN — or blank to pick from your recent posts]"
allowed-tools:
  [
    "mcp__plugin_linkedin_linkedin__linkedin_session_status",
    "mcp__plugin_linkedin_linkedin__list_my_posts",
    "mcp__plugin_linkedin_linkedin__read_post_comments",
    "mcp__plugin_linkedin_linkedin__reply_to_comment",
  ]
---

Triage comments. Target: **$ARGUMENTS**

1. `linkedin_session_status` — if not logged in, stop and point at `/linkedin:login`.
2. Pick the post:
   - $ARGUMENTS holds a URL or activity/share URN → use it directly.
   - Otherwise `list_my_posts` and let the user choose; pass the `ref` through.
3. `read_post_comments` on that post. Summarise: who said what, and which comments actually
   warrant a reply (a question, a correction, a genuine objection) versus which are noise.
4. For each reply the user wants: draft it, **show it, get approval, then** `reply_to_comment`
   with the `commentRef` from step 3. Replies are public and cannot be deleted from here.
5. Replying **as a Page** is not supported — LinkedIn does not reliably expose the identity
   switcher in reply boxes. Say so instead of silently replying as the person.

Never mass-reply. One considered reply at a time; bulk activity is what gets accounts restricted.
