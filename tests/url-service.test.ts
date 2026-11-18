import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UrlService } from '../src/modules/urls/index.js';
import { AppError } from '../src/shared/app-error.js';
import { MemoryUrlRepository } from './helpers/memory-url-repository.js';

const now = new Date('2026-11-18T12:00:00Z');
const clock = () => now;

test('creates a generated link with no expiration by default', async () => {
  const repository = new MemoryUrlRepository();
  const service = new UrlService(repository, 'https://short.example', clock);
  const result = await service.create({ url: 'https://example.com/long?q=test#section' });
  assert.match(result.code, /^[A-Za-z0-9_-]{8}$/);
  assert.equal(result.shortUrl, `https://short.example/${result.code}`);
  assert.equal(result.expiresAt, null);
  assert.equal(await service.resolve(result.code), 'https://example.com/long?q=test#section');
});

test('honors custom aliases and normalizes expiration timezone to UTC', async () => {
  const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', clock);
  const result = await service.create({
    url: 'https://example.com', customAlias: 'my-link', expiresAt: '2026-11-19T15:00:00+03:00',
  });
  assert.equal(result.code, 'my-link');
  assert.equal(result.expiresAt, '2026-11-19T12:00:00.000Z');
  assert.equal(await service.resolve('my-link'), 'https://example.com/');
});

test('rejects duplicate custom aliases without changing the original link', async () => {
  const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', clock);
  await service.create({ url: 'https://example.com/first', customAlias: 'taken' });
  await assert.rejects(service.create({ url: 'https://example.com/second', customAlias: 'taken' }),
    { statusCode: 409, code: 'ALIAS_TAKEN' });
  assert.equal(await service.resolve('taken'), 'https://example.com/first');
});

test('retries generated code collisions and stops after a bounded number of attempts', async () => {
  const repository = new MemoryUrlRepository();
  await repository.insert({ code: 'collision', url: 'https://example.com/', expiresAt: null });
  let attempts = 0;
  const service = new UrlService(repository, 'https://short.example', clock,
    () => ++attempts === 1 ? 'collision' : 'available');
  assert.equal((await service.create({ url: 'https://example.com/' })).code, 'available');
  const stuck = new UrlService(repository, 'https://short.example', clock, () => 'collision');
  await assert.rejects(stuck.create({ url: 'https://example.com/' }), { statusCode: 503 });
});

test('expires links exactly at expiresAt, while retaining the alias reservation', async () => {
  let time = new Date('2026-11-18T12:00:00Z');
  const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', () => time);
  await service.create({ url: 'https://example.com/', customAlias: 'expires', expiresAt: '2026-11-18T12:00:01Z' });
  assert.equal(await service.resolve('expires'), 'https://example.com/');
  time = new Date('2026-11-18T12:00:01Z');
  await assert.rejects(service.resolve('expires'), { statusCode: 410, code: 'URL_EXPIRED' });
  await assert.rejects(service.create({ url: 'https://example.com/', customAlias: 'expires' }), { statusCode: 409 });
});

test('unknown codes return not found', async () => {
  const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', clock);
  await assert.rejects(service.resolve('missing'), { statusCode: 404, code: 'URL_NOT_FOUND' });
});

for (const url of ['not-a-url', '/relative', 'javascript:alert(1)', 'ftp://example.com/', 'https://user:pass@example.com/', 'https://example.com/\r\nLocation:bad', 'https:example.com']) {
  test(`rejects invalid destination ${JSON.stringify(url)}`, async () => {
    const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', clock);
    await assert.rejects(service.create({ url }), { statusCode: 400, code: 'INVALID_URL' });
  });
}

test('rejects past, equal-to-now, and invalid expirations', async () => {
  const service = new UrlService(new MemoryUrlRepository(), 'https://short.example', clock);
  for (const expiresAt of ['2026-11-17T12:00:00Z', now.toISOString(), 'invalid']) {
    await assert.rejects(service.create({ url: 'https://example.com', expiresAt }),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_EXPIRATION');
  }
});
