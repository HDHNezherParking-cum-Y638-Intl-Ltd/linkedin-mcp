/** Local scheduled-post queue backed by SQLite.
 *
 *  ponytail: uses Node's built-in `node:sqlite` (experimental in Node 22) — zero native
 *  dependency, sufficient for a single-process local queue. Upgrade path: swap `DatabaseSync`
 *  for `better-sqlite3` (same synchronous shape) if the experimental API destabilizes. */
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

export type JobStatus = 'pending' | 'posting' | 'posted' | 'failed' | 'canceled';

export interface Job {
  id: number;
  text: string;
  as_page_id: string | null;
  scheduled_at: string;
  status: JobStatus;
  created_at: string;
  posted_at: string | null;
  last_error: string | null;
  post_url: string | null;
}

export class ScheduleDb {
  private db: DatabaseSync;

  constructor(path: string = config.dbPath) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        text         TEXT    NOT NULL,
        as_page_id   TEXT,
        scheduled_at TEXT    NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'pending',
        created_at   TEXT    NOT NULL,
        posted_at    TEXT,
        last_error   TEXT,
        post_url     TEXT
      );
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_posts(status, scheduled_at);');
  }

  enqueue(input: { text: string; scheduledAt: string; asPageId?: string | null }): Job {
    const info = this.db
      .prepare(
        `INSERT INTO scheduled_posts (text, as_page_id, scheduled_at, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(input.text, input.asPageId ?? null, input.scheduledAt, new Date().toISOString());
    const job = this.get(Number(info.lastInsertRowid));
    if (!job) throw new Error('Failed to read back the enqueued job.');
    return job;
  }

  get(id: number): Job | undefined {
    return this.db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id) as Job | undefined;
  }

  list(status?: JobStatus): Job[] {
    const rows = status
      ? this.db.prepare('SELECT * FROM scheduled_posts WHERE status = ? ORDER BY scheduled_at').all(status)
      : this.db.prepare('SELECT * FROM scheduled_posts ORDER BY scheduled_at').all();
    return rows as unknown as Job[];
  }

  /** Pending jobs whose scheduled time has arrived. */
  due(nowIso: string = new Date().toISOString()): Job[] {
    return this.db
      .prepare(
        "SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at",
      )
      .all(nowIso) as unknown as Job[];
  }

  setStatus(
    id: number,
    status: JobStatus,
    fields: { lastError?: string | null; postUrl?: string | null; postedAt?: string | null } = {},
  ): void {
    this.db
      .prepare(
        'UPDATE scheduled_posts SET status = ?, last_error = ?, post_url = ?, posted_at = ? WHERE id = ?',
      )
      .run(status, fields.lastError ?? null, fields.postUrl ?? null, fields.postedAt ?? null, id);
  }

  /** pending -> canceled. Returns true iff a pending row was changed. */
  cancel(id: number): boolean {
    const info = this.db
      .prepare("UPDATE scheduled_posts SET status = 'canceled' WHERE id = ? AND status = 'pending'")
      .run(id);
    return Number(info.changes) > 0;
  }

  /** Recover jobs left mid-flight by a crash: posting -> failed. Safer than auto-retry (which
   *  could double-post). Call once at startup. Returns the number recovered. */
  recoverStuck(): number {
    const info = this.db
      .prepare("UPDATE scheduled_posts SET status = 'failed', last_error = ? WHERE status = 'posting'")
      .run(
        'Interrupted mid-post by a restart; not retried automatically. Re-schedule if it did not publish.',
      );
    return Number(info.changes);
  }

  close(): void {
    this.db.close();
  }
}
