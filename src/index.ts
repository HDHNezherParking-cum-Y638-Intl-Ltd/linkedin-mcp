#!/usr/bin/env node
/** Entry point: wire config → db → browser → scheduler worker → MCP server over stdio. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { BrowserSession } from './browser.js';
import { ScheduleDb } from './scheduler/db.js';
import { startWorker } from './scheduler/worker.js';
import { createPost, createPagePost } from './linkedin/posts.js';
import { ensureDirs } from './config.js';

async function main(): Promise<void> {
  ensureDirs();
  const browser = new BrowserSession();
  const db = new ScheduleDb();

  const recovered = db.recoverStuck();
  if (recovered > 0) {
    console.error(`[scheduler] recovered ${recovered} interrupted job(s) -> failed.`);
  }

  const worker = startWorker({
    db,
    poster: async (job) => {
      if (job.asPageId) return createPagePost(browser, { page: job.asPageId, text: job.text });
      return createPost(browser, { text: job.text });
    },
    onError: (e) => console.error('[scheduler]', e),
  });

  const shutdown = async (): Promise<void> => {
    worker.stop();
    await browser.close().catch(() => {});
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  const server = buildServer({ browser, db });
  const transport = new StdioServerTransport();
  transport.onclose = () => void shutdown(); // exit if the MCP client closes the stdio pipe
  await server.connect(transport);
  // stderr only — stdout is the MCP channel.
  console.error('linkedin-mcp-server ready on stdio.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
