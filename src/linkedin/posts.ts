/** Posting to the personal profile and (via the composer identity switcher) as a Page. */
import type { Page, Locator } from 'playwright';
import { config } from '../config.js';
import { humanDelay, SelectorError, escapeRegExp } from '../util.js';
import { sel, visible } from './selectors.js';
import type { BrowserSession } from '../browser.js';
import { ensureFeed } from './session.js';

export interface CreatePostInput {
  text: string;
  /** Page name or id to post AS (from list_pages). Omit to post as yourself. */
  asPage?: string;
}

/** Open composer on the feed, optionally switch identity to a Page, type text, submit. */
async function composeAndPost(page: Page, text: string, asPage?: string): Promise<string | undefined> {
  const start = sel.startPost(page);
  if ((await start.count()) === 0) throw new SelectorError('"Start a post" button');
  await start.first().click();
  await humanDelay(config.pacing);

  const dialog = sel.composerDialog(page);
  if (!(await visible(dialog, 15_000))) throw new SelectorError('post composer dialog');

  if (asPage) await switchAuthor(page, asPage);

  const editor = sel.editor(page);
  if (!(await visible(editor, 10_000))) throw new SelectorError('post text editor');
  await editor.click();
  await editor.pressSequentially(text, { delay: 15 });
  await humanDelay(config.pacing);

  const submit = sel.postSubmit(page);
  if (!(await visible(submit, 10_000))) throw new SelectorError('"Post" submit button');
  await submit.click();
  // Success signal: the composer dialog closes. If it stays open, the post did NOT go through
  // (validation error, checkpoint, or the Post button stayed disabled) — fail loudly so that
  // scheduled jobs are marked failed rather than silently "posted".
  const closed = await dialog
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!closed) {
    throw new Error(
      'Post did not complete — the composer is still open (LinkedIn may have shown a validation ' +
        'error or checkpoint, or the Post button stayed disabled).',
    );
  }
  await humanDelay([1200, 2200]);
  // Reliably capturing the new post URL from the UI is flaky; omit rather than fabricate.
  return undefined;
}

async function switchAuthor(page: Page, pageMatch: string): Promise<void> {
  const sw = sel.authorSwitcher(page);
  if ((await sw.count()) === 0) {
    throw new SelectorError('author/identity switcher ("Post as")');
  }
  await sw.first().click();
  await humanDelay(config.pacing);
  const option = page
    .getByRole('dialog')
    .getByText(new RegExp(escapeRegExp(pageMatch), 'i'))
    .first();
  if (!(await visible(option, 8000))) {
    throw new Error(
      `Page "${pageMatch}" not found in the "Post as" switcher. Confirm the name via ` +
        `list_pages and that you have admin rights on it.`,
    );
  }
  await option.click();
  await humanDelay(config.pacing);
}

export function createPost(
  browser: BrowserSession,
  input: CreatePostInput,
): Promise<{ postUrl?: string }> {
  return browser.run(async (page) => {
    await ensureFeed(page);
    const postUrl = await composeAndPost(page, input.text, input.asPage);
    return postUrl ? { postUrl } : {};
  });
}

export function createPagePost(
  browser: BrowserSession,
  input: { page: string; text: string },
): Promise<{ postUrl?: string }> {
  return browser.run(async (page) => {
    await ensureFeed(page);
    const postUrl = await composeAndPost(page, input.text, input.page);
    return postUrl ? { postUrl } : {};
  });
}

export interface MyPost {
  ref: string;
  text: string;
}

export function listMyPosts(browser: BrowserSession, limit = 10): Promise<MyPost[]> {
  return browser.run(async (page) => {
    await ensureFeed(page);
    await page.goto(`${config.baseUrl}/in/me/recent-activity/all/`, {
      waitUntil: 'domcontentloaded',
    });
    await humanDelay(config.pacing);
    const items = sel.feedPosts(page);
    await items.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const n = Math.min(await items.count(), limit);
    const out: MyPost[] = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      const urn = (await item.getAttribute('data-urn').catch(() => null)) ?? '';
      const text = ((await sel.postText(item).innerText().catch(() => '')) || '').trim().slice(0, 280);
      const ref = urn || (await permalinkFrom(item)) || '';
      if (ref || text) out.push({ ref, text });
    }
    return out;
  });
}

async function permalinkFrom(item: Locator): Promise<string | undefined> {
  const href = await item.getByRole('link').first().getAttribute('href').catch(() => null);
  return href ?? undefined;
}
