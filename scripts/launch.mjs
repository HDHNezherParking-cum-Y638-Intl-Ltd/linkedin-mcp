#!/usr/bin/env node
/** Plugin bootstrap. A marketplace install is a plain git clone: no node_modules, no dist/.
 *  Install and compile on first run (and after any source change), then start the MCP server
 *  in this same process so stdio stays wired straight to the client.
 *
 *  stdout IS the MCP channel — every diagnostic and every child process writes to stderr only.
 *
 *  Usage: launch.mjs [--build-only]   (--build-only bootstraps and exits; used by /linkedin:setup)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Newest mtime of any file under `dir`, or 0 if the directory is absent. */
function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const name of readdirSync(dir, { recursive: true })) {
    const s = statSync(join(dir, name));
    if (s.isFile() && s.mtimeMs > newest) newest = s.mtimeMs;
  }
  return newest;
}

/** True when deps or build output are missing or stale relative to src/. */
export function needsBuild(dir) {
  if (!existsSync(join(dir, 'node_modules'))) return true;
  const built = newestMtime(join(dir, 'dist'));
  return built === 0 || newestMtime(join(dir, 'src')) > built;
}

function npm(args) {
  process.stderr.write(`[linkedin-mcp] npm ${args.join(' ')}\n`);
  const win = process.platform === 'win32';
  const r = spawnSync(win ? 'npm.cmd' : 'npm', args, {
    cwd: root,
    // fd 2 for both: npm chatter must never reach our stdout.
    stdio: ['ignore', 2, 2],
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    // Node refuses to spawn .cmd/.bat without a shell (CVE-2024-27980). Args are literals.
    shell: win,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`npm ${args.join(' ')} failed with exit code ${r.status}`);
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    process.stderr.write(
      `[linkedin-mcp] Node >= 22.5 required (built-in node:sqlite); found ${process.versions.node}.\n`,
    );
    process.exit(1);
  }

  if (needsBuild(root)) {
    process.stderr.write('[linkedin-mcp] dependencies or build output missing/stale — building…\n');
    npm(['install', '--no-audit', '--no-fund']);
    npm(['run', 'build']);
    process.stderr.write('[linkedin-mcp] build complete.\n');
  }

  if (process.argv.includes('--build-only')) {
    process.stderr.write('[linkedin-mcp] ready.\n');
    return;
  }
  await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    process.stderr.write(`[linkedin-mcp] bootstrap failed: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}
