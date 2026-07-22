/** Background worker: polls the queue and fires ONE due job per tick (human-paced; overdue
 *  jobs drain one-per-interval rather than bursting, which reduces automation-detection risk).
 *  The `poster` is injected so the scheduler is unit-testable with no browser. */
import type { ScheduleDb, Job } from './db.js';
import { config } from '../config.js';

export type Poster = (job: {
  text: string;
  asPageId: string | null;
}) => Promise<{ postUrl?: string }>;

export interface Worker {
  stop(): void;
  /** Run one poll cycle now (used by tests). */
  tick(): Promise<void>;
}

export function startWorker(opts: {
  db: ScheduleDb;
  poster: Poster;
  intervalMs?: number;
  onError?: (e: unknown) => void;
}): Worker {
  const intervalMs = opts.intervalMs ?? config.pollMs;
  let running = false;

  async function runJob(job: Job): Promise<void> {
    opts.db.setStatus(job.id, 'posting');
    try {
      const res = await opts.poster({ text: job.text, asPageId: job.as_page_id });
      opts.db.setStatus(job.id, 'posted', {
        postedAt: new Date().toISOString(),
        postUrl: res.postUrl ?? null,
      });
    } catch (e) {
      opts.db.setStatus(job.id, 'failed', {
        lastError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function tick(): Promise<void> {
    if (running) return; // never overlap ticks
    running = true;
    try {
      const job = opts.db.due()[0];
      if (job) await runJob(job);
    } catch (e) {
      opts.onError?.(e);
    } finally {
      running = false;
    }
  }

  const handle = setInterval(() => void tick(), intervalMs);
  handle.unref?.(); // don't keep the process alive just for polling

  return {
    stop: () => clearInterval(handle),
    tick,
  };
}
