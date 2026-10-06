import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './types';

/** Applies migrations/*.sql in filename order, once each. (On D1, use `wrangler d1 migrations` instead.) */
export async function migrate(db: Db, dir = join(__dirname, '..', '..', 'migrations')): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const done = new Set((await db.all<{ name: string }>('SELECT name FROM _migrations')).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await db.exec(readFileSync(join(dir, file), 'utf8'));
    await db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
  }
}
