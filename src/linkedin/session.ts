/** Login + session-status. Auth = "an authenticated /feed renders". No password handled. */
import type { Page } from 'playwright';
import { config } from '../config.js';
import { humanDelay, NotLoggedInError } from '../util.js';
import { sel, visible, assertCoreSelectors } from './selectors.js';
import type { BrowserSession } from '../browser.js';

const FEED = `${config.baseUrl}/feed/`;
const UNAUTH = /\/(login|uas\/login|checkpoint\/challenge|authwall|signup)/;

/** Navigate to the feed and throw NotLoggedInError unless authenticated. Single navigation. */
export async function ensureFeed(page: Page): Promise<void> {
  await page.goto(FEED, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (UNAUTH.test(page.url())) throw new NotLoggedInError();
  if (!(await visible(sel.globalSearch(page), 8000))) throw new NotLoggedInError();
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await ensureFeed(page);
    return true;
  } catch {
    return false;
  }
}

/** Open a headed window and wait (up to LOGIN_TIMEOUT) for the user to finish manual login. */
export async function login(
  browser: BrowserSession,
): Promise<{ loggedIn: boolean; name?: string }> {
  return browser.run(
    async (page) => {
      await page.goto(FEED, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const deadline = Date.now() + config.loginTimeoutMs;
      while (Date.now() < deadline) {
        if (await visible(sel.globalSearch(page), 2500)) {
          const name = await currentUserName(page);
          return { loggedIn: true, ...(name ? { name } : {}) };
        }
        await humanDelay([1500, 2500]);
      }
      return { loggedIn: false };
    },
    { forceHeaded: true },
  );
}

export async function sessionStatus(
  browser: BrowserSession,
): Promise<{ loggedIn: boolean; name?: string; brokenSelectors: string[] }> {
  return browser.run(async (page) => {
    if (!(await isLoggedIn(page))) return { loggedIn: false, brokenSelectors: [] };
    const name = await currentUserName(page);
    const brokenSelectors = await assertCoreSelectors(page);
    return { loggedIn: true, ...(name ? { name } : {}), brokenSelectors };
  });
}

async function currentUserName(page: Page): Promise<string | undefined> {
  const label = await sel.meNav(page).first().getAttribute('aria-label').catch(() => null);
  if (!label) return undefined;
  const cleaned = label.replace(/^Me\b[:,\s-]*/i, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
