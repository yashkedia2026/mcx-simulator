import { describe, expect, it } from 'vitest';
import type { OptionLeg } from '@/types';
import { calculateMetrics, generatePayoffData } from '../payoff';

const instrument = { symbol: 'TEST', name: 'Test', lotSize: 1, tickSize: 1, unit: 'units', priceUnit: '₹' };
const leg = (overrides: Partial<OptionLeg> = {}): OptionLeg => ({
  id: 'leg', instrument, positionType: 'BUY', optionType: 'CE', strikePrice: 100,
  premium: 10, lots: 1, iv: 20, daysToExpiry: 365, ...overrides,
});
const context = { underlyingPrice: 100, riskFreeRate: 6.5 };

describe('Exact expiry metrics', () => {
  it('bounds puts at an underlying of zero', () => {
    const long = calculateMetrics([], [leg({ optionType: 'PE' })], context);
    expect(long.maxProfit).toBe(90);
    expect(long.maxLoss).toBe(-10);
    expect(long.breakevenPoints).toEqual([90]);
    const short = calculateMetrics([], [leg({ optionType: 'PE', positionType: 'SELL' })], context);
    expect(short.maxProfit).toBe(10);
    expect(short.maxLoss).toBe(-90);
  });

  it('recognizes a naked call outside the chart, even at small monetary scale', () => {
    const legs = [leg({ strikePrice: 150, premium: 1 })];
    const points = generatePayoffData({ ...context, legs });
    const metrics = calculateMetrics(points, legs, context);
    expect(metrics.maxProfit).toBe('Unlimited');
    expect(metrics.maxLoss).toBe(-1);
    expect(metrics.breakevenPoints).toEqual([151]);
  });

  it('recognizes protection outside the chart range', () => {
    const legs = [leg({ premium: 30 }), leg({ strikePrice: 200, premium: 5, positionType: 'SELL' })];
    const metrics = calculateMetrics(generatePayoffData({ ...context, legs }), legs, context);
    expect(metrics.maxProfit).toBe(75);
    expect(metrics.maxLoss).toBe(-25);
    expect(metrics.breakevenPoints).toEqual([125]);
  });

  it('captures a narrow butterfly peak and both roots between chart samples', () => {
    const legs = [
      leg({ strikePrice: 100.01, premium: 0.01 }),
      leg({ strikePrice: 100.02, premium: 0, positionType: 'SELL', lots: 2 }),
      leg({ strikePrice: 100.03, premium: 0 }),
    ];
    // Use half the wing width as debit, leaving a positive peak.
    legs[0].premium = 0.005;
    const metrics = calculateMetrics(generatePayoffData({ ...context, legs }), legs, context);
    expect(metrics.maxProfit).toBeCloseTo(0.005, 10);
    expect(metrics.maxLoss).toBeCloseTo(-0.005, 10);
    expect(metrics.breakevenPoints[0]).toBeCloseTo(100.015, 10);
    expect(metrics.breakevenPoints[1]).toBeCloseTo(100.025, 10);
    expect(metrics.breakevenPoints).toHaveLength(2);
  });

  it('uses net call quantity for the right tail', () => {
    const metrics = calculateMetrics([], [leg(), leg({ lots: 2, strikePrice: 120, positionType: 'SELL' })], context);
    expect(metrics.maxLoss).toBe('Unlimited');
    expect(metrics.maxProfit).toBe(30);
    expect(metrics.breakevenPoints).toEqual([150]);
  });

  it('returns stable roots at strike kinks and no distinguished roots for an offset portfolio', () => {
    expect(calculateMetrics([], [leg({ premium: 0 })], context).breakevenPoints).toEqual([0, 100]);
    const flat = calculateMetrics([], [leg(), leg({ positionType: 'SELL' })], context);
    expect(flat.maxProfit).toBe(0);
    expect(flat.maxLoss).toBe(0);
    expect(flat.breakevenPoints).toEqual([]);
    expect(flat.probabilityOfProfit).toBe(0);
  });

  it('is independent of plotted range and samples', () => {
    const legs = [leg({ strikePrice: 115, optionType: 'PE' })];
    const a = generatePayoffData({ ...context, legs });
    const b = generatePayoffData({ ...context, underlyingPrice: 200, legs });
    expect(calculateMetrics(a, legs, context)).toEqual(calculateMetrics(b, legs, context));
  });
});

describe('Model-based probability of profit', () => {
  it('matches analytical lognormal probabilities across a break-even at the forward', () => {
    // For F=100, sigma=.2, T=1, P(F_T>100)=P(Z>.1).
    const call = calculateMetrics([], [leg({ strikePrice: 90 })], context);
    const put = calculateMetrics([], [leg({ optionType: 'PE', strikePrice: 110 })], context);
    expect(call.probabilityOfProfit).toBeCloseTo(46.01721627, 6);
    expect(put.probabilityOfProfit).toBeCloseTo(53.98278373, 6);
  });

  it('changes with IV and time while preserving expiry extrema', () => {
    const low = calculateMetrics([], [leg({ iv: 10 })], context);
    const high = calculateMetrics([], [leg({ iv: 50 })], context);
    const short = calculateMetrics([], [leg({ iv: 50, daysToExpiry: 1 })], context);
    expect(low.probabilityOfProfit).not.toBeCloseTo(high.probabilityOfProfit, 2);
    expect(short.probabilityOfProfit).not.toBeCloseTo(high.probabilityOfProfit, 2);
    expect(high.maxLoss).toBe(low.maxLoss);
    expect(high.breakevenPoints).toEqual(low.breakevenPoints);
  });

  it('uses zero futures drift, independent of the discount rate', () => {
    const a = calculateMetrics([], [leg()], context);
    const b = calculateMetrics([], [leg()], { ...context, riskFreeRate: 15 });
    expect(a.probabilityOfProfit).toBe(b.probabilityOfProfit);
  });

  it('handles expiry and zero volatility as deterministic, with strictly positive profit', () => {
    expect(calculateMetrics([], [leg({ daysToExpiry: 0 })], context).probabilityOfProfit).toBe(0);
    expect(calculateMetrics([], [leg({ strikePrice: 80, iv: 0 })], context).probabilityOfProfit).toBe(100);
    expect(calculateMetrics([], [leg({ strikePrice: 90, iv: 0 })], context).probabilityOfProfit).toBe(0);
  });

  it('declines estimates without context, or for mixed instruments and expiries', () => {
    expect(calculateMetrics([], [leg()]).probabilityOfProfit).toBeNaN();
    expect(calculateMetrics([], [leg(), leg({ daysToExpiry: 30 })], context).probabilityOfProfit).toBeNaN();
    expect(calculateMetrics([], [leg(), leg({ instrument: { ...instrument, symbol: 'OTHER' } })], context).probabilityOfProfit).toBeNaN();
  });

  it('declines different futures contracts under the same commodity symbol', () => {
    const contract = { instrumentId: 1, underlyingInstrumentId: 2, expiry: '2027-01-01', symbol: 'TEST', name: 'Test' };
    const legs = [leg({ marketContract: contract }), leg({ marketContract: { ...contract, underlyingInstrumentId: 3 } })];
    expect(calculateMetrics([], legs, context).probabilityOfProfit).toBeNaN();
  });
});
