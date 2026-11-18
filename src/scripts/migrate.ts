import { loadConfig } from '../config.js';
import { createPool } from '../platform/database/pool.js';
import { runMigrations } from '../platform/database/migrate.js';

const pool = createPool(loadConfig().databaseUrl);
pool.on('error', (error) => console.error('Idle database connection error', error));
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
