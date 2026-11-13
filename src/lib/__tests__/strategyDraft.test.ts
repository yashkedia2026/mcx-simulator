import { describe, expect, it } from 'vitest';
import { createStrategyDraft, parseStrategyDraft } from '../strategyDraft';
import type { OptionLeg } from '@/types';

const leg: OptionLeg = {
  id: 'leg-1',
  positionType: 'BUY',
  optionType: 'CE',
  strikePrice: 74000,
  premium: 500,
  lots: 1,
  iv: 18,
  daysToExpiry: 30,
  instrument: { symbol: 'GOLD', name: 'Gold', lotSize: 100, tickSize: 1, unit: 'grams', priceUnit: '₹/10g' },
};

describe('strategy draft persistence', () => {
  it('creates a restorable draft with the market-follow setting', () => {
    const draft = createStrategyDraft([leg], 74000, 6.5, true);
    expect(draft).not.toBeNull();
    expect(parseStrategyDraft(JSON.stringify(draft))).toMatchObject({
      underlyingPrice: 74000,
      riskFreeRate: 6.5,
      followMarket: true,
      legs: [leg],
    });
  });

  it('does not create empty drafts', () => {
    expect(createStrategyDraft([], 74000, 6.5, true)).toBeNull();
  });

  it.each([null, '', '{}', '{"version":1,"legs":[]}'])('rejects invalid draft storage: %s', raw => {
    expect(parseStrategyDraft(raw)).toBeNull();
  });
});
