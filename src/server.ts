/** Build the MCP server object (no transport, no side effects) so it can be booted for
 *  real over stdio, or in-memory for the smoke/boot check. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import type { BrowserSession } from './browser.js';
import type { ScheduleDb } from './scheduler/db.js';

export interface Deps {
  browser: BrowserSession;
  db: ScheduleDb;
}

export function buildServer(deps: Deps): McpServer {
  const server = new McpServer(
    { name: 'linkedin-mcp-server', version: '0.1.0' },
    {
      instructions:
        'Manage a personal LinkedIn account and the Pages it admins via a local browser ' +
        'session. Call linkedin_session_status first; if not logged in, call linkedin_login. ' +
        'Automation of LinkedIn web violates its User Agreement — use sparingly, low volume.',
    },
  );
  registerTools(server, deps);
  return server;
}
