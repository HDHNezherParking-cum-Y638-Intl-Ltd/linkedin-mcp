/** Parse + validate a scheduled time. Extracted so it's unit-testable without the browser. */
export function parseFutureIso(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid scheduledAt "${s}" — use ISO-8601, e.g. 2026-07-23T14:30:00Z.`);
  }
  if (d.getTime() <= Date.now()) {
    throw new Error(`scheduledAt is in the past: ${s}. Pick a future time.`);
  }
  return d;
}
