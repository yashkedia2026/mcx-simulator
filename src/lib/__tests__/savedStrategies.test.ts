import { describe, expect, it } from 'vitest';
import { parseSavedStrategies } from '../../hooks/useSavedStrategies';

const strategy = {
  id: 'saved-1', name: 'Gold call', instrument: 'GOLD', futuresPrice: 74000,
  savedAt: '2026-11-05T10:00:00.000Z', riskFreeRate: 6.5,
  legs: [{
    id: 'leg-1', positionType: 'BUY', optionType: 'CE', strikePrice: 74000,
    premium: 500, lots: 1, iv: 18, daysToExpiry: 30,
    instrument: { symbol: 'GOLD', name: 'Gold', lotSize: 100, tickSize: 1, unit: 'grams', priceUnit: '₹/10g' },
    marketContract: {
      instrumentId: 1234, underlyingInstrumentId: 5678, expiry: '2026-11-25T23:30:00+05:30',
      symbol: 'GOLD', name: 'Gold Nov Call', brokerLotSize: 1000, priceMultiplier: 0.1,
    },
  }],
};

describe('saved strategy validation', () => {
  it('preserves the pricing inputs and complete live contract identity', () => {
    expect(parseSavedStrategies(JSON.stringify([strategy]))).toEqual([strategy]);
  });

  it('accepts legacy manual strategies without rate or live metadata', () => {
    const legacy = { ...strategy, riskFreeRate: undefined, legs: [{ ...strategy.legs[0], marketContract: undefined }] };
    const restored = parseSavedStrategies(JSON.stringify([legacy]));
    expect(restored).toHaveLength(1);
    expect(restored[0].riskFreeRate).toBeUndefined();
    expect(restored[0].legs[0].premium).toBe(500);
  });

  it.each([null, '', 'invalid', 'null', '{}', '1', '"saved"'])('rejects corrupt or wrong-shape storage: %s', raw => {
    expect(parseSavedStrategies(raw)).toEqual([]);
  });

  it('retains valid entries when one saved strategy is malformed', () => {
    const bad = { ...strategy, id: 'bad', legs: [{ ...strategy.legs[0], lots: -1 }] };
    expect(parseSavedStrategies(JSON.stringify([bad, strategy]))).toEqual([strategy]);
  });

  it('rejects malformed market identities and duplicate leg identifiers', () => {
    const badContract = { ...strategy, legs: [{ ...strategy.legs[0], marketContract: { ...strategy.legs[0].marketContract, instrumentId: -1 } }] };
    const duplicate = { ...strategy, legs: [strategy.legs[0], strategy.legs[0]] };
    expect(parseSavedStrategies(JSON.stringify([badContract, duplicate]))).toEqual([]);
  });

  it('limits and deduplicates stored strategies', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({ ...strategy, id: `saved-${i}` }));
    expect(parseSavedStrategies(JSON.stringify(entries))).toHaveLength(20);
    expect(parseSavedStrategies(JSON.stringify([strategy, strategy]))).toHaveLength(1);
  });
});
