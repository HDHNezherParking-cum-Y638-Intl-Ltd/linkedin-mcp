/** Singleton Playwright session. One persistent Chrome profile (= the logged-in session),
 *  one page, all actions serialized behind a mutex so the scheduler and interactive tools
 *  never drive the same page at once. Headed by default (least detectable); login forces
 *  a headed window. */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { config, ensureDirs } from './config.js';
import { Mutex } from './util.js';

type Mode = 'headed' | 'headless';

export class BrowserSession {
  private context: BrowserContext | null = null;
  private mode: Mode | null = null;
  private readonly mutex = new Mutex();

  private async ensure(forceHeaded: boolean): Promise<BrowserContext> {
    const wantHeaded = forceHeaded || !config.headless;
    if (this.context) {
      if (wantHeaded && this.mode === 'headless') {
        await this.closeContext(); // relaunch headed for login
      } else {
        return this.context;
      }
    }
    ensureDirs();
    const headless = !wantHeaded;
    this.context = await chromium.launchPersistentContext(config.userDataDir, {
      channel: 'chrome',
      headless,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    this.mode = headless ? 'headless' : 'headed';
    return this.context;
  }

  private async page(forceHeaded: boolean): Promise<Page> {
    const ctx = await this.ensure(forceHeaded);
    const pages = ctx.pages();
    return pages.length > 0 && pages[0] ? pages[0] : await ctx.newPage();
  }

  /** Run browser work serialized behind the mutex. */
  run<T>(fn: (page: Page) => Promise<T>, opts: { forceHeaded?: boolean } = {}): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const page = await this.page(opts.forceHeaded ?? false);
      return fn(page);
    });
  }

  private async closeContext(): Promise<void> {
    const ctx = this.context;
    this.context = null;
    this.mode = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  async close(): Promise<void> {
    await this.closeContext();
  }
}
