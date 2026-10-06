/**
 * Minimal async DB interface. Async so the same code runs on better-sqlite3 (local)
 * and Cloudflare D1 (deployed). Positional `?` params only (both drivers support them).
 */
export interface Db {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Returns rows changed and last inserted rowid. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastId: number }>;
  /** Run multiple statements (migrations). */
  exec(sql: string): Promise<void>;
}
