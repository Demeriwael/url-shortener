import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('validates database configuration and normalizes the public origin', () => {
  const config = loadConfig({ DATABASE_URL: 'postgresql://localhost/shortener', PORT: '4000', BASE_URL: 'https://short.example/' });
  assert.equal(config.baseUrl, 'https://short.example');
  assert.equal(config.port, 4000);
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'https://example.com' }), /PostgreSQL/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgresql://localhost/shortener', PORT: '0' }), /PORT/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgresql://localhost/shortener', BASE_URL: 'https://example.com/path' }), /BASE_URL/);
});
