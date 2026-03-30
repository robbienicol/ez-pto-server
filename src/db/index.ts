import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import * as schema from './schema';

/**
 * Bun defaults to server-side prepared statements. After DDL (e.g. changing
 * column types) or with poolers, stale plans can throw:
 * `cached plan must not change result type` (SQLSTATE 0A000).
 * Opt back in with DATABASE_PREPARE_STATEMENTS=1 if you need the marginal perf win.
 */
const usePrepare =
  process.env.DATABASE_PREPARE_STATEMENTS === '1' ||
  process.env.DATABASE_PREPARE_STATEMENTS === 'true';

const sql = new SQL(process.env.DATABASE_URL!, { prepare: usePrepare });

export const db = drizzle(sql, { schema });
