import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createUrlService } from './modules/urls/index.js';
import { createPool } from './platform/database/pool.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = buildApp({
  urls: createUrlService(pool, config.baseUrl),
  checkReadiness: async () => { await pool.query('SELECT code FROM urls.short_urls LIMIT 0'); },
  logger: true,
});
pool.on('error', (error) => app.log.error({ err: error }, 'Idle database connection error'));
app.addHook('onClose', async () => { await pool.end(); });

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    void app.close().catch((error: unknown) => {
      app.log.error({ err: error }, 'Shutdown failed');
      process.exitCode = 1;
    }).finally(() => clearTimeout(timeout));
  });
}

try {
  await pool.query('SELECT code FROM urls.short_urls LIMIT 0');
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'Startup failed; ensure PostgreSQL is running and migrations are applied');
  await app.close();
  process.exitCode = 1;
}
