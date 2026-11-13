import { describe, expect, it } from 'vitest';
import { black76Price } from '../black76';
import { calculateIV } from '../impliedVolatility';

describe('Black-76 implied volatility', () => {
  it.each([
    { F: 74000, K: 74000, T: 30 / 365, sigma: 0.18 },
    { F: 74000, K: 30000, T: 30 / 365, sigma: 0.8 },
    { F: 30000, K: 74000, T: 30 / 365, sigma: 0.8 },
    { F: 100, K: 150, T: 0.2, sigma: 4 },
    { F: 100, K: 100, T: 0.02, sigma: 10 },
    { F: 100, K: 100, T: 1 / 365, sigma: 0.01 },
  ])('roundtrips $F/$K at sigma=$sigma including flat initial vega', ({ F, K, T, sigma }) => {
    for (const type of ['CE', 'PE'] as const) {
      const premium = black76Price(F, K, T, 0.065, sigma, type);
      const result = calculateIV(premium, F, K, T, 0.065, type);
      expect(result).not.toBeNull();
      expect(result).toBeCloseTo(sigma, 5);
      expect(black76Price(F, K, T, 0.065, result!, type)).toBeCloseTo(premium, 6);
    }
  });

  it('returns zero at discounted intrinsic, including zero OTM premium', () => {
    const premium = black76Price(120, 100, 1, 0.065, 0, 'CE');
    expect(calculateIV(premium, 120, 100, 1, 0.065, 'CE')).toBe(0);
    expect(calculateIV(0, 80, 100, 1, 0.065, 'CE')).toBe(0);
  });

  it.each(['CE', 'PE'] as const)('rejects premiums outside finite no-arbitrage bounds for %s', type => {
    const F = 120;
    const K = 100;
    const lower = black76Price(F, K, 1, 0.065, 0, type);
    const upper = Math.exp(-0.065) * (type === 'CE' ? F : K);
    expect(calculateIV(lower - 0.01, F, K, 1, 0.065, type)).toBeNull();
    expect(calculateIV(upper, F, K, 1, 0.065, type)).toBeNull();
    expect(calculateIV(upper + 1, F, K, 1, 0.065, type)).toBeNull();
  });

  it('rejects invalid inputs and expiry, where no unique IV is observable', () => {
    expect(calculateIV(2, 100, 100, 0, 0.065, 'CE')).toBeNull();
    expect(calculateIV(2, 0, 100, 1, 0.065, 'CE')).toBeNull();
    expect(calculateIV(NaN, 100, 100, 1, 0.065, 'CE')).toBeNull();
    expect(calculateIV(2, 100, -100, 1, 0.065, 'CE')).toBeNull();
  });
});
