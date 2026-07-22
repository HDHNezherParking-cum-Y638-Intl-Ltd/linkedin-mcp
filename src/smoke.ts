/** Boot check: build the server, connect an in-memory client, list tools — proves the
 *  wiring works WITHOUT contacting LinkedIn (the browser is never launched). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from './server.js';
import { BrowserSession } from './browser.js';
import { ScheduleDb } from './scheduler/db.js';

const EXPECTED = 12;

async function main(): Promise<void> {
  const db = new ScheduleDb(':memory:');
  const server = buildServer({ browser: new BrowserSession(), db });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'smoke', version: '0.0.0' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  console.log(`Registered tools (${tools.length}):`);
  for (const t of tools) console.log(' -', t.name);

  await client.close();
  await server.close();
  db.close();

  if (tools.length < EXPECTED) {
    console.error(`FAIL: expected >= ${EXPECTED} tools, got ${tools.length}`);
    process.exit(1);
  }
  console.log('smoke OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
