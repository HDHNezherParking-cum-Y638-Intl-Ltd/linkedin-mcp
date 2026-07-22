/** Runtime configuration from environment variables, all optional with safe defaults.
 *  Loads a local .env if present (Node's built-in loader — no dotenv dependency). */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';

/** One home per user, not per working directory: as a plugin the server is launched with the
 *  client's cwd, so cwd-relative defaults would scatter a separate login per project.
 *  Read before any .env is loaded — this is the path a .env would be found under. */
const home = resolve(process.env.LINKEDIN_MCP_HOME ?? join(homedir(), '.linkedin-mcp'));

/** `~/.linkedin-mcp/.env` is the config file a plugin user can reach; `./.env` is the repo-dev
 *  one and wins when both exist. Node's built-in loader — no dotenv dependency. */
for (const file of [join(home, '.env'), resolve('.env')]) {
  try {
    process.loadEnvFile(file); // throws if absent — that's the normal case
  } catch {
    /* no .env there — fine, env vars can still be set directly */
  }
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

const sessionDir = resolve(process.env.LINKEDIN_SESSION_DIR ?? join(home, 'session'));
const dbPath = resolve(process.env.LINKEDIN_DB_PATH ?? join(home, 'schedule.sqlite'));

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
