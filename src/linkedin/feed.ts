/** Light home-feed snapshot for "view my account". Feed DOM is the most volatile surface;
 *  this is best-effort — tune selectors.ts feedPosts/postText/postAuthor if it drifts. */
import { humanDelay } from '../util.js';
import { config } from '../config.js';
import { sel } from './selectors.js';
import type { BrowserSession } from '../browser.js';
import { ensureFeed } from './session.js';

export interface FeedItem {
  author: string;
  text: string;
}

export function readFeed(browser: BrowserSession, limit = 10): Promise<FeedItem[]> {
  return browser.run(async (page) => {
    await ensureFeed(page); // lands on /feed
    await humanDelay(config.pacing);
    const items = sel.feedPosts(page);
    await items.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const n = Math.min(await items.count(), limit);
    const out: FeedItem[] = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      const author = ((await sel.postAuthor(item).innerText().catch(() => '')) || '').trim();
      const text = ((await sel.postText(item).innerText().catch(() => '')) || '').trim().slice(0, 280);
      out.push({ author, text });
    }
    return out;
  });
}
