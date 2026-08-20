import { describe, it, expect } from 'vitest';
import jStat from 'jstat';
import { calculateMetrics, generatePayoffData } from '../payoff';
import { effectiveSigmaT, probAbove, probBelow } from '../probability';
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

const baseInputs = (legs: OptionLeg[], underlyingPrice = 74000): StrategyInputs => ({
  underlyingPrice,
  riskFreeRate: 6.5,
  legs,
});

function metricsFor(legs: OptionLeg[], underlyingPrice = 74000) {
  const data = generatePayoffData(baseInputs(legs, underlyingPrice));
  return calculateMetrics(data, legs, underlyingPrice);
}

// Reference d2 / N(d2) computed independently of src/lib/probability.ts
function refD2(F: number, K: number, sigma: number, T: number): number {
  return (Math.log(F / K) - 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
}
function refN(x: number): number {
  return jStat.normal.cdf(x, 0, 1);
}

// ─────────────────────────────────────────────
// 1. probAbove / probBelow — basic properties
// ─────────────────────────────────────────────
describe('probAbove / probBelow', () => {
  it('probAbove + probBelow sum to 1', () => {
    const F = 74000, sigma = 0.18, T = 30 / 365;
    expect(probAbove(74000, F, sigma, T) + probBelow(74000, F, sigma, T)).toBeCloseTo(1, 10);
  });

  it('matches N(d2) directly', () => {
    const F = 74000, K = 75000, sigma = 0.2, T = 45 / 365;
    const expected = refN(refD2(F, K, sigma, T));
    expect(probAbove(K, F, sigma, T)).toBeCloseTo(expected, 10);
  });

  it('at-the-money probAbove is slightly under 50% (lognormal right skew)', () => {
    const F = 74000, sigma = 0.18, T = 30 / 365;
    const p = probAbove(F, F, sigma, T);
    expect(p).toBeLessThan(0.5);
    expect(p).toBeGreaterThan(0.4);
  });

  it('degenerate case (sigma<=0 or T<=0): deterministic outcome, no NaN', () => {
    expect(probAbove(74000, 75000, 0, 30 / 365)).toBe(1); // F > K
    expect(probAbove(75000, 74000, 0, 30 / 365)).toBe(0); // F < K
    expect(probAbove(74000, 75000, 0.18, 0)).toBe(1);
    expect(probBelow(74000, 75000, 0, 30 / 365)).toBe(0);
    expect(probBelow(75000, 74000, 0, 30 / 365)).toBe(1);
    expect(Number.isNaN(probAbove(74000, 75000, 0, 0))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 2. effectiveSigmaT
// ─────────────────────────────────────────────
describe('effectiveSigmaT', () => {
  it('falls back to sigma=0.18, T=30/365 for no legs', () => {
    const { sigma, T } = effectiveSigmaT([]);
    expect(sigma).toBeCloseTo(0.18, 10);
    expect(T).toBeCloseTo(30 / 365, 10);
  });

  it('averages IV and DTE across legs', () => {
    const legs = [
      baseLeg({ id: '1', iv: 20, daysToExpiry: 20 }),
      baseLeg({ id: '2', iv: 30, daysToExpiry: 40 }),
    ];
    const { sigma, T } = effectiveSigmaT(legs);
    expect(sigma).toBeCloseTo(0.25, 10); // (20+30)/2/100
    expect(T).toBeCloseTo(30 / 365, 10); // (20+40)/2 = 30
  });

  it('single leg: effective sigma/T trivially equals that leg', () => {
    const legs = [baseLeg({ iv: 22, daysToExpiry: 45 })];
    const { sigma, T } = effectiveSigmaT(legs);
    expect(sigma).toBeCloseTo(0.22, 10);
    expect(T).toBeCloseTo(45 / 365, 10);
  });
});

// ─────────────────────────────────────────────
// 3. calculateMetrics — known analytic answer (long ATM call)
// ─────────────────────────────────────────────
describe('Probability of Profit — Long ATM Call (analytic check)', () => {
  it('matches Φ(d2(breakeven)) computed independently', () => {
    const strike = 74000;
    const premium = 500;
    const iv = 18;
    const dte = 30;
    const F = 74000;

    const legs = [baseLeg({ strikePrice: strike, premium, iv, daysToExpiry: dte })];
    const { probabilityOfProfit, breakevenPoints } = metricsFor(legs, F);

    // Breakeven (grid-interpolated) should be close to the analytic strike + premium
    expect(breakevenPoints.length).toBe(1);
    expect(breakevenPoints[0]).toBeCloseTo(strike + premium, -1);

    const sigma = iv / 100;
    const T = dte / 365;

    // Probability-mass integration should match Φ(d2(breakeven)) for the *actual*
    // (grid-interpolated) breakeven calculateMetrics used — isolating the probability
    // math from the small breakeven-interpolation error checked above.
    const expected = refN(refD2(F, breakevenPoints[0], sigma, T)) * 100;
    expect(probabilityOfProfit).toBeCloseTo(expected, 5);

    // And it should also be close to the fully analytic answer (strike + premium exactly).
    const analyticExpected = refN(refD2(F, strike + premium, sigma, T)) * 100;
    expect(probabilityOfProfit).toBeCloseTo(analyticExpected, 0);
  });
});

// ─────────────────────────────────────────────
// 4. Sanity bounds — always between 0 and 100
// ─────────────────────────────────────────────
describe('Probability of Profit — sanity bounds [0, 100]', () => {
  const cases: Array<[string, OptionLeg[]]> = [
    ['single long call', [baseLeg({ positionType: 'BUY', optionType: 'CE' })]],
    ['single long put', [baseLeg({ positionType: 'BUY', optionType: 'PE' })]],
    ['single short call', [baseLeg({ positionType: 'SELL', optionType: 'CE' })]],
    ['single short put', [baseLeg({ positionType: 'SELL', optionType: 'PE' })]],
    ['long straddle', [
      baseLeg({ id: '1', positionType: 'BUY', optionType: 'CE', premium: 500 }),
      baseLeg({ id: '2', positionType: 'BUY', optionType: 'PE', premium: 500 }),
    ]],
    ['iron condor', [
      baseLeg({ id: '1', positionType: 'BUY',  optionType: 'PE', strikePrice: 72000, premium: 200 }),
      baseLeg({ id: '2', positionType: 'SELL', optionType: 'PE', strikePrice: 73000, premium: 400 }),
      baseLeg({ id: '3', positionType: 'SELL', optionType: 'CE', strikePrice: 75000, premium: 400 }),
      baseLeg({ id: '4', positionType: 'BUY',  optionType: 'CE', strikePrice: 76000, premium: 200 }),
    ]],
  ];

  cases.forEach(([name, legs]) => {
    it(`${name}: probabilityOfProfit is within [0, 100]`, () => {
      const { probabilityOfProfit } = metricsFor(legs);
      expect(probabilityOfProfit).toBeGreaterThanOrEqual(0);
      expect(probabilityOfProfit).toBeLessThanOrEqual(100);
      expect(Number.isNaN(probabilityOfProfit)).toBe(false);
    });
  });

  it('no legs: probabilityOfProfit is 0 (empty points)', () => {
    const { probabilityOfProfit } = metricsFor([]);
    expect(probabilityOfProfit).toBe(0);
  });
});

// ─────────────────────────────────────────────
// 5. Directional sanity — deep ITM vs deep OTM
// ─────────────────────────────────────────────
describe('Probability of Profit — directional sanity', () => {
  it('deep ITM long call (strike far below spot) → probability close to 100%', () => {
    const legs = [baseLeg({
      strikePrice: 60000, premium: 200, iv: 18, daysToExpiry: 30,
    })];
    const { probabilityOfProfit } = metricsFor(legs, 74000);
    expect(probabilityOfProfit).toBeGreaterThan(90);
  });

  it('deep OTM long call (strike far above spot) → probability close to 0%', () => {
    const legs = [baseLeg({
      strikePrice: 95000, premium: 50, iv: 18, daysToExpiry: 30,
    })];
    const { probabilityOfProfit } = metricsFor(legs, 74000);
    expect(probabilityOfProfit).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────
// 6. Degenerate case — zero DTE / near-zero IV shouldn't crash or NaN
// ─────────────────────────────────────────────
describe('Probability of Profit — degenerate inputs', () => {
  it('daysToExpiry: 0 does not crash or produce NaN', () => {
    const legs = [baseLeg({ strikePrice: 70000, premium: 500, daysToExpiry: 0, iv: 18 })];
    const { probabilityOfProfit } = metricsFor(legs, 74000);
    expect(Number.isNaN(probabilityOfProfit)).toBe(false);
    expect(probabilityOfProfit).toBeGreaterThanOrEqual(0);
    expect(probabilityOfProfit).toBeLessThanOrEqual(100);
  });

  it('near-zero iv does not crash or produce NaN', () => {
    const legs = [baseLeg({ strikePrice: 70000, premium: 500, daysToExpiry: 30, iv: 0.0001 })];
    const { probabilityOfProfit } = metricsFor(legs, 74000);
    expect(Number.isNaN(probabilityOfProfit)).toBe(false);
    expect(probabilityOfProfit).toBeGreaterThanOrEqual(0);
    expect(probabilityOfProfit).toBeLessThanOrEqual(100);
  });
});
