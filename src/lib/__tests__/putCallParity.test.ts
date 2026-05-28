import { describe, it, expect } from 'vitest';
import { black76Price } from '../black76';

// ─────────────────────────────────────────────
// COMPREHENSIVE PUT-CALL PARITY MATRIX
// Tests parity across many combinations of F, K, T, sigma
// ─────────────────────────────────────────────
describe('Put-Call Parity — Full Matrix', () => {

  const r = 0.065;

  const testCases: [number, number, number, number, string][] = [
    // [F,     K,     T_days, sigma, description]
    [74000, 74000, 30,  0.18, 'Gold ATM 30 DTE'],
    [74000, 72000, 30,  0.18, 'Gold ITM Call 30 DTE'],
    [74000, 76000, 30,  0.18, 'Gold OTM Call 30 DTE'],
    [74000, 74000, 7,   0.18, 'Gold ATM 7 DTE'],
    [74000, 74000, 60,  0.18, 'Gold ATM 60 DTE'],
    [74000, 74000, 30,  0.10, 'Gold ATM Low IV'],
    [74000, 74000, 30,  0.40, 'Gold ATM High IV'],
    [5200,  5200,  30,  0.15, 'Crude Oil ATM'],
    [5200,  5000,  30,  0.15, 'Crude Oil ITM Call'],
    [25000, 25000, 30,  0.20, 'Silver ATM'],
  ];

  testCases.forEach(([F, K, T_days, sigma, desc]) => {
    it(`Parity holds: ${desc}`, () => {
      const T    = T_days / 365;
      const call = black76Price(F, K, T, r, sigma, 'CE');
      const put  = black76Price(F, K, T, r, sigma, 'PE');
      const expectedDiff = (F - K) * Math.exp(-r * T);
      expect(call - put).toBeCloseTo(expectedDiff, 0); // within ₹1
    });
  });

});
