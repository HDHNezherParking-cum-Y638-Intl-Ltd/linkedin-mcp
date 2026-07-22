/** Reading and replying to comments on a post (personal or Page post — same mechanics). */
import type { Page, Locator } from 'playwright';
import { config } from '../config.js';
import { humanDelay, SelectorError } from '../util.js';
import { sel, visible } from './selectors.js';
import type { BrowserSession } from '../browser.js';
import { ensureFeed } from './session.js';

export interface CommentRead {
  author: string;
  text: string;
  /** Opaque reference usable as commentRef in reply_to_comment. */
  ref: string;
}

/** Accept a full post URL, or a bare activity/share URN. */
function toPostUrl(post: string): string {
  const p = post.trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `${config.baseUrl}/feed/update/${encodeURIComponent(p)}/`;
}

async function openPost(page: Page, post: string): Promise<void> {
  await page.goto(toPostUrl(post), { waitUntil: 'domcontentloaded' });
  await humanDelay(config.pacing);
  if (/\/(login|authwall|uas\/login)/.test(page.url())) {
    throw new SelectorError('post page (not logged in, or post not accessible)');
  }
}

export function readPostComments(
  browser: BrowserSession,
  input: { post: string; limit?: number },
): Promise<CommentRead[]> {
  const limit = input.limit ?? 20;
  return browser.run(async (page) => {
    await ensureFeed(page);
    await openPost(page, input.post);
    const items = sel.commentItems(page);
    await items.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const n = Math.min(await items.count(), limit);
    const out: CommentRead[] = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      const author = ((await sel.commentAuthor(item).innerText().catch(() => '')) || '').trim();
      const text = ((await sel.commentText(item).innerText().catch(() => '')) || '').trim();
      const ref = (await item.getAttribute('data-id').catch(() => null)) ?? String(i);
      out.push({ author, text: text.slice(0, 500), ref });
    }
    return out;
  });
}

export function replyToComment(
  browser: BrowserSession,
  input: { post: string; commentRef: string; text: string },
): Promise<{ ok: true }> {
  return browser.run(async (page) => {
    await ensureFeed(page);
    await openPost(page, input.post);
    const item = await findComment(page, input.commentRef);
    const replyBtn = sel.commentReplyBtn(item);
    if ((await replyBtn.count()) === 0) throw new SelectorError('comment "Reply" button');
    await replyBtn.click();
    await humanDelay(config.pacing);

    const editor = sel.replyEditor(item);
    if (!(await visible(editor, 8000))) throw new SelectorError('reply editor');
    await editor.click();
    await editor.pressSequentially(input.text, { delay: 15 });
    await humanDelay(config.pacing);

    const submit = sel.replySubmit(item);
    if (!(await visible(submit, 8000))) throw new SelectorError('reply submit button');
    await submit.click();
    await humanDelay([1200, 2000]);
    return { ok: true };
  });
}

async function findComment(page: Page, commentRef: string): Promise<Locator> {
  const byId = page.locator(`[data-id="${commentRef.replace(/["\\]/g, '\\$&')}"]`);
  if ((await byId.count()) > 0) return byId.first();
  const idx = Number(commentRef);
  if (Number.isInteger(idx) && idx >= 0) {
    const items = sel.commentItems(page);
    if (idx < (await items.count())) return items.nth(idx);
  }
  throw new SelectorError(`comment ref "${commentRef}" (re-run read_post_comments for current refs)`);
}
