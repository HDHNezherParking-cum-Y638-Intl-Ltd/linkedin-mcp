import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleDb } from '../src/scheduler/db.js';
import { startWorker } from '../src/scheduler/worker.js';

const db = () => new ScheduleDb(':memory:');
const past = () => new Date(Date.now() - 1000).toISOString();
const future = () => new Date(Date.now() + 3_600_000).toISOString();

test('enqueue creates a pending job', () => {
  const d = db();
  const job = d.enqueue({ text: 'hi', scheduledAt: future() });
  assert.equal(job.status, 'pending');
  assert.equal(job.text, 'hi');
  d.close();
});

test('due returns only past-due pending jobs', () => {
  const d = db();
  d.enqueue({ text: 'late', scheduledAt: past() });
  d.enqueue({ text: 'later', scheduledAt: future() });
  const due = d.due();
  assert.equal(due.length, 1);
  assert.equal(due[0]?.text, 'late');
  d.close();
});

test('worker posts a due job via injected poster', async () => {
  const d = db();
  const job = d.enqueue({ text: 'go', scheduledAt: past() });
  let posted = '';
  const w = startWorker({
    db: d,
    poster: async (j) => {
      posted = j.text;
      return { postUrl: 'https://example/x' };
    },
    intervalMs: 10_000,
  });
  await w.tick();
  assert.equal(posted, 'go');
  const after = d.get(job.id);
  assert.equal(after?.status, 'posted');
  assert.equal(after?.post_url, 'https://example/x');
  w.stop();
  d.close();
});

test('poster throwing marks the job failed with the error message', async () => {
  const d = db();
  const job = d.enqueue({ text: 'boom', scheduledAt: past() });
  const w = startWorker({
    db: d,
    poster: async () => {
      throw new Error('nope');
    },
    intervalMs: 10_000,
  });
  await w.tick();
  const after = d.get(job.id);
  assert.equal(after?.status, 'failed');
  assert.match(after?.last_error ?? '', /nope/);
  w.stop();
  d.close();
});

test('cancel moves pending -> canceled and the worker skips it', async () => {
  const d = db();
  const job = d.enqueue({ text: 'x', scheduledAt: past() });
  assert.equal(d.cancel(job.id), true);
  assert.equal(d.get(job.id)?.status, 'canceled');
  let called = false;
  const w = startWorker({
    db: d,
    poster: async () => {
      called = true;
      return {};
    },
    intervalMs: 10_000,
  });
  await w.tick();
  assert.equal(called, false);
  w.stop();
  d.close();
});

test('cancel returns false for a non-pending job', () => {
  const d = db();
  const job = d.enqueue({ text: 'x', scheduledAt: past() });
  d.setStatus(job.id, 'posted');
  assert.equal(d.cancel(job.id), false);
  d.close();
});

test('overdue jobs left from an earlier run are picked up on the next tick', async () => {
  const d = db();
  // simulate a job scheduled while the process was off
  const job = d.enqueue({ text: 'overdue', scheduledAt: new Date(Date.now() - 86_400_000).toISOString() });
  let posted = false;
  const w = startWorker({ db: d, poster: async () => ((posted = true), {}), intervalMs: 10_000 });
  await w.tick();
  assert.equal(posted, true);
  assert.equal(d.get(job.id)?.status, 'posted');
  w.stop();
  d.close();
});

test('recoverStuck moves interrupted posting jobs to failed', () => {
  const d = db();
  const job = d.enqueue({ text: 'stuck', scheduledAt: past() });
  d.setStatus(job.id, 'posting');
  assert.equal(d.recoverStuck(), 1);
  const after = d.get(job.id);
  assert.equal(after?.status, 'failed');
  assert.match(after?.last_error ?? '', /Interrupted/);
  d.close();
});
