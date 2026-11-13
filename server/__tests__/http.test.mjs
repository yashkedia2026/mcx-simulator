import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequestHandler } from '../http.mjs';

async function invoke(handler, { method = 'GET', url = '/api/market/status', headers = {}, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [body]);
  Object.assign(req, { method, url, headers: { host: '127.0.0.1:3001', ...headers } });
  const result = {};
  const res = { writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; }, end(value) { result.body = value === undefined ? '' : String(value); } };
  await handler(req, res);
  return result;
}

const client = {
  getStatus: () => ({ configured: false, connected: false, error: null }),
  getContracts: async () => [],
  getQuotes: async (ids) => ({ quotes: ids, fetchedAt: 'test-time' }),
};

test('serves same-origin API envelopes without CORS or upstream details', async () => {
  const handler = createRequestHandler({ client });
  const result = await invoke(handler, { headers: { origin: 'http://localhost:5173' } });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  const contracts = await invoke(handler, { url: '/api/market/contracts' });
  assert.deepEqual(JSON.parse(contracts.body), { contracts: [] });
  const quotes = await invoke(handler, { method: 'POST', url: '/api/market/quotes', headers: { 'content-type': 'application/json' }, body: '{"instrumentIds":[201]}' });
  assert.deepEqual(JSON.parse(quotes.body), { quotes: [201], fetchedAt: 'test-time' });
});

test('rejects external Origin, cross-site requests and DNS-rebinding Host', async () => {
  const handler = createRequestHandler({ client });
  for (const headers of [{ origin: 'https://example.com' }, { origin: 'null' }, { host: 'attacker.example:3001' }, { 'sec-fetch-site': 'cross-site' }]) {
    const result = await invoke(handler, { headers });
    assert.equal(result.status, 403);
    assert.equal(JSON.parse(result.body).code, 'LOCAL_ONLY');
  }
});

test('validates JSON bodies and method/route boundaries', async () => {
  const handler = createRequestHandler({ client });
  const options = { method: 'POST', url: '/api/market/quotes', headers: { 'content-type': 'application/json' } };
  assert.equal((await invoke(handler, { ...options, body: 'not JSON' })).status, 400);
  assert.equal((await invoke(handler, { ...options, body: 'x'.repeat(17000) })).status, 413);
  assert.equal((await invoke(handler, { ...options, headers: {}, body: '{}' })).status, 415);
  assert.equal((await invoke(handler, { url: '/api/market/quotes' })).status, 405);
  assert.equal((await invoke(handler, { url: '/api/trading/orders' })).status, 404);
});

test('unknown internal exceptions are redacted', async () => {
  const handler = createRequestHandler({ client: { ...client, getContracts: async () => { throw new Error('key=private-secret'); } } });
  const result = await invoke(handler, { url: '/api/market/contracts' });
  assert.equal(result.status, 500);
  assert.equal(result.body.includes('private-secret'), false);
});

test('serves local built app but never follows a symlink outside dist', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mcx-http-test-'));
  const dist = path.join(root, 'dist');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dist);
  try {
    await writeFile(path.join(dist, 'index.html'), '<main>Local app</main>');
    await writeFile(path.join(root, 'private.txt'), 'sensitive local contents');
    await symlink(path.join(root, 'private.txt'), path.join(dist, 'leak.txt'));
    const handler = createRequestHandler({ client, distDirectory: dist });
    assert.equal((await invoke(handler, { url: '/' })).body, '<main>Local app</main>');
    assert.equal((await invoke(handler, { url: '/strategy/saved' })).status, 200);
    assert.equal((await invoke(handler, { url: '/leak.txt' })).status, 404);
    assert.equal((await invoke(handler, { url: '/%2e%2e/private.txt' })).status, 404);
  } finally { await rm(root, { recursive: true, force: true }); }
});
