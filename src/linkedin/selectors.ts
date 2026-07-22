/** ALL LinkedIn DOM lives here. LinkedIn's markup churns constantly (class-name hashing,
 *  A/B tests, locale). Rule: prefer role/aria/text locators; use class names only as
 *  last-resort fallbacks (marked "fragile"). When something breaks, fix it in THIS file.
 *
 *  The comment/feed/page locators are best-effort and expected to need a live tuning pass
 *  against a real logged-in account — see README "Selector maintenance". */
import type { Page, Locator } from 'playwright';

export const sel = {
  // ---- auth signals (present only on an authenticated /feed) ----
  globalSearch: (p: Page): Locator => p.getByRole('combobox', { name: /search/i }),
  meNav: (p: Page): Locator =>
    p.locator('header, nav').getByRole('button', { name: /^Me\b/i }),

  // ---- composer ----
  startPost: (p: Page): Locator =>
    p.getByRole('button', { name: /start a post|create a post/i }).first(),
  composerDialog: (p: Page): Locator => p.getByRole('dialog'),
  editor: (p: Page): Locator =>
    p.getByRole('dialog').getByRole('textbox', { name: /text editor for creating content/i }),
  postSubmit: (p: Page): Locator =>
    p.getByRole('dialog').getByRole('button', { name: /^Post$/i }),
  /** "Post as ..." identity switcher inside the composer (for posting as a Page). */
  authorSwitcher: (p: Page): Locator =>
    p.getByRole('dialog').getByRole('button', { name: /post as|manage|change/i }).first(),

  // ---- comments (fragile — tune live) ----
  commentItems: (p: Page): Locator =>
    p.locator('article.comments-comment-entity, .comments-comment-item, [data-id^="urn:li:comment"]'),
  commentAuthor: (item: Locator): Locator =>
    item.locator('.comments-comment-meta__description-title, .comments-post-meta__name-text').first(),
  commentText: (item: Locator): Locator =>
    item.locator('.comments-comment-item__main-content, span[dir="ltr"]').first(),
  commentReplyBtn: (item: Locator): Locator =>
    item.getByRole('button', { name: /^Reply$/i }).first(),
  /** Reply editor that appears after clicking Reply on a comment. */
  replyEditor: (item: Locator): Locator =>
    item.getByRole('textbox').first(),
  replySubmit: (item: Locator): Locator =>
    item.getByRole('button', { name: /^(Reply|Post|Comment)$/i }).last(),

  // ---- feed / activity (fragile) ----
  feedPosts: (p: Page): Locator =>
    p.locator('div.feed-shared-update-v2, [data-urn*="urn:li:activity"]'),
  postText: (item: Locator): Locator =>
    item.locator('.update-components-text, .feed-shared-update-v2__description, span[dir="ltr"]').first(),
  postAuthor: (item: Locator): Locator =>
    item.locator('.update-components-actor__title, .update-components-actor__name').first(),

  // ---- pages ----
  companyLinks: (p: Page): Locator => p.locator('a[href*="/company/"]'),
};

/** Resolve true iff a locator becomes visible within `timeout` (isVisible() does NOT wait). */
export function visible(loc: Locator, timeout = 8000): Promise<boolean> {
  return loc
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/** Core locators that MUST resolve on a logged-in feed. Returns the names of any that
 *  currently match 0 elements — a non-empty result is a maintenance warning, not a crash. */
export async function assertCoreSelectors(page: Page): Promise<string[]> {
  const checks: [string, Locator][] = [
    ['globalSearch', sel.globalSearch(page)],
    ['startPost', sel.startPost(page)],
  ];
  const broken: string[] = [];
  for (const [name, loc] of checks) {
    const count = await loc.count().catch(() => 0);
    if (count === 0) broken.push(name);
  }
  return broken;
}
