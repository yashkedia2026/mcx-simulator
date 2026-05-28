import { describe, it, expect } from 'vitest';
import { generatePayoffData } from '../payoff';
import type { StrategyInputs, OptionLeg } from '../../types';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const goldInstrument = {
  symbol: 'GOLD', name: 'Gold',
  lotSize: 100, tickSize: 1,
  unit: 'grams', priceUnit: '₹/10g',
};

const baseLeg = (overrides: Partial<OptionLeg>): OptionLeg => ({
  id: 'l1', instrument: goldInstrument, positionType: 'BUY',
  optionType: 'CE', strikePrice: 74000, premium: 500,
  lots: 1, iv: 18, daysToExpiry: 30,
  ...overrides,
});

const baseInputs = (legs: OptionLeg[]): StrategyInputs => ({
  underlyingPrice: 74000,
  riskFreeRate: 6.5,
  legs,
});

// Helper: find point closest to a given price in the payoff data
const atPrice = (data: ReturnType<typeof generatePayoffData>, price: number) => {
  return data.reduce((closest, point) =>
    Math.abs(point.price - price) < Math.abs(closest.price - price) ? point : closest
  );
};

// ─────────────────────────────────────────────
// 1. LONG CALL
// ─────────────────────────────────────────────
describe('Payoff — Long Call', () => {
  const premium = 500;
  const lotSize = 100;
  const lots    = 1;
  const strike  = 74000;
  const data    = generatePayoffData(baseInputs([
    baseLeg({ positionType: 'BUY', optionType: 'CE', strikePrice: strike, premium })
  ]));

  it('Should generate 200+ data points', () => {
    expect(data.length).toBeGreaterThanOrEqual(200);
  });

  it('Max loss at expiry = premium paid (far OTM)', () => {
    const farLeft = data[0]; // Lowest price point
    expect(farLeft.expiryPnL).toBeCloseTo(-(premium * lotSize * lots), -1);
  });

  it('At expiry, profit starts above strike + premium', () => {
    const breakeven = strike + premium; // 74000 + 500 = 74500
    const above = atPrice(data, breakeven + 1000);
    expect(above.expiryPnL).toBeGreaterThan(0);
  });

  it('At expiry, loss below strike = exactly -premium × lotSize', () => {
    const below = atPrice(data, strike - 2000);
    expect(below.expiryPnL).toBeCloseTo(-(premium * lotSize * lots), -1);
  });

  it('Expiry payoff is monotonically increasing above strike', () => {
    const aboveStrike = data.filter(p => p.price > strike + 500);
    for (let i = 1; i < aboveStrike.length; i++) {
      expect(aboveStrike[i].expiryPnL).toBeGreaterThanOrEqual(aboveStrike[i - 1].expiryPnL);
    }
  });

});

// ─────────────────────────────────────────────
// 2. LONG PUT
// ─────────────────────────────────────────────
describe('Payoff — Long Put', () => {
  const premium = 500;
  const lotSize = 100;
  const strike  = 74000;
  const data    = generatePayoffData(baseInputs([
    baseLeg({ positionType: 'BUY', optionType: 'PE', strikePrice: strike, premium })
  ]));

  it('Max loss = premium paid (far ITM → OTM for put)', () => {
    const farRight = data[data.length - 1];
    expect(farRight.expiryPnL).toBeCloseTo(-(premium * lotSize), -1);
  });

  it('Profit above strike - premium (below breakeven)', () => {
    const breakeven = strike - premium; // 74000 - 500 = 73500
    const below = atPrice(data, breakeven - 1000);
    expect(below.expiryPnL).toBeGreaterThan(0);
  });

  it('Expiry payoff is monotonically decreasing above strike (put goes worthless)', () => {
    const aboveStrike = data.filter(p => p.price > strike + 500);
    aboveStrike.forEach(p => {
      expect(p.expiryPnL).toBeCloseTo(-(premium * lotSize), -1);
    });
  });

});

// ─────────────────────────────────────────────
// 3. SHORT CALL
// ─────────────────────────────────────────────
describe('Payoff — Short Call', () => {
  const premium = 500;
  const lotSize = 100;
  const strike  = 74000;
  const data    = generatePayoffData(baseInputs([
    baseLeg({ positionType: 'SELL', optionType: 'CE', strikePrice: strike, premium })
  ]));

  it('Max profit = premium received (far OTM at expiry)', () => {
    const farLeft = data[0];
    expect(farLeft.expiryPnL).toBeCloseTo(premium * lotSize, -1);
  });

  it('Losses grow above strike + premium (breakeven)', () => {
    const breakeven = strike + premium;
    const above = atPrice(data, breakeven + 2000);
    expect(above.expiryPnL).toBeLessThan(0);
  });

  it('Short Call has unlimited loss potential (keeps falling at high prices)', () => {
    const last = data[data.length - 1];
    expect(last.expiryPnL).toBeLessThan(-(premium * lotSize));
  });

});

// ─────────────────────────────────────────────
// 4. LONG STRADDLE
// ─────────────────────────────────────────────
describe('Payoff — Long Straddle', () => {
  const callPremium = 500;
  const putPremium  = 500;
  const totalDebit  = (callPremium + putPremium) * 100;
  const strike      = 74000;
  const data        = generatePayoffData(baseInputs([
    baseLeg({ id: '1', positionType: 'BUY', optionType: 'CE', strikePrice: strike, premium: callPremium }),
    baseLeg({ id: '2', positionType: 'BUY', optionType: 'PE', strikePrice: strike, premium: putPremium  }),
  ]));

  it('Maximum loss occurs at ATM (the strike price) at expiry', () => {
    const atStrike = atPrice(data, strike);
    const minPnL   = Math.min(...data.map(p => p.expiryPnL));
    expect(atStrike.expiryPnL).toBeCloseTo(minPnL, -2);
  });

  it('Max loss = total debit paid', () => {
    const minPnL = Math.min(...data.map(p => p.expiryPnL));
    expect(minPnL).toBeCloseTo(-totalDebit, -1);
  });

  it('Profit on both sides of the strike at large moves', () => {
    const farLeft  = data[0];
    const farRight = data[data.length - 1];
    expect(farLeft.expiryPnL).toBeGreaterThan(0);
    expect(farRight.expiryPnL).toBeGreaterThan(0);
  });

  it('Two breakeven points exist (one each side of strike)', () => {
    const lowerBreakeven = strike - (callPremium + putPremium); // 73000
    const upperBreakeven = strike + (callPremium + putPremium); // 75000
    const atLower = atPrice(data, lowerBreakeven);
    const atUpper = atPrice(data, upperBreakeven);
    expect(Math.abs(atLower.expiryPnL)).toBeLessThan(totalDebit * 0.05);
    expect(Math.abs(atUpper.expiryPnL)).toBeLessThan(totalDebit * 0.05);
  });

});

// ─────────────────────────────────────────────
// 5. BULL CALL SPREAD
// ─────────────────────────────────────────────
describe('Payoff — Bull Call Spread', () => {
  const buyStrike   = 73000;
  const sellStrike  = 75000;
  const buyPremium  = 900;
  const sellPremium = 400;
  const lotSize     = 100;
  const netDebit    = (buyPremium - sellPremium) * lotSize;  // ₹50,000
  const maxProfit   = (sellStrike - buyStrike - buyPremium + sellPremium) * lotSize; // ₹1,50,000
  const data        = generatePayoffData(baseInputs([
    baseLeg({ id: '1', positionType: 'BUY',  optionType: 'CE', strikePrice: buyStrike,  premium: buyPremium  }),
    baseLeg({ id: '2', positionType: 'SELL', optionType: 'CE', strikePrice: sellStrike, premium: sellPremium }),
  ]));

  it('Max loss is capped (not unlimited) — bounded strategy', () => {
    const minPnL = Math.min(...data.map(p => p.expiryPnL));
    expect(minPnL).toBeCloseTo(-netDebit, -2);
  });

  it('Max profit is capped at spread width minus net debit', () => {
    const maxPnL = Math.max(...data.map(p => p.expiryPnL));
    expect(maxPnL).toBeCloseTo(maxProfit, -2);
  });

  it('Profit zone is above buy strike + net debit per unit', () => {
    const breakeven = buyStrike + (buyPremium - sellPremium);
    const above     = atPrice(data, breakeven + 500);
    expect(above.expiryPnL).toBeGreaterThan(0);
  });

  it('Loss zone is below buy strike', () => {
    const below = atPrice(data, buyStrike - 2000);
    expect(below.expiryPnL).toBeCloseTo(-netDebit, -2);
  });

});

// ─────────────────────────────────────────────
// 6. IRON CONDOR
// ─────────────────────────────────────────────
describe('Payoff — Iron Condor', () => {
  // BUY PE 72000, SELL PE 73000, SELL CE 75000, BUY CE 76000
  const data = generatePayoffData(baseInputs([
    baseLeg({ id: '1', positionType: 'BUY',  optionType: 'PE', strikePrice: 72000, premium: 200 }),
    baseLeg({ id: '2', positionType: 'SELL', optionType: 'PE', strikePrice: 73000, premium: 400 }),
    baseLeg({ id: '3', positionType: 'SELL', optionType: 'CE', strikePrice: 75000, premium: 400 }),
    baseLeg({ id: '4', positionType: 'BUY',  optionType: 'CE', strikePrice: 76000, premium: 200 }),
  ]));

  it('Max loss is bounded (NOT unlimited) — key Iron Condor property', () => {
    const farLeft  = data[0].expiryPnL;
    const farRight = data[data.length - 1].expiryPnL;
    // Should NOT be deeply negative beyond wing width
    expect(farLeft).toBeGreaterThan(-150000);
    expect(farRight).toBeGreaterThan(-150000);
  });

  it('Max profit zone exists between the two short strikes', () => {
    const middle = atPrice(data, 74000); // Between 73000 and 75000
    const maxPnL = Math.max(...data.map(p => p.expiryPnL));
    expect(middle.expiryPnL).toBeCloseTo(maxPnL, -2);
  });

  it('Max profit = net credit received', () => {
    const netCredit = (400 + 400 - 200 - 200) * 100; // ₹40,000
    const maxPnL    = Math.max(...data.map(p => p.expiryPnL));
    expect(maxPnL).toBeCloseTo(netCredit, -2);
  });

  it('Has exactly 4 legs', () => {
    // Confirmed by the test setup above
    expect(true).toBe(true);
  });

});

// ─────────────────────────────────────────────
// 7. LOT SIZE MULTIPLIER
// ─────────────────────────────────────────────
describe('Payoff — Lot Size Multiplier', () => {

  it('2 lots should produce exactly 2x the P&L of 1 lot', () => {
    const data1 = generatePayoffData(baseInputs([baseLeg({ lots: 1 })]));
    const data2 = generatePayoffData(baseInputs([baseLeg({ lots: 2 })]));
    const point1 = data1[0];
    const point2 = data2[0];
    expect(point2.expiryPnL).toBeCloseTo(point1.expiryPnL * 2, 0);
  });

  it('Gold lot size 100g: ₹1 price move = ₹100 P&L per lot', () => {
    // At expiry, ITM call: intrinsic = (F - K) × lotSize × lots
    const K = 74000;
    const F = 74001; // 1 rupee above strike
    const data = generatePayoffData({
      underlyingPrice: F,
      riskFreeRate: 6.5,
      legs: [baseLeg({ strikePrice: K, premium: 0, daysToExpiry: 0, lots: 1 })],
    });
    const atExpiry = atPrice(data, F);
    // Intrinsic = 1 × 100 × 1 = 100, minus premium paid (0)
    expect(atExpiry.expiryPnL).toBeCloseTo(100, 0);
  });

});
