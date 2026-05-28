import { describe, it, expect } from 'vitest';
import { calculateGreeks, aggregateGreeks } from '../greeks';
import type { OptionLeg } from '../../types';

// ─────────────────────────────────────────────
// HELPERS — build test legs quickly
// ─────────────────────────────────────────────
const goldInstrument = {
  symbol: 'GOLD',
  name: 'Gold',
  lotSize: 100,
  tickSize: 1,
  unit: 'grams',
  priceUnit: '₹/10g',
};

const makeLeg = (overrides: Partial<OptionLeg>): OptionLeg => ({
  id: 'test-1',
  instrument: goldInstrument,
  positionType: 'BUY',
  optionType: 'CE',
  strikePrice: 74000,
  premium: 500,
  lots: 1,
  iv: 18,
  daysToExpiry: 30,
  ...overrides,
});

const spotPrice    = 74000;
const riskFreeRate = 6.5;

// ─────────────────────────────────────────────
// 1. DELTA
// ─────────────────────────────────────────────
describe('Greeks — Delta', () => {

  it('ATM BUY Call Delta should be close to 0.5', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE', strikePrice: 74000 });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeCloseTo(0.5, 1);
  });

  it('ATM BUY Put Delta should be close to -0.5', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'PE', strikePrice: 74000 });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeCloseTo(-0.5, 1);
  });

  it('Deep ITM Call Delta should be close to +1', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE', strikePrice: 60000 });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeGreaterThan(0.9);
  });

  it('Deep OTM Call Delta should be close to 0', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE', strikePrice: 90000 });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeLessThan(0.1);
  });

  it('SELL Call Delta should be negative (opposite of BUY)', () => {
    const buyLeg  = makeLeg({ positionType: 'BUY',  optionType: 'CE' });
    const sellLeg = makeLeg({ positionType: 'SELL', optionType: 'CE' });
    const buyG    = calculateGreeks(buyLeg,  spotPrice, riskFreeRate);
    const sellG   = calculateGreeks(sellLeg, spotPrice, riskFreeRate);
    expect(sellG.delta).toBeCloseTo(-buyG.delta, 2);
  });

  it('Straddle (BUY CE + BUY PE ATM) Delta should be near 0', () => {
    const callLeg = makeLeg({ id: '1', positionType: 'BUY', optionType: 'CE' });
    const putLeg  = makeLeg({ id: '2', positionType: 'BUY', optionType: 'PE' });
    const greeks  = aggregateGreeks([callLeg, putLeg], spotPrice, riskFreeRate);
    expect(Math.abs(greeks.delta)).toBeLessThan(0.1); // Near delta-neutral
  });

  it('Call Delta is bounded between 0 and 1', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeGreaterThan(0);
    expect(greeks.delta).toBeLessThan(1);
  });

  it('Put Delta is bounded between -1 and 0', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'PE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.delta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThan(-1);
  });

});

// ─────────────────────────────────────────────
// 2. GAMMA
// ─────────────────────────────────────────────
describe('Greeks — Gamma', () => {

  it('ATM Call Gamma should be positive for BUY', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.gamma).toBeGreaterThan(0);
  });

  it('ATM Gamma should be highest compared to ITM and OTM', () => {
    const atm = calculateGreeks(makeLeg({ strikePrice: 74000 }), spotPrice, riskFreeRate);
    const itm = calculateGreeks(makeLeg({ strikePrice: 70000 }), spotPrice, riskFreeRate);
    const otm = calculateGreeks(makeLeg({ strikePrice: 78000 }), spotPrice, riskFreeRate);
    expect(atm.gamma).toBeGreaterThan(itm.gamma);
    expect(atm.gamma).toBeGreaterThan(otm.gamma);
  });

  it('SELL Call Gamma should be negative', () => {
    const leg    = makeLeg({ positionType: 'SELL', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.gamma).toBeLessThan(0);
  });

  it('Call and Put have same Gamma (for same strike)', () => {
    const callGreeks = calculateGreeks(makeLeg({ optionType: 'CE' }), spotPrice, riskFreeRate);
    const putGreeks  = calculateGreeks(makeLeg({ optionType: 'PE' }), spotPrice, riskFreeRate);
    expect(callGreeks.gamma).toBeCloseTo(putGreeks.gamma, 4);
  });

});

// ─────────────────────────────────────────────
// 3. THETA
// ─────────────────────────────────────────────
describe('Greeks — Theta (Time Decay)', () => {

  it('BUY Call Theta should be negative (time decay hurts buyers)', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.theta).toBeLessThan(0);
  });

  it('BUY Put Theta should be negative', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'PE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.theta).toBeLessThan(0);
  });

  it('SELL Call Theta should be positive (time decay helps sellers)', () => {
    const leg    = makeLeg({ positionType: 'SELL', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.theta).toBeGreaterThan(0);
  });

  it('Theta is larger (more negative) for ATM than deep OTM', () => {
    const atm = calculateGreeks(makeLeg({ strikePrice: 74000 }), spotPrice, riskFreeRate);
    const otm = calculateGreeks(makeLeg({ strikePrice: 90000 }), spotPrice, riskFreeRate);
    expect(Math.abs(atm.theta)).toBeGreaterThan(Math.abs(otm.theta));
  });

  it('Theta accelerates near expiry (7 DTE worse than 30 DTE)', () => {
    const far  = calculateGreeks(makeLeg({ daysToExpiry: 30 }), spotPrice, riskFreeRate);
    const near = calculateGreeks(makeLeg({ daysToExpiry: 7  }), spotPrice, riskFreeRate);
    // Near expiry theta (per day) should be worse than far expiry
    expect(Math.abs(near.theta)).toBeGreaterThan(Math.abs(far.theta));
  });

  it('Short Straddle Theta should be positive and significant', () => {
    const callLeg = makeLeg({ id: '1', positionType: 'SELL', optionType: 'CE' });
    const putLeg  = makeLeg({ id: '2', positionType: 'SELL', optionType: 'PE' });
    const greeks  = aggregateGreeks([callLeg, putLeg], spotPrice, riskFreeRate);
    expect(greeks.theta).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────
// 4. VEGA
// ─────────────────────────────────────────────
describe('Greeks — Vega (IV Sensitivity)', () => {

  it('BUY Call Vega should be positive (higher IV = higher premium)', () => {
    const leg    = makeLeg({ positionType: 'BUY', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.vega).toBeGreaterThan(0);
  });

  it('SELL Call Vega should be negative (higher IV = loss for sellers)', () => {
    const leg    = makeLeg({ positionType: 'SELL', optionType: 'CE' });
    const greeks = calculateGreeks(leg, spotPrice, riskFreeRate);
    expect(greeks.vega).toBeLessThan(0);
  });

  it('Call and Put have same Vega for same strike (by Black-Scholes)', () => {
    const callG = calculateGreeks(makeLeg({ optionType: 'CE' }), spotPrice, riskFreeRate);
    const putG  = calculateGreeks(makeLeg({ optionType: 'PE' }), spotPrice, riskFreeRate);
    expect(callG.vega).toBeCloseTo(putG.vega, 1);
  });

  it('ATM Vega is highest among ITM, ATM, OTM', () => {
    const atm = calculateGreeks(makeLeg({ strikePrice: 74000 }), spotPrice, riskFreeRate);
    const itm = calculateGreeks(makeLeg({ strikePrice: 68000 }), spotPrice, riskFreeRate);
    const otm = calculateGreeks(makeLeg({ strikePrice: 80000 }), spotPrice, riskFreeRate);
    expect(atm.vega).toBeGreaterThan(itm.vega);
    expect(atm.vega).toBeGreaterThan(otm.vega);
  });

  it('Short Straddle Vega should be negative (hurt by IV rise)', () => {
    const callLeg = makeLeg({ id: '1', positionType: 'SELL', optionType: 'CE' });
    const putLeg  = makeLeg({ id: '2', positionType: 'SELL', optionType: 'PE' });
    const greeks  = aggregateGreeks([callLeg, putLeg], spotPrice, riskFreeRate);
    expect(greeks.vega).toBeLessThan(0);
  });

});
