import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketClient, publicError } from '../market-client.mjs';
import { masterFixture, quoteFixture, success } from './fixtures.mjs';

function mockClient(overrides = {}) {
  const calls = [];
  let clock = Date.parse('2026-11-05T06:00:00Z');
  const client = createMarketClient({
    appKey: 'synthetic-key', secretKey: 'synthetic-secret', now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ path: new URL(url).pathname, body, headers: options.headers });
      if (url.endsWith('/auth/login')) return success({ token: 'synthetic-token' });
      if (url.endsWith('/instruments/master')) return success(masterFixture);
      return success({ listQuotes: body.instruments.map(({ exchangeInstrumentID: id }) => JSON.stringify(quoteFixture(id))) });
    },
    ...overrides,
  });
  return { client, calls, advance: (ms) => { clock += ms; } };
}

test('concurrent callers share login and instrument-master flights', async () => {
  const { client, calls } = mockClient();
  await Promise.all([client.getContracts(), client.getContracts(), client.getQuotes([201]), client.getQuotes([201, 202])]);
  assert.equal(calls.filter((call) => call.path.endsWith('/auth/login')).length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith('/master')).length, 1);
  assert.deepEqual(calls[0].body, { appKey: 'synthetic-key', secretKey: 'synthetic-secret' });
  assert.deepEqual(calls[1].body, { exchangeSegmentList: ['MCXFO'] });
  const quoteRequests = calls.filter((call) => call.path.endsWith('/quotes'));
  assert.deepEqual(quoteRequests.map((call) => call.body.instruments.map((item) => item.exchangeInstrumentID)), [[201], [202]]);
  assert.equal(quoteRequests[0].body.instruments[0].exchangeSegment, 51);
  assert.equal(quoteRequests[0].body.xtsMessageCode, 1502);
  assert.equal(quoteRequests[0].body.publishFormat, 'JSON');
  assert.deepEqual(client.getStatus(), { configured: true, connected: true, error: null, code: null });
});

test('quote cache expires after two seconds; master expires after six hours', async () => {
  const { client, calls, advance } = mockClient();
  const first = await client.getQuotes([201]);
  advance(1999);
  const cached = await client.getQuotes([201]);
  assert.equal(cached.quotes[0].receivedAt, first.quotes[0].receivedAt);
  assert.equal(calls.filter((call) => call.path.endsWith('/quotes')).length, 1);
  advance(2);
  const fresh = await client.getQuotes([201]);
  assert.notEqual(fresh.quotes[0].receivedAt, first.quotes[0].receivedAt);
  assert.equal(calls.filter((call) => call.path.endsWith('/quotes')).length, 2);
  advance(6 * 60 * 60 * 1000);
  await client.getContracts();
  assert.equal(calls.filter((call) => call.path.endsWith('/master')).length, 2);
});

test('serializes distinct quote requests and spaces broker calls', async () => {
  let clock = 0;
  const starts = [];
  const client = mockClient({ now: () => clock, sleep: async (ms) => { clock += ms; }, fetchImpl: async (url, options) => {
    if (url.endsWith('/login')) return success({ token: 'test-token' });
    if (url.endsWith('/master')) return success(masterFixture);
    starts.push(clock);
    return success({ listQuotes: JSON.parse(options.body).instruments.map((item) => quoteFixture(item.exchangeInstrumentID)) });
  } }).client;
  await Promise.all([client.getQuotes([101]), client.getQuotes([201]), client.getQuotes([202])]);
  assert.deepEqual(starts, [0, 1000, 2000]);
});

test('refreshes expired auth once without exposing tokens or upstream errors', async () => {
  let logins = 0;
  let masters = 0;
  const { client } = mockClient({ fetchImpl: async (url) => {
    if (url.endsWith('/login')) { logins++; return success({ token: `private-token-${logins}` }); }
    masters++;
    if (masters === 1) return new Response(JSON.stringify({ description: 'private-token-1 expired' }), { status: 401 });
    return success(masterFixture);
  } });
  assert.equal((await client.getContracts()).length, 3);
  assert.equal(logins, 2);
  assert.equal(masters, 2);
  assert.equal(JSON.stringify(client.getStatus()).includes('private-token'), false);
});

test('stops after one auth retry and redacts all broker descriptions', async () => {
  let logins = 0;
  const { client } = mockClient({ fetchImpl: async (url) => {
    if (url.endsWith('/login')) { logins++; return success({ token: 'sensitive-token' }); }
    return new Response(JSON.stringify({ type: 'error', description: 'sensitive-token synthetic-secret token expired' }), { status: 200 });
  } });
  await assert.rejects(client.getContracts(), (error) => {
    assert.equal(error.code, 'AUTH_FAILED');
    assert.equal(JSON.stringify(publicError(error)).includes('sensitive-token'), false);
    return true;
  });
  assert.equal(logins, 2);
  assert.equal(client.getStatus().connected, false);
  assert.equal(JSON.stringify(client.getStatus()).includes('synthetic-secret'), false);
});

test('configuration and invalid/unknown IDs fail without unnecessary broker requests', async () => {
  let invoked = false;
  const empty = createMarketClient({ fetchImpl: async () => { invoked = true; } });
  await assert.rejects(empty.getContracts(), { code: 'NOT_CONFIGURED' });
  assert.equal(invoked, false);
  const { client, calls } = mockClient();
  for (const ids of [[], ['201'], [NaN], [0], Array.from({ length: 51 }, () => 201)]) {
    await assert.rejects(client.getQuotes(ids), { code: 'INVALID_INSTRUMENTS' });
  }
  assert.equal(calls.length, 0);
  await assert.rejects(client.getQuotes([999]), { code: 'UNKNOWN_INSTRUMENT' });
  assert.equal(calls.filter((call) => call.path.endsWith('/quotes')).length, 0);
});

test('network failures and malformed JSON become safe errors', async () => {
  const failing = mockClient({ fetchImpl: async () => { throw new Error('synthetic-secret in upstream request URL'); } }).client;
  await assert.rejects(failing.getContracts(), { code: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(failing.getStatus().error.includes('synthetic-secret'), false);
  const malformed = mockClient({ fetchImpl: async () => new Response('not JSON') }).client;
  await assert.rejects(malformed.getContracts(), { code: 'INVALID_RESPONSE' });
});

test('HTTP 400 login rejection is classified as authentication failure and sanitized', async () => {
  const { client } = mockClient({ fetchImpl: async () => new Response(JSON.stringify({
    type: 'error', code: 'e-response-0004', description: 'Data Not found. synthetic-secret',
  }), { status: 400 }) });
  await assert.rejects(client.getContracts(), (error) => {
    const safe = publicError(error);
    assert.equal(safe.status, 502);
    assert.equal(safe.body.code, 'AUTH_FAILED');
    assert.equal(safe.body.error, 'Eureka rejected the login. Confirm the Binary Marketdata API app key and secret are approved and enabled for this endpoint/account.');
    assert.equal(JSON.stringify(safe).includes('Data Not found'), false);
    assert.equal(JSON.stringify(safe).includes('synthetic-secret'), false);
    return true;
  });
  assert.equal(client.getStatus().code, 'AUTH_FAILED');
  assert.equal(client.getStatus().connected, false);
  assert.equal(JSON.stringify(client.getStatus()).includes('synthetic-secret'), false);
});

test('times out an upstream request and clears the failed login flight for retry', async () => {
  let attempts = 0;
  const { client } = mockClient({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => {
    attempts++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  await assert.rejects(client.getContracts(), { code: 'UPSTREAM_TIMEOUT' });
  await assert.rejects(client.getContracts(), { code: 'UPSTREAM_TIMEOUT' });
  assert.equal(attempts, 2);
});

test('omitted quotes never resurrect stale cached marks', async () => {
  let clock = 0;
  let quoteCalls = 0;
  const { client } = mockClient({ now: () => clock, fetchImpl: async (url) => {
    if (url.endsWith('/login')) return success({ token: 'test-token' });
    if (url.endsWith('/master')) return success(masterFixture);
    quoteCalls++;
    return success({ listQuotes: quoteCalls === 1 ? [quoteFixture(201)] : [] });
  } });
  assert.equal((await client.getQuotes([201])).quotes.length, 1);
  clock = 3000;
  assert.deepEqual((await client.getQuotes([201])).quotes, []);
});
