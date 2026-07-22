import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFutureIso } from '../src/scheduler/time.js';

test('accepts a future ISO time', () => {
  const s = new Date(Date.now() + 60_000).toISOString();
  assert.ok(parseFutureIso(s) instanceof Date);
});

test('rejects a past time', () => {
  const s = new Date(Date.now() - 60_000).toISOString();
  assert.throws(() => parseFutureIso(s), /past/);
});

test('rejects a non-date string', () => {
  assert.throws(() => parseFutureIso('not-a-date'), /Invalid/);
});
