import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';

const app = await buildApp();

if (process.env.MIGRATE_ON_START === 'true') await migrate((m) => app.log.info(m));

const close = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

await app.listen({ port: config.port, host: '0.0.0.0' });
