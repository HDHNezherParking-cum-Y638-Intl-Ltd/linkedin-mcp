/** All MCP tool definitions. Each handler is a thin adapter: the SDK validates input against
 *  the zod shape, we call the action, and map any thrown error to a friendly isError result
 *  (never throw across the stdio boundary). */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Deps } from './server.js';
import { ok, err, NotLoggedInError, type ToolResult } from './util.js';
import { login, sessionStatus } from './linkedin/session.js';
import { createPost, createPagePost, listMyPosts } from './linkedin/posts.js';
import { readPostComments, replyToComment } from './linkedin/comments.js';
import { listPages } from './linkedin/pages.js';
import { readFeed } from './linkedin/feed.js';
import { parseFutureIso } from './scheduler/time.js';

function toErr(e: unknown): ToolResult {
  if (e instanceof NotLoggedInError) return err(e.message);
  return err(e instanceof Error ? e.message : String(e));
}

const RO = { readOnlyHint: true } as const;
const RW = { readOnlyHint: false } as const;

export function registerTools(server: McpServer, deps: Deps): void {
  const { browser, db } = deps;

  server.registerTool(
    'linkedin_login',
    {
      title: 'Log in to LinkedIn',
      description:
        'Open a real Chromium window and wait for you to log in manually (including 2FA / ' +
        'security checkpoints). The session is saved locally and reused; your password is ' +
        'never read or stored. Run once, or again if the session expires.',
      inputSchema: {},
      annotations: RW,
    },
    async () => {
      try {
        const r = await login(browser);
        if (r.loggedIn) return ok(`Logged in${r.name ? ' as ' + r.name : ''}. Session saved locally.`);
        return err('Login not completed before timeout. Re-run linkedin_login and finish signing in.');
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'linkedin_session_status',
    {
      title: 'Check LinkedIn session',
      description:
        'Report whether the saved LinkedIn session is still logged in, and warn if core page ' +
        'selectors have drifted (a maintenance signal).',
      inputSchema: {},
      annotations: RO,
    },
    async () => {
      try {
        const s = await sessionStatus(browser);
        if (!s.loggedIn) return ok('Not logged in. Run linkedin_login.');
        const warn = s.brokenSelectors.length
          ? ` WARNING: selectors need updating: ${s.brokenSelectors.join(', ')} (edit src/linkedin/selectors.ts).`
          : '';
        return ok(`Logged in${s.name ? ' as ' + s.name : ''}.${warn}`);
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create a post',
      description: 'Publish a text post to your personal LinkedIn profile.',
      inputSchema: {
        text: z.string().min(1).max(3000).describe('Post body.'),
      },
      annotations: RW,
    },
    async (args) => {
      try {
        const r = await createPost(browser, { text: args.text });
        return ok(`Posted to your profile.${r.postUrl ? ' ' + r.postUrl : ''}`);
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule a post',
      description:
        'Queue a post to be published later by the local scheduler. It fires ONLY while this ' +
        'server process is running; if the machine is off at the scheduled time, it posts on ' +
        'the next tick after the process is running again.',
      inputSchema: {
        text: z.string().min(1).max(3000),
        scheduledAt: z.string().describe('ISO-8601 future time, e.g. 2026-07-23T14:30:00Z.'),
        asPage: z
          .string()
          .optional()
          .describe('Page name or id (from list_pages) to post AS. Omit for personal profile.'),
      },
      annotations: RW,
    },
    async (args) => {
      try {
        const when = parseFutureIso(args.scheduledAt);
        const job = db.enqueue({
          text: args.text,
          scheduledAt: when.toISOString(),
          asPageId: args.asPage ?? null,
        });
        return ok(
          `Scheduled post #${job.id} for ${job.scheduled_at}${args.asPage ? ' as ' + args.asPage : ''}.`,
        );
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'list_scheduled_posts',
    {
      title: 'List scheduled posts',
      description: 'List queued/scheduled posts and their status.',
      inputSchema: {
        status: z.enum(['pending', 'posting', 'posted', 'failed', 'canceled']).optional(),
      },
      annotations: RO,
    },
    async (args) => {
      try {
        const jobs = db.list(args.status);
        if (jobs.length === 0) return ok('No scheduled posts.');
        const lines = jobs.map(
          (j) =>
            `#${j.id} [${j.status}] ${j.scheduled_at}${j.as_page_id ? ' as ' + j.as_page_id : ''} — ` +
            `${j.text.slice(0, 60)}${j.last_error ? ' (error: ' + j.last_error + ')' : ''}`,
        );
        return ok(lines.join('\n'));
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'cancel_scheduled_post',
    {
      title: 'Cancel a scheduled post',
      description: 'Cancel a still-pending scheduled post by id.',
      inputSchema: { id: z.number().int().positive() },
      annotations: RW,
    },
    async (args) => {
      try {
        const done = db.cancel(args.id);
        return ok(
          done
            ? `Canceled scheduled post #${args.id}.`
            : `Post #${args.id} is not pending (already posted/failed/canceled, or does not exist).`,
        );
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'list_my_posts',
    {
      title: 'List my recent posts',
      description: 'List your recent posts (their refs can be passed to read_post_comments).',
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      annotations: RO,
    },
    async (args) => {
      try {
        const posts = await listMyPosts(browser, args.limit ?? 10);
        if (posts.length === 0) return ok('No recent posts found.');
        return ok(
          posts.map((p, i) => `${i + 1}. ${p.text || '(no text)'}\n   ref: ${p.ref || '(none)'}`).join('\n'),
        );
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'read_post_comments',
    {
      title: 'Read comments on a post',
      description: 'Read comments on a post. `post` is a post URL or an activity/share URN.',
      inputSchema: {
        post: z.string().min(1).describe('Post URL or activity/share URN.'),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: RO,
    },
    async (args) => {
      try {
        const comments = await readPostComments(browser, {
          post: args.post,
          ...(args.limit ? { limit: args.limit } : {}),
        });
        if (comments.length === 0) return ok('No comments found.');
        return ok(
          comments.map((c, i) => `${i + 1}. ${c.author || 'Unknown'}: ${c.text}\n   ref: ${c.ref}`).join('\n'),
        );
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'reply_to_comment',
    {
      title: 'Reply to a comment',
      description: 'Reply to a comment (use commentRef from read_post_comments).',
      inputSchema: {
        post: z.string().min(1),
        commentRef: z.string().min(1),
        text: z.string().min(1).max(1250),
        asPage: z
          .string()
          .optional()
          .describe('Not supported: replying under a Page identity is not reliably exposed by LinkedIn.'),
      },
      annotations: RW,
    },
    async (args) => {
      try {
        if (args.asPage) {
          return err(
            'Replying as a Page is not supported in this build (LinkedIn does not reliably ' +
              'expose the identity switcher in reply boxes). Omit asPage to reply as yourself.',
          );
        }
        await replyToComment(browser, {
          post: args.post,
          commentRef: args.commentRef,
          text: args.text,
        });
        return ok('Reply posted.');
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'list_pages',
    {
      title: 'List Pages',
      description:
        'List Company/showcase Pages surfaced to your account. Best-effort — may include ' +
        'followed (non-admin) companies; verify admin rights before posting as a Page.',
      inputSchema: {},
      annotations: RO,
    },
    async () => {
      try {
        const pages = await listPages(browser);
        if (pages.length === 0) {
          return ok('No Pages found in your feed. If you admin a Page, open it once in the browser and retry.');
        }
        return ok(pages.map((p) => `- ${p.name} (id: ${p.id})\n  ${p.url}`).join('\n'));
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'create_page_post',
    {
      title: 'Post as a Page',
      description:
        'Publish a text post AS a Company/showcase Page you admin. `page` is the Page name or ' +
        'id from list_pages.',
      inputSchema: {
        page: z.string().min(1).describe('Page name or id (from list_pages) to post as.'),
        text: z.string().min(1).max(3000),
      },
      annotations: RW,
    },
    async (args) => {
      try {
        const r = await createPagePost(browser, { page: args.page, text: args.text });
        return ok(`Posted as page "${args.page}".${r.postUrl ? ' ' + r.postUrl : ''}`);
      } catch (e) {
        return toErr(e);
      }
    },
  );

  server.registerTool(
    'read_feed',
    {
      title: 'Read home feed',
      description: 'Read a light snapshot of your home feed (best-effort; feed layout changes often).',
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      annotations: RO,
    },
    async (args) => {
      try {
        const items = await readFeed(browser, args.limit ?? 10);
        if (items.length === 0) return ok('Feed appears empty or could not be parsed.');
        return ok(items.map((it, i) => `${i + 1}. ${it.author || 'Unknown'}: ${it.text || '(no text)'}`).join('\n'));
      } catch (e) {
        return toErr(e);
      }
    },
  );
}
