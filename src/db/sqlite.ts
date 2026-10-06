import Database from 'better-sqlite3';
import type { Db } from './types';

export function openSqlite(path: string): Db {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  return {
    async all(sql, params = []) {
      return raw.prepare(sql).all(...params) as any[];
    },
    async get(sql, params = []) {
      return raw.prepare(sql).get(...params) as any;
    },
    async run(sql, params = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
    },
    async exec(sql) {
      raw.exec(sql);
    },
  };
}
