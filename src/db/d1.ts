import type { Db } from './types';

// Structural subset of Cloudflare's D1Database, so we don't need @cloudflare/workers-types yet.
interface D1Like {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
      run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
    };
  };
  exec(sql: string): Promise<unknown>;
}

/** Adapter for deployment on Cloudflare D1. Not exercised locally yet. */
export function fromD1(d1: D1Like): Db {
  return {
    async all(sql, params = []) {
      return (await d1.prepare(sql).bind(...params).all()).results;
    },
    async get(sql, params = []) {
      return (await d1.prepare(sql).bind(...params).first()) ?? undefined;
    },
    async run(sql, params = []) {
      const { meta } = await d1.prepare(sql).bind(...params).run();
      return { changes: meta.changes, lastId: meta.last_row_id };
    },
    async exec(sql) {
      await d1.exec(sql);
    },
  };
}
