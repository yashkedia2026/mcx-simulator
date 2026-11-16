import { describe, expect, it } from 'vitest';
import type { MarketContract, MarketQuote } from '@/types/market';
import {
  QUOTE_MAX_AGE_MS, createMarketLeg, daysRemaining, expiryTime,
  isFreshQuote, marketPnL, quoteMark, refreshMarketModel, matchesMarketContract,
} from '../marketData';
import { black76Price } from '../black76';

const NOW = Date.parse('2026-11-05T09:00:00Z');
const EXPIRY = '2026-12-01T23:30:00+05:30';
const option: MarketContract = {
  id: 101, symbol: 'GOLD', name: 'Gold Dec 100 CE', kind: 'CE',
  expiry: EXPIRY, strike: 100, lotSize: 1000, tickSize: 0.1,
  underlyingId: 201, priceMultiplier: 0.1,
};
const future: MarketContract = {
  id: 201, symbol: 'GOLD', name: 'Gold Dec Future', kind: 'FUT',
  expiry: '2026-12-05', strike: null, lotSize: 1000, tickSize: 0.1,
  underlyingId: null, priceMultiplier: 0.1,
};
const quote = (instrumentId: number, overrides: Partial<MarketQuote> = {}): MarketQuote => ({
  instrumentId, lastPrice: 10, bid: 9, ask: 11,
  lastTradedAt: new Date(NOW - 1000).toISOString(),
  receivedAt: new Date(NOW).toISOString(), ...overrides,
});
const optionQuote = quote(option.id);
const futureQuote = quote(future.id, { lastPrice: 100, bid: 99, ask: 101 });
const newLeg = (side: 'BUY' | 'SELL' = 'BUY') =>
  createMarketLeg(option, future, optionQuote, futureQuote, side, 6.5, NOW);

describe('saved market identity against the current contract master', () => {
  it('accepts the complete saved contract identity after a JSON save/load roundtrip', () => {
    const restored = JSON.parse(JSON.stringify(newLeg()));
    expect(matchesMarketContract(restored, option)).toBe(true);
    expect(matchesMarketContract(restored, { ...option, name: 'Updated display name' })).toBe(true);
  });

  it.each([
    { field: 'strike', update: { strike: 101 } },
    { field: 'option type', update: { kind: 'PE' as const } },
    { field: 'future type', update: { kind: 'FUT' as const } },
    { field: 'expiry', update: { expiry: '2026-12-02' } },
    { field: 'underlying', update: { underlyingId: 202 } },
    { field: 'symbol', update: { symbol: 'SILVER' } },
    { field: 'lot quantity', update: { lotSize: 500 } },
    { field: 'price conversion', update: { priceMultiplier: 0.01 } },
  ])('rejects reuse of the same numeric option ID for a different $field', ({ update }) => {
    expect(matchesMarketContract(newLeg(), { ...option, ...update })).toBe(false);
  });

  it('checks the leg symbol and effective monetary size as well as saved metadata', () => {
    const leg = newLeg();
    expect(matchesMarketContract({ ...leg, instrument: { ...leg.instrument, symbol: 'SILVER' } }, option)).toBe(false);
    expect(matchesMarketContract({ ...leg, instrument: { ...leg.instrument, lotSize: 10 } }, option)).toBe(false);
    expect(matchesMarketContract(leg, { ...option, id: 999 })).toBe(false);
    // Raw broker units may differ provided the monetary exposure is identical.
    expect(matchesMarketContract(leg, { ...option, lotSize: 2000, priceMultiplier: 0.05 })).toBe(true);
  });

  it.each(['2026-12-01T18:00:00Z', '2026-12-01', '2026-12-01 23:30:00'])(
    'accepts equivalent expiry instants rather than requiring identical strings: %s', expiry => {
      expect(matchesMarketContract(newLeg(), { ...option, expiry })).toBe(true);
    },
  );

  it('rejects missing current-master entries, manual legs and invalid expiry data', () => {
    const leg = newLeg();
    expect(matchesMarketContract(leg, undefined)).toBe(false);
    expect(matchesMarketContract({ ...leg, marketContract: undefined }, option)).toBe(false);
    expect(matchesMarketContract(leg, { ...option, expiry: 'invalid' })).toBe(false);
    expect(matchesMarketContract({ ...leg, marketContract: { ...leg.marketContract!, expiry: 'invalid' } },
      { ...option, expiry: 'invalid' })).toBe(false);
  });
});

describe('contract selection and entry snapshots', () => {
  it('retains the exact option and underlying IDs, and snapshots buy ask / sell bid', () => {
    const buy = newLeg('BUY');
    const sell = newLeg('SELL');
    expect(buy.premium).toBe(11);
    expect(sell.premium).toBe(9);
    expect(buy.optionType).toBe('CE');
    expect(buy.strikePrice).toBe(100);
    expect(buy.marketContract).toEqual({
      instrumentId: 101, underlyingInstrumentId: 201, expiry: EXPIRY,
      symbol: 'GOLD', name: 'Gold Dec 100 CE', brokerLotSize: 1000, priceMultiplier: 0.1,
    });
    expect(Number.isFinite(buy.iv) && buy.iv > 0).toBe(true);
    expect(buy.daysToExpiry).toBeCloseTo((Date.parse(EXPIRY) - NOW) / 86_400_000, 10);
  });

  it('requires the actual linked future, not merely another contract of the same symbol', () => {
    const otherFuture = { ...future, id: 202 };
    expect(() => createMarketLeg(option, otherFuture, optionQuote,
      quote(202, { lastPrice: 100, bid: 99, ask: 101 }), 'BUY', 6.5, NOW)).toThrow(/linked/);
    expect(() => createMarketLeg(option, { ...future, symbol: 'SILVER' },
      optionQuote, futureQuote, 'BUY', 6.5, NOW)).toThrow(/linked/);
    expect(() => createMarketLeg(future, future, futureQuote, futureQuote, 'BUY', 6.5, NOW)).toThrow(/option/);
  });

  it.each(['option', 'future'])('rejects a quote for the wrong %s instrument', which => {
    expect(() => createMarketLeg(option, future,
      which === 'option' ? { ...optionQuote, instrumentId: 999 } : optionQuote,
      which === 'future' ? { ...futureQuote, instrumentId: 999 } : futureQuote,
      'BUY', 6.5, NOW)).toThrow(/fresh quotes/);
  });

  it.each(['option', 'future'])('requires a fresh %s quote before creating an entry', which => {
    const stale = { receivedAt: new Date(NOW - QUOTE_MAX_AGE_MS - 1).toISOString() };
    expect(() => createMarketLeg(option, future,
      which === 'option' ? { ...optionQuote, ...stale } : optionQuote,
      which === 'future' ? { ...futureQuote, ...stale } : futureQuote,
      'BUY', 6.5, NOW)).toThrow(/fresh quotes/);
  });

  it.each([
    { side: 'BUY' as const, update: { ask: null } },
    { side: 'BUY' as const, update: { ask: 0 } },
    { side: 'SELL' as const, update: { bid: null } },
    { side: 'SELL' as const, update: { bid: 0 } },
  ])('never substitutes LTP for a missing executable $side entry', ({ side, update }) => {
    expect(() => createMarketLeg(option, future, { ...optionQuote, ...update, lastPrice: 10 },
      futureQuote, side, 6.5, NOW)).toThrow(/bid\/ask/);
  });

  it('rejects a crossed market and quotes without an implied-volatility solution', () => {
    expect(() => createMarketLeg(option, future, quote(101, { bid: 12, ask: 10 }),
      futureQuote, 'BUY', 6.5, NOW)).toThrow(/bid\/ask/);
    expect(() => createMarketLeg(option, future, quote(101, { bid: 110, ask: 112, lastPrice: 111 }),
      futureQuote, 'BUY', 6.5, NOW)).toThrow(/implied volatility/);
  });

  it('converts broker quantity into monetary price units without using a hardcoded symbol lot', () => {
    const converted = createMarketLeg({ ...option, lotSize: 500, priceMultiplier: 0.1 },
      future, optionQuote, futureQuote, 'BUY', 6.5, NOW);
    expect(converted.instrument.lotSize).toBe(50);
    expect(converted.marketContract?.brokerLotSize).toBe(500);
    expect(converted.marketContract?.priceMultiplier).toBe(0.1);
    expect(marketPnL([converted], { 101: quote(101, { bid: 11, ask: 13, lastPrice: 12 }) }, NOW)).toBe(50);
  });

  it('preserves the requested live order lot quantity', () => {
    const leg = createMarketLeg(option, future, optionQuote, futureQuote, 'BUY', 6.5, NOW, 4);
    expect(leg.lots).toBe(4);
  });

  it('accepts a manually entered historical fill price', () => {
    const leg = createMarketLeg(option, future, optionQuote, futureQuote, 'BUY', 6.5, NOW, 1, 7.5);
    expect(leg.premium).toBe(7.5);
  });

  it.each([0, -1, NaN, Infinity])('rejects unavailable/invalid lot conversion %s', multiplier => {
    expect(() => createMarketLeg({ ...option, priceMultiplier: multiplier }, future,
      optionQuote, futureQuote, 'BUY', 6.5, NOW)).toThrow(/lot conversion/);
  });
});

describe('quote marks and freshness', () => {
  it('uses a valid two-sided midpoint, then a valid last price when the book is unavailable', () => {
    expect(quoteMark(quote(101, { lastPrice: 30 }))).toBe(10);
    expect(quoteMark(quote(101, { bid: null, ask: null, lastPrice: 12 }))).toBe(12);
    expect(quoteMark(quote(101, { bid: null, ask: null, lastPrice: 0 }))).toBeNull();
    expect(quoteMark(undefined)).toBeNull();
  });

  it.each([
    { bid: Infinity, ask: Infinity, lastPrice: null },
    { bid: 9, ask: Infinity, lastPrice: null },
    { bid: null, ask: null, lastPrice: Infinity },
    { bid: NaN, ask: NaN, lastPrice: NaN },
  ])('rejects nonfinite prices instead of producing an invalid mark', updates => {
    expect(quoteMark(quote(101, updates))).toBeNull();
  });

  it('enforces the receipt-age boundary and bounded clock skew', () => {
    const atAge = (age: number) => quote(101, { receivedAt: new Date(NOW - age).toISOString() });
    expect(isFreshQuote(atAge(QUOTE_MAX_AGE_MS), NOW)).toBe(true);
    expect(isFreshQuote(atAge(QUOTE_MAX_AGE_MS + 1), NOW)).toBe(false);
    expect(isFreshQuote(atAge(-1000), NOW)).toBe(true);
    expect(isFreshQuote(atAge(-1001), NOW)).toBe(false);
    expect(isFreshQuote(quote(101, { receivedAt: 'invalid' }), NOW)).toBe(false);
    expect(isFreshQuote(undefined, NOW)).toBe(false);
  });
});

describe('complete market P&L without changing entries', () => {
  it('applies side, lot count and monetary multiplier to later quotes while preserving entry snapshots', () => {
    const buy = { ...newLeg('BUY'), lots: 2 };
    const put = { ...option, id: 102, kind: 'PE' as const, name: 'Gold Dec 100 PE' };
    const sell = createMarketLeg(put, future, quote(102, { bid: 8, ask: 10 }), futureQuote, 'SELL', 6.5, NOW);
    const entriesBefore = structuredClone([buy, sell]);
    const marks = {
      101: quote(101, { bid: 12, ask: 14, lastPrice: 13 }),
      102: quote(102, { bid: 5, ask: 7, lastPrice: 6 }),
    };
    // Buy: (13-11)*2*100 = 400. Sell: (8-6)*1*100 = 200.
    expect(marketPnL([buy, sell], marks, NOW)).toBe(600);
    expect([buy, sell]).toEqual(entriesBefore);
    // Deliberately make the midpoint differ from LTP; P&L must follow LTP.
    marks[101].bid = 30;
    marks[101].ask = 32;
    marks[101].lastPrice = 21;
    expect(marketPnL([buy, sell], marks, NOW)).toBe(2200);
    expect([buy, sell]).toEqual(entriesBefore);
  });

  it('does not fall back to the bid/ask midpoint when LTP is unavailable', () => {
    expect(marketPnL([newLeg()], {
      101: quote(101, { bid: 12, ask: 14, lastPrice: null }),
    }, NOW)).toBeNull();
  });

  it('does not report a partial total when any leg is missing, stale, or unpriceable', () => {
    const buy = newLeg();
    const other = { ...newLeg(), id: 'second', marketContract: { ...buy.marketContract!, instrumentId: 102 } };
    const good = quote(101, { bid: 12, ask: 14 });
    expect(marketPnL([buy, other], { 101: good }, NOW)).toBeNull();
    const stale = quote(102, { receivedAt: new Date(NOW - QUOTE_MAX_AGE_MS - 1).toISOString() });
    expect(marketPnL([buy, other], { 101: good, 102: stale }, NOW)).toBeNull();
    const empty = quote(102, { bid: null, ask: null, lastPrice: null });
    expect(marketPnL([buy, other], { 101: good, 102: empty }, NOW)).toBeNull();
    expect(marketPnL([buy, { ...other, marketContract: undefined }], { 101: good }, NOW)).toBeNull();
    expect(marketPnL([], { 101: good }, NOW)).toBeNull();
  });

  it('rejects a quote whose body disagrees with its map key', () => {
    expect(marketPnL([newLeg()], { 101: quote(999, { bid: 12, ask: 14 }) }, NOW)).toBeNull();
  });
});

describe('atomic market model refresh', () => {
  const modelLegs = () => {
    const call = newLeg();
    const put = createMarketLeg({ ...option, id: 102, kind: 'PE', name: 'Gold Dec 100 PE' },
      future, quote(102, { bid: 8, ask: 10 }), futureQuote, 'SELL', 6.5, NOW);
    return [call, put];
  };
  const modelQuotes = (): Record<number, MarketQuote> => ({
    101: optionQuote,
    102: quote(102, { bid: 8, ask: 10 }),
    201: futureQuote,
  });

  it('refreshes every IV and DTE from one complete snapshot while preserving entry premiums', () => {
    const legs = modelLegs();
    const before = structuredClone(legs);
    const later = NOW + 3_600_000;
    const receivedAt = new Date(later).toISOString();
    const refreshed = refreshMarketModel(legs, {
      101: quote(101, { bid: 17, ask: 19, receivedAt }),
      102: quote(102, { bid: 7, ask: 9, receivedAt }),
      201: quote(201, { bid: 109, ask: 111, lastPrice: 110, receivedAt }),
    }, 6.5, later);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.underlyingPrice).toBe(110);
    expect(refreshed!.legs).toHaveLength(2);
    for (let i = 0; i < legs.length; i++) {
      const refreshedLeg = refreshed!.legs[i];
      expect(refreshedLeg.premium).toBe(legs[i].premium);
      expect(refreshedLeg.marketContract).toEqual(legs[i].marketContract);
      expect(refreshedLeg.daysToExpiry).toBeCloseTo(legs[i].daysToExpiry - 1 / 24, 10);
      expect(black76Price(110, refreshedLeg.strikePrice, refreshedLeg.daysToExpiry / 365,
        0.065, refreshedLeg.iv / 100, refreshedLeg.optionType)).toBeCloseTo(i === 0 ? 18 : 8, 7);
    }
    expect(legs).toEqual(before);
  });

  it('returns no model for missing/stale option or underlying quotes rather than updating some legs', () => {
    const legs = modelLegs();
    const before = structuredClone(legs);
    for (const id of [101, 102, 201]) {
      const missing = modelQuotes();
      delete missing[id];
      expect(refreshMarketModel(legs, missing, 6.5, NOW)).toBeNull();
      const stale = modelQuotes();
      stale[id] = { ...stale[id], receivedAt: new Date(NOW - QUOTE_MAX_AGE_MS - 1).toISOString() };
      expect(refreshMarketModel(legs, stale, 6.5, NOW)).toBeNull();
    }
    expect(legs).toEqual(before);
  });

  it('returns no model when a quote identity, mark or IV solution is invalid', () => {
    const legs = modelLegs();
    const before = structuredClone(legs);
    const quotes = modelQuotes();
    expect(refreshMarketModel(legs, { ...quotes, 102: quote(999) }, 6.5, NOW)).toBeNull();
    expect(refreshMarketModel(legs, { ...quotes, 201: quote(999) }, 6.5, NOW)).toBeNull();
    expect(refreshMarketModel(legs, { ...quotes, 102: quote(102, { bid: null, ask: null, lastPrice: null }) }, 6.5, NOW)).toBeNull();
    expect(refreshMarketModel(legs, { ...quotes, 102: quote(102, { bid: 110, ask: 112 }) }, 6.5, NOW)).toBeNull();
    expect(refreshMarketModel(legs, quotes, NaN, NOW)).toBeNull();
    expect(legs).toEqual(before);
  });

  it.each([
    { underlyingInstrumentId: 202 },
    { expiry: '2026-12-02' },
    { symbol: 'SILVER' },
  ])('refuses incompatible contracts in a shared-underlying model', change => {
    const legs = modelLegs();
    legs[1] = { ...legs[1], marketContract: { ...legs[1].marketContract!, ...change } };
    expect(refreshMarketModel(legs, modelQuotes(), 6.5, NOW)).toBeNull();
  });

  it('accepts one expiry instant stored in different timezone formats across legs', () => {
    const legs = modelLegs();
    legs[1] = { ...legs[1], marketContract: { ...legs[1].marketContract!, expiry: '2026-12-01T18:00:00Z' } };
    const refreshed = refreshMarketModel(legs, modelQuotes(), 6.5, NOW);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.legs[0].daysToExpiry).toBe(refreshed!.legs[1].daysToExpiry);
  });

  it('accepts zero IV when a valid mark equals discounted intrinsic', () => {
    const T = daysRemaining(EXPIRY, NOW) / 365;
    const premium = black76Price(100, 80, T, 0.065, 0, 'CE');
    const mark = quote(101, { bid: premium - 0.1, ask: premium + 0.1, lastPrice: premium });
    const leg = createMarketLeg({ ...option, strike: 80 }, future, mark, futureQuote, 'BUY', 6.5, NOW);
    const refreshed = refreshMarketModel([leg], { 101: mark, 201: futureQuote }, 6.5, NOW);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.legs[0].iv).toBe(0);
    expect(refreshed!.legs[0].premium).toBe(premium + 0.1);
  });

  it('refuses expired, manual or empty portfolios', () => {
    const legs = modelLegs();
    const afterExpiry = Date.parse(EXPIRY) + 1;
    const quotes = Object.fromEntries(Object.entries(modelQuotes()).map(([id, q]) =>
      [id, { ...q, receivedAt: new Date(afterExpiry).toISOString() }]));
    expect(refreshMarketModel(legs, quotes, 6.5, afterExpiry)).toBeNull();
    expect(refreshMarketModel([legs[0], { ...legs[1], marketContract: undefined }], modelQuotes(), 6.5, NOW)).toBeNull();
    expect(refreshMarketModel([], modelQuotes(), 6.5, NOW)).toBeNull();
  });
});

describe('exchange expiry handling', () => {
  it('interprets date-only expiries as 23:30 IST and naive timestamps as IST', () => {
    expect(expiryTime('2026-11-05')).toBe(Date.parse('2026-11-05T18:00:00Z'));
    expect(expiryTime('2026-11-05 17:00:00')).toBe(Date.parse('2026-11-05T11:30:00Z'));
    expect(expiryTime('2026-11-05T17:00:00Z')).toBe(Date.parse('2026-11-05T17:00:00Z'));
    expect(daysRemaining('2026-11-05', NOW)).toBeCloseTo(9 / 24, 10);
    expect(daysRemaining('2026-11-04', NOW)).toBe(0);
    expect(daysRemaining('invalid', NOW)).toBeNaN();
  });

  it.each(['2026-11-04', '2026-11-05T09:00:00Z', 'invalid'])('refuses expired or invalid contracts: %s', expiry => {
    expect(() => createMarketLeg({ ...option, expiry }, future,
      optionQuote, futureQuote, 'BUY', 6.5, NOW)).toThrow(/unexpired/);
  });
});
