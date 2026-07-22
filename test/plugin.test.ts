/** Guards the plugin packaging: manifests parse, the paths they point at exist, and the MCP
 *  tool names pre-allowed in commands still match the tools the server actually registers.
 *  A rename on either side rots silently at runtime — this is where it should fail instead. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs bootstrap script, no type declarations.
import { needsBuild } from '../scripts/launch.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const json = (p: string): any => JSON.parse(readFileSync(join(root, p), 'utf8'));

const plugin = json('.claude-plugin/plugin.json');
const marketplace = json('.claude-plugin/marketplace.json');
const mcp = json('.mcp.json');

test('plugin manifest has the fields a marketplace listing needs', () => {
  for (const field of ['name', 'version', 'description', 'author']) {
    assert.ok(plugin[field], `plugin.json is missing "${field}"`);
  }
  assert.match(plugin.name, /^[a-z0-9-]+$/, 'plugin name must be kebab-case');
});

test('marketplace lists this plugin and points at a real source', () => {
  const entry = marketplace.plugins.find((p: any) => p.name === plugin.name);
  assert.ok(entry, `marketplace.json has no entry named "${plugin.name}"`);
  assert.ok(existsSync(join(root, entry.source)), `source "${entry.source}" does not exist`);
});

test('the MCP server command points at a file that exists', () => {
  const servers = Object.keys(mcp.mcpServers);
  assert.equal(servers.length, 1, 'expected exactly one bundled server');
  const args: string[] = mcp.mcpServers[servers[0]!].args;
  for (const arg of args) {
    if (!arg.includes('${CLAUDE_PLUGIN_ROOT}')) continue;
    const path = join(root, arg.replace('${CLAUDE_PLUGIN_ROOT}', '.'));
    assert.ok(existsSync(path), `.mcp.json references a missing file: ${arg}`);
  }
});

test('commands pre-allow only tools the server registers', () => {
  const serverName = Object.keys(mcp.mcpServers)[0];
  const prefix = `mcp__plugin_${plugin.name}_${serverName}__`;

  const registered = new Set(
    [...readFileSync(join(root, 'src/tools.ts'), 'utf8').matchAll(/registerTool\(\s*'([^']+)'/g)].map(
      (m) => m[1]!,
    ),
  );
  assert.ok(registered.size > 0, 'found no registerTool calls to check against');

  const commands = readdirSync(join(root, 'commands')).filter((f) => f.endsWith('.md'));
  assert.ok(commands.length > 0, 'no commands found');

  for (const file of commands) {
    const body = readFileSync(join(root, 'commands', file), 'utf8');
    for (const [, name] of body.matchAll(/mcp__plugin_[a-z0-9_]+__([a-z0-9_]+)/g)) {
      assert.ok(
        body.includes(prefix + name),
        `${file}: tool "${name}" uses a stale prefix (expected ${prefix})`,
      );
      assert.ok(registered.has(name!), `${file}: pre-allows unknown tool "${name}"`);
    }
  }
});

test('needsBuild: missing deps, stale build, current build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linkedin-plugin-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/index.ts'), '');
  assert.equal(needsBuild(dir), true, 'no node_modules -> build');

  mkdirSync(join(dir, 'node_modules'));
  assert.equal(needsBuild(dir), true, 'no dist -> build');

  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/index.js'), '');
  const past = new Date(Date.now() - 60_000);
  utimesSync(join(dir, 'dist/index.js'), past, past);
  assert.equal(needsBuild(dir), true, 'src newer than dist -> build');

  const future = new Date(Date.now() + 60_000);
  utimesSync(join(dir, 'dist/index.js'), future, future);
  assert.equal(needsBuild(dir), false, 'dist newer than src -> no build');
});
