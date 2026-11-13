import { describe, expect, it } from 'vitest';
import { black76Greeks, black76Price } from '../black76';

describe('Black-76 derivative consistency', () => {
  it.each([
    { F: 74000, K: 74000, T: 30 / 365, r: 0.065, sigma: 0.18 },
    { F: 74000, K: 60000, T: 0.5, r: 0.065, sigma: 0.3 },
    { F: 74000, K: 90000, T: 0.25, r: -0.01, sigma: 0.8 },
  ])('theta matches calendar-time price differentiation for $F/$K', ({ F, K, T, r, sigma }) => {
    const h = 1e-6;
    for (const type of ['CE', 'PE'] as const) {
      const expected = (black76Price(F, K, T - h, r, sigma, type)
        - black76Price(F, K, T + h, r, sigma, type)) / (2 * h * 365);
      const long = black76Greeks(F, K, T, r, sigma, type, 1);
      const short = black76Greeks(F, K, T, r, sigma, type, -1);
      expect(long.theta).toBeCloseTo(expected, 5);
      expect(short.theta).toBeCloseTo(-expected, 5);
    }
  });

  it('a deeply ITM futures option can have positive theta from discount accretion', () => {
    expect(black76Greeks(74000, 20000, 1, 0.065, 0.02, 'CE', 1).theta).toBeGreaterThan(0);
  });
});

describe('Black-76 deterministic limits', () => {
  it.each(['CE', 'PE'] as const)('zero volatility discounts intrinsic for %s', type => {
    for (const F of [80, 100, 120]) {
      const intrinsic = type === 'CE' ? Math.max(F - 100, 0) : Math.max(100 - F, 0);
      expect(black76Price(F, 100, 0.5, 0.065, 0, type)).toBeCloseTo(intrinsic * Math.exp(-0.065 * 0.5), 10);
    }
  });

  it('zero-volatility Greeks are finite away from the strike', () => {
    const discount = Math.exp(-0.065 * 0.5);
    const call = black76Greeks(120, 100, 0.5, 0.065, 0, 'CE', 1);
    expect(call).toEqual({
      delta: discount,
      gamma: 0,
      theta: 0.065 * 20 * discount / 365,
      vega: 0,
    });
    const put = black76Greeks(80, 100, 0.5, 0.065, 0, 'PE', -1);
    expect(put.delta).toBe(discount);
    expect(put.theta).toBeCloseTo(-call.theta, 10);
  });

  it('identifies the zero-volatility ATM gamma singularity', () => {
    const greeks = black76Greeks(100, 100, 1, 0.065, 0, 'CE', 1);
    expect(greeks.gamma).toBeNaN();
    expect(greeks.delta).toBeCloseTo(0.5 * Math.exp(-0.065), 10);
    expect(Number.isFinite(greeks.vega)).toBe(true);
  });

  it('supports zero underlying and strike without taking an invalid logarithm', () => {
    expect(black76Price(0, 100, 1, 0.065, 0.2, 'PE')).toBeCloseTo(100 * Math.exp(-0.065), 10);
    expect(black76Price(100, 0, 1, 0.065, 0.2, 'CE')).toBeCloseTo(100 * Math.exp(-0.065), 10);
  });
});
