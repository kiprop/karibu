import pg from 'pg';

/** Recreate the test database, then migrate and seed it once for the whole run. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/karibu_test');
  const dbName = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  process.env.DATABASE_URL = url.toString();
  const { migrate } = await import('../src/db/migrate.js');
  const { seed } = await import('../src/db/seed.js');
  const { pool } = await import('../src/db/pool.js');
  await migrate(() => {});
  await seed();
  await pool.end();
}
