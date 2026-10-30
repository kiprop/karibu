import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as 'YYYY-MM-DD' strings rather than JS Dates shifted to local time.
pg.types.setTypeParser(1082, (v) => v);
// int8 (count(*)) as number; safe for our ranges.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric as number (ratings, prices)
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Number(process.env.PG_POOL_MAX ?? 10) });

export type Db = pg.Pool | pg.PoolClient;

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool) {
  return db.query<T>(text, params);
}

/** Run fn in a transaction. Optionally set the acting user and reason for the audit trigger. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, audit?: { actor?: string | null; reason?: string | null }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (audit?.actor) await c.query(`SELECT set_config('app.actor', $1, true)`, [audit.actor]);
    if (audit?.reason) await c.query(`SELECT set_config('app.reason', $1, true)`, [audit.reason]);
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
