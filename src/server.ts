import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { migrate } from './db/migrate';
import { openSqlite } from './db/sqlite';
import { OpencodeGoClient } from './llm/client';
import { ConsoleMailer } from './mail/console';
import { seedCards } from './seed/seed';
import { createApp } from './web/app';
import { buildDeps } from './web/deps';

async function main() {
  const cfg = loadConfig();
  if (cfg.dbPath !== ':memory:') mkdirSync(dirname(cfg.dbPath), { recursive: true });
  const db = openSqlite(cfg.dbPath);
  await migrate(db);
  const added = await seedCards(db);
  if (added) console.log(`Seeded ${added} cards`);

  const deps = buildDeps({
    db,
    mailer: new ConsoleMailer(), // swap for CloudflareEmailMailer when deployed
    llm: new OpencodeGoClient(cfg.llm),
    baseUrl: cfg.baseUrl,
  });
  serve({ fetch: createApp(deps).fetch, port: cfg.port }, (info) => console.log(`Listening on ${cfg.baseUrl} (port ${info.port})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
