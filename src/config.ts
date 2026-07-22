/** Runtime configuration from environment variables, all optional with safe defaults.
 *  Loads a local .env if present (Node's built-in loader — no dotenv dependency). */
import { mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

try {
  // Node >= 20.12 / 22. No-op if .env is absent.
  process.loadEnvFile();
} catch {
  /* no .env file — fine, env vars can still be set directly */
}

function num(v: string | undefined, d: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}

function bool(v: string | undefined, d: boolean): boolean {
  if (v === undefined) return d;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function pacing(v: string | undefined): [number, number] {
  const parts = (v ?? '400,1200').split(',');
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return [Number.isFinite(a) ? a : 400, Number.isFinite(b) ? b : 1200];
}

const sessionDir = resolve(process.env.LINKEDIN_SESSION_DIR ?? './session');
const dbPath = resolve(process.env.LINKEDIN_DB_PATH ?? './data/schedule.sqlite');

export const config = {
  sessionDir,
  /** Persistent Chrome profile = the single source of truth for the logged-in session. */
  userDataDir: join(sessionDir, 'chrome-profile'),
  dbPath,
  headless: bool(process.env.LINKEDIN_HEADLESS, false),
  loginTimeoutMs: num(process.env.LINKEDIN_LOGIN_TIMEOUT_SEC, 300) * 1000,
  pollMs: Math.max(1000, num(process.env.LINKEDIN_POLL_MS, 30_000)),
  pacing: pacing(process.env.LINKEDIN_PACING_MS),
  baseUrl: 'https://www.linkedin.com',
} as const;

/** Create session + data directories before use (both are gitignored). */
export function ensureDirs(): void {
  mkdirSync(config.userDataDir, { recursive: true });
  mkdirSync(dirname(config.dbPath), { recursive: true });
}
