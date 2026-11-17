import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketHandler } from '../vercel-routes.mjs';
import { MarketDataError } from '../market-client.mjs';

function call(handler, { method = 'GET', url, query, body, headers = {} }) {
  const req = { method, url, query, body, headers };
  const res = {
    req, statusCode: 200, headers: {}, body: undefined, ended: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
  return handler(req, res).then(() => res);
}

function setup({ user = true } = {}) {
  const calls = [];
  const client = {
    getStatus: () => { calls.push('status'); return { configured: true, connected: false, error: null, code: null }; },
    getContracts: async () => { calls.push('contracts'); return [{ id: 201 }]; },
    getQuotes: async (ids) => { calls.push(['quotes', ids]); return { quotes: [], fetchedAt: 'now' }; },
  };
  let clients = 0;
  const handler = createMarketHandler({
    getClient: () => { clients++; return client; },
    authenticate: async () => { calls.push('auth'); return user ? { user: { id: 'u1' } } : { error: { status: 401, body: { error: 'Sign in to use live market data.', code: 'UNAUTHORIZED' } } }; },
  });
  return { handler, calls, clientCount: () => clients };
}

test('one handler serves status, contracts and quotes from the request path', async () => {
  const { handler, calls } = setup();
  const status = await call(handler, { url: '/api/market/status' });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.configured, true);
  assert.equal(status.headers['cache-control'], 'no-store');
  const contracts = await call(handler, { url: '/api/market/contracts' });
  assert.deepEqual(contracts.body, { contracts: [{ id: 201 }] });
  const quotes = await call(handler, { method: 'POST', url: '/api/market/quotes', body: { instrumentIds: [201, 202] } });
  assert.deepEqual(quotes.body, { quotes: [], fetchedAt: 'now' });
  assert.deepEqual(calls, ['status', 'auth', 'contracts', 'auth', ['quotes', [201, 202]]]);
});

test('falls back to the dynamic segment parameter and ignores it when the path names a route', async () => {
  const { handler, calls } = setup();
  assert.equal((await call(handler, { url: '/api/market/%5Broute%5D', query: { route: 'status' } })).statusCode, 200);
  // The path decides: a query parameter cannot turn the public status route into another one.
  assert.equal((await call(handler, { url: '/api/market/status?route=contracts', query: { route: 'contracts' } })).body.configured, true);
  assert.deepEqual(calls, ['status', 'status']);
});

test('status needs no sign-in; contracts and quotes are rejected before reaching the broker client', async () => {
  const { handler, calls, clientCount } = setup({ user: false });
  assert.equal((await call(handler, { url: '/api/market/contracts' })).statusCode, 401);
  const quotes = await call(handler, { method: 'POST', url: '/api/market/quotes', body: { instrumentIds: [201] } });
  assert.equal(quotes.statusCode, 401);
  assert.equal(quotes.body.code, 'UNAUTHORIZED');
  assert.deepEqual(calls, ['auth', 'auth']);
  assert.equal(clientCount(), 0);
  assert.equal((await call(handler, { url: '/api/market/status' })).statusCode, 200);
});

test('wrong methods, preflight and unknown routes', async () => {
  const { handler, calls } = setup();
  assert.equal((await call(handler, { method: 'GET', url: '/api/market/quotes' })).body.code, 'METHOD_NOT_ALLOWED');
  assert.equal((await call(handler, { method: 'POST', url: '/api/market/status' })).statusCode, 405);
  assert.equal((await call(handler, { method: 'POST', url: '/api/market/contracts' })).statusCode, 405);
  const preflight = await call(handler, { method: 'OPTIONS', url: '/api/market/quotes' });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.ended, true);
  const unknown = await call(handler, { url: '/api/market/orders', query: { route: 'orders' } });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.code, 'NOT_FOUND');
  assert.equal((await call(handler, { url: '/api/market/__proto__', query: { route: 'constructor' } })).statusCode, 404);
  assert.deepEqual(calls, []);
});

test('broker failures are returned as sanitized market errors', async () => {
  const handler = createMarketHandler({
    getClient: () => ({ getQuotes: async () => { throw new MarketDataError('UPSTREAM_RATE_LIMIT', 503); } }),
    authenticate: async () => ({ user: { id: 'u1' } }),
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const res = await call(handler, { method: 'POST', url: '/api/market/quotes', body: { instrumentIds: [201] } });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'error']);
    assert.equal(res.body.code, 'UPSTREAM_RATE_LIMIT');
  } finally { console.warn = warn; }
});
