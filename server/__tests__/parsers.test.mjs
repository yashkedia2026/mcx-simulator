import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMaster, parseQuotes } from '../parsers.mjs';
import { futureFields, callFields, putFields, masterFixture, quoteFixture } from './fixtures.mjs';

test('actual XTS futures/options offsets, price conversion and explicit futures linkage', () => {
  const contracts = parseMaster(masterFixture);
  const future = contracts.find((contract) => contract.id === 101);
  const call = contracts.find((contract) => contract.id === 201);
  const put = contracts.find((contract) => contract.id === 202);
  assert.equal(contracts.length, 3);
  assert.equal(future.kind, 'FUT');
  assert.equal(future.strike, null);
  assert.equal(future.name, 'GOLD 30NOV2026');
  assert.equal(future.expiry, '2026-11-30T23:30:00');
  assert.equal(call.expiry, '2026-11-25T23:30:00');
  assert.equal(call.kind, 'CE');
  assert.equal(put.kind, 'PE');
  assert.equal(call.strike, 74000);
  assert.equal(call.underlyingId, 101);
  assert.equal(call.lotSize, 1000);
  assert.equal(call.priceMultiplier, 0.1);
  assert.equal(call.lotSize * call.priceMultiplier, 100);
  assert.equal(call.tickSize, 0.5);
});

test('supports documented unified futures layout with explicit placeholders', () => {
  const legacy = [...futureFields.slice(0, 17), '0', '0', ...futureFields.slice(17)];
  assert.deepEqual(parseMaster(legacy.join('|')), parseMaster(futureFields.join('|')));
});

test('does not infer missing underlying from a similar symbol or nearby expiry', () => {
  const missing = [...callFields]; missing[14] = '-1';
  const exchangeReference = [...putFields]; exchangeReference[14] = '101';
  const contracts = parseMaster([futureFields, missing, exchangeReference].map((fields) => fields.join('|')).join('\n'));
  assert.equal(contracts.find((contract) => contract.id === 201).underlyingId, null);
  assert.equal(contracts.find((contract) => contract.id === 202).underlyingId, 101);
});

test('rejects malformed units, expiry, non-MCX rows, and unsupported derivative kinds', () => {
  const rows = [[0, 'NSEFO'], [12, ''], [13, '0'], [20, ''], [21, '0'], [16, '2026-02-30T23:30:00'], [18, '0'], [1, 'NaN'], [2, '4']].map(([index, value]) => {
    const invalid = [...callFields]; invalid[index] = value; return invalid.join('|');
  });
  assert.deepEqual(parseMaster(rows.join('\n')), []);
});

test('parses JSON-string depth and touchline quotes without inventing exchange timestamps', () => {
  const receivedAt = '2026-11-05T06:00:00.000Z';
  const depth = quoteFixture();
  const flat = { ExchangeSegment: 'MCXFO', ExchangeInstrumentID: '101', LastTradedPrice: '75000', LastTradedTime: '2026-11-05T11:29:59+05:30', BidInfo: { Price: 74999, Size: 2 }, AskInfo: { Price: 75001, Size: 0 } };
  const quotes = parseQuotes([JSON.stringify(depth), flat, 'broken', { ...depth, ExchangeSegment: 2 }], receivedAt);
  assert.deepEqual(quotes, [
    { instrumentId: 201, lastPrice: 100, bid: 99, ask: 101, lastTradedAt: null, receivedAt },
    { instrumentId: 101, lastPrice: 75000, bid: 74999, ask: null, lastTradedAt: '2026-11-05T05:59:59.000Z', receivedAt },
  ]);
});

test('empty book levels and missing prices stay null rather than zero', () => {
  const value = quoteFixture();
  value.Bids = [{ Price: 90, Size: 0 }]; value.Asks = [{ Price: 0, Size: 10 }];
  value.Touchline.LastTradedPrice = 0;
  assert.deepEqual(parseQuotes([value], 'now')[0], {
    instrumentId: 201, lastPrice: null, bid: null, ask: null, lastTradedAt: null, receivedAt: 'now',
  });
});
