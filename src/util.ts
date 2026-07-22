/** Small shared primitives: a mutex to serialize browser work, human-like pacing,
 *  typed errors, and MCP result helpers. No external deps. */

/** Serializes async work so the scheduler worker and interactive tools never drive
 *  the same Playwright page concurrently. Promise-chain lock. */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // keep the chain alive but swallow errors on the *chain* (caller still gets them)
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Randomized short delay between UI steps to look less robotic. */
export async function humanDelay([min, max]: [number, number]): Promise<void> {
  const ms = Math.floor(min + Math.random() * Math.max(0, max - min));
  await sleep(ms);
}

export class NotLoggedInError extends Error {
  constructor(msg = 'Not logged in to LinkedIn. Run the `linkedin_login` tool first.') {
    super(msg);
    this.name = 'NotLoggedInError';
  }
}

/** Thrown when a core selector can't be found — names the one file to fix. */
export class SelectorError extends Error {
  constructor(what: string) {
    super(
      `Could not find "${what}" on the page. LinkedIn's DOM likely changed — ` +
        `update the locator in src/linkedin/selectors.ts.`,
    );
    this.name = 'SelectorError';
  }
}

// ---- MCP tool result helpers ----

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

export function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return structured === undefined
    ? { content: [{ type: 'text', text }] }
    : { content: [{ type: 'text', text }], structuredContent: structured };
}

export function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
