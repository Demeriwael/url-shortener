import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { UrlService } from '../src/modules/urls/index.js';
import { MemoryUrlRepository } from './helpers/memory-url-repository.js';

function fixture() {
  const repository = new MemoryUrlRepository();
  const urls = new UrlService(repository, 'https://short.example', () => new Date('2026-11-18T12:00:00Z'));
  return { repository, app: buildApp({ urls, checkReadiness: async () => {} }) };
}

test('POST creates a link, both redirect routes send Location with no body', async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST', url: '/api/urls',
    payload: { url: 'https://example.com/long?q=1', customAlias: 'my-link', expiresAt: '2026-11-19T12:00:00Z' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.headers.location, 'https://short.example/my-link');
  assert.deepEqual(response.json(), {
    code: 'my-link', shortUrl: 'https://short.example/my-link',
    url: 'https://example.com/long?q=1', expiresAt: '2026-11-19T12:00:00.000Z',
  });
  for (const url of ['/api/urls/my-link', '/my-link']) {
    const redirect = await app.inject({ method: 'GET', url });
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.location, 'https://example.com/long?q=1');
    assert.equal(redirect.headers['cache-control'], 'no-store');
    assert.equal(redirect.body, '');
  }
});

test('POST accepts only the required URL and generates a code', async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const result = await app.inject({ method: 'POST', url: '/api/urls', payload: { url: 'https://example.com/' } });
  assert.equal(result.statusCode, 201);
  assert.match(result.json().code, /^[A-Za-z0-9_-]{8}$/);
  assert.equal(result.json().expiresAt, null);
});

test('POST rejects invalid input without coercing types or discarding unknown fields', async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const invalid = [
    {}, { url: 123 }, { url: 'javascript:alert(1)' },
    { url: 'https://example.com', customAlias: 'a' },
    { url: 'https://example.com', customAlias: '../bad' },
    { url: 'https://example.com', customAlias: 123 },
    { url: 'https://example.com', expiresAt: null },
    { url: 'https://example.com', expiresAt: '2026-11-19' },
    { url: 'https://example.com', expiresAt: '2026-11-19T12:00:00' },
    { url: 'https://example.com', expiresAt: '2026-02-30T12:00:00Z' },
    { url: 'https://example.com', expiresAt: '2026-11-17T12:00:00Z' },
    { url: 'https://example.com', typo: true },
  ];
  for (const payload of invalid) {
    const response = await app.inject({ method: 'POST', url: '/api/urls', payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.equal(typeof response.json().error.code, 'string');
  }
});

test('duplicate custom aliases return 409', async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const request = { method: 'POST' as const, url: '/api/urls', payload: { url: 'https://example.com/', customAlias: 'same' } };
  assert.equal((await app.inject(request)).statusCode, 201);
  const duplicate = await app.inject(request);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'ALIAS_TAKEN');
});

test('expired and unknown codes never redirect', async (t) => {
  const { app, repository } = fixture();
  t.after(() => app.close());
  await repository.insert({ code: 'expired', url: 'https://example.com/', expiresAt: new Date('2026-11-17T00:00:00Z') });
  for (const prefix of ['', '/api/urls']) {
    for (const [code, status] of [['expired', 410], ['missing', 404]] as const) {
      const response = await app.inject(`${prefix}/${code}`);
      assert.equal(response.statusCode, status);
      assert.equal(response.headers.location, undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  }
});

test('malformed JSON and unsupported media types return client errors', async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  const malformed = await app.inject({ method: 'POST', url: '/api/urls', headers: { 'content-type': 'application/json' }, payload: '{' });
  assert.equal(malformed.statusCode, 400);
  const unsupported = await app.inject({ method: 'POST', url: '/api/urls', headers: { 'content-type': 'application/xml' }, payload: '<url />' });
  assert.equal(unsupported.statusCode, 415);
});

test('unexpected errors are hidden, and readiness detects database failures', async (t) => {
  const repository = new MemoryUrlRepository();
  repository.findByCode = async () => { throw new Error('password=secret'); };
  const app = buildApp({
    urls: new UrlService(repository, 'https://short.example'),
    checkReadiness: async () => { throw new Error('database offline'); },
  });
  t.after(() => app.close());
  const failed = await app.inject('/some-code');
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.includes('secret'), false);
  assert.equal((await app.inject('/health/live')).statusCode, 200);
  assert.equal((await app.inject('/health/ready')).statusCode, 503);
});
