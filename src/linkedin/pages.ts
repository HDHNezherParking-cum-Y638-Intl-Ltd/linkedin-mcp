/** Enumerate the Company/showcase Pages surfaced to the account.
 *  NOTE: LinkedIn has no stable public "pages I admin" list URL; this scans the company
 *  links surfaced on the feed (My Pages module etc.) and de-dupes. It is best-effort and
 *  may include followed (non-admin) companies — verify admin rights before posting as a
 *  Page. Tune the source in selectors.ts if LinkedIn moves the module. */
import { config } from '../config.js';
import { humanDelay } from '../util.js';
import { sel } from './selectors.js';
import type { BrowserSession } from '../browser.js';
import { ensureFeed } from './session.js';

export interface PageInfo {
  name: string;
  url: string;
  id: string;
}

export function listPages(browser: BrowserSession): Promise<PageInfo[]> {
  return browser.run(async (page) => {
    await ensureFeed(page); // lands on /feed
    await humanDelay(config.pacing);
    const links = sel.companyLinks(page);
    const n = await links.count();
    const seen = new Map<string, PageInfo>();
    for (let i = 0; i < n; i++) {
      const a = links.nth(i);
      const href = (await a.getAttribute('href').catch(() => null)) ?? '';
      const m = href.match(/\/company\/([^/?#]+)/);
      if (!m || !m[1]) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      const name = ((await a.innerText().catch(() => '')) || id).trim() || id;
      seen.set(id, { name, url: `${config.baseUrl}/company/${id}/`, id });
    }
    return [...seen.values()];
  });
}
