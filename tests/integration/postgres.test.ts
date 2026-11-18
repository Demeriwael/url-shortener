import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createUrlService } from '../../src/modules/urls/index.js';
import { createPool } from '../../src/platform/database/pool.js';
import { runMigrations } from '../../src/platform/database/migrate.js';

// Explicitly opt into a dedicated test database; never fall back to DATABASE_URL.
const connectionString = process.env.TEST_DATABASE_URL;
test('PostgreSQL migrations, concurrent aliases, persistence, and expiration', {
  skip: !connectionString && 'Set TEST_DATABASE_URL to run real PostgreSQL tests',
}, async (t) => {
  const pool = createPool(connectionString!);
  const code = `test-${randomBytes(8).toString('hex')}`;
  let app: ReturnType<typeof buildApp> | undefined;
  let migrated = false;
  t.after(async () => {
    try {
      await app?.close();
      if (migrated) await pool.query('DELETE FROM urls.short_urls WHERE code = $1', [code]);
    } finally {
      await pool.end();
    }
  });
  await runMigrations(pool);
  migrated = true;
  assert.deepEqual(await runMigrations(pool), []);
  const service = createUrlService(pool, 'https://short.example');
  app = buildApp({ urls: service, checkReadiness: async () => { await pool.query('SELECT code FROM urls.short_urls LIMIT 0'); } });
  const server = app;
  const destination = "https://example.com/';DROP%20TABLE%20urls.short_urls;--";

  const results = await Promise.all(Array.from({ length: 12 }, () => server.inject({
    method: 'POST', url: '/api/urls', payload: {
      url: destination,
      customAlias: code, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  })));
  assert.equal(results.filter((response) => response.statusCode === 201).length, 1);
  assert.equal(results.filter((response) => response.statusCode === 409).length, 11);
  const recreated = createUrlService(pool, 'https://short.example');
  assert.equal(await recreated.resolve(code), destination);
  const redirect = await app.inject(`/${code}`);
  assert.equal(redirect.statusCode, 302);
  assert.equal(redirect.headers.location, destination);
  assert.equal(redirect.body, '');
  await pool.query('UPDATE urls.short_urls SET expires_at = now() - interval \'1 second\' WHERE code = $1', [code]);
  const expired = await app.inject(`/api/urls/${code}`);
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.headers.location, undefined);
  assert.equal((await app.inject('/health/ready')).statusCode, 200);
});
