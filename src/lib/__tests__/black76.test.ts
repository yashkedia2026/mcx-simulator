import { describe, it, expect } from 'vitest';
import { black76Price, black76Greeks } from '../black76';

// ─────────────────────────────────────────────
// SHARED TEST INPUTS
// ─────────────────────────────────────────────
const F = 74000;       // Gold futures price
const K_ATM = 74000;   // ATM strike
const K_ITM = 72000;   // ITM call strike (2000 below)
const K_OTM = 76000;   // OTM call strike (2000 above)
const T_30  = 30 / 365;
const T_7   = 7  / 365;
const T_1   = 1  / 365;
const T_0   = 0;       // Expiry
const r     = 0.065;   // 6.5% risk-free rate
const sigma = 0.18;    // 18% IV

// ─────────────────────────────────────────────
// 1. BASIC PRICE SANITY
// ─────────────────────────────────────────────
describe('Black-76 — Basic Price Sanity', () => {

  it('ATM Call (30 DTE, 18% IV) should be between ₹800 and ₹1600', () => {
    const price = black76Price(F, K_ATM, T_30, r, sigma, 'CE');
    expect(price).toBeGreaterThan(800);
    expect(price).toBeLessThan(1600);
  });

  it('ATM Put (30 DTE, 18% IV) should be between ₹800 and ₹1600', () => {
    const price = black76Price(F, K_ATM, T_30, r, sigma, 'PE');
    expect(price).toBeGreaterThan(800);
    expect(price).toBeLessThan(1600);
  });

  it('ATM Call and ATM Put should be nearly equal (F=K case)', () => {
    const call = black76Price(F, K_ATM, T_30, r, sigma, 'CE');
    const put  = black76Price(F, K_ATM, T_30, r, sigma, 'PE');
    // When F=K, call ≈ put (small difference due to discounting)
    expect(Math.abs(call - put)).toBeLessThan(200);
  });

  it('ITM Call should be worth more than ATM Call', () => {
    const atm = black76Price(F, K_ATM, T_30, r, sigma, 'CE');
    const itm = black76Price(F, K_ITM, T_30, r, sigma, 'CE'); // lower strike = ITM call
    expect(itm).toBeGreaterThan(atm);
  });

  it('OTM Call should be worth less than ATM Call', () => {
    const atm = black76Price(F, K_ATM, T_30, r, sigma, 'CE');
    const otm = black76Price(F, K_OTM, T_30, r, sigma, 'CE'); // higher strike = OTM call
    expect(otm).toBeLessThan(atm);
  });

  it('All option prices must be non-negative', () => {
    const prices = [
      black76Price(F, K_ATM, T_30, r, sigma, 'CE'),
      black76Price(F, K_ATM, T_30, r, sigma, 'PE'),
      black76Price(F, K_OTM, T_30, r, sigma, 'CE'),
      black76Price(F, K_ITM, T_30, r, sigma, 'PE'),
    ];
    prices.forEach(p => expect(p).toBeGreaterThanOrEqual(0));
  });

});

// ─────────────────────────────────────────────
// 2. EXPIRY BEHAVIOUR (T = 0)
// ─────────────────────────────────────────────
describe('Black-76 — At Expiry (T=0)', () => {

  it('ITM Call at expiry = exact intrinsic value (F - K)', () => {
    // F=74000, K=72000 → intrinsic = 2000
    const price = black76Price(74000, 72000, T_0, r, sigma, 'CE');
    expect(price).toBe(2000);
  });

  it('OTM Call at expiry = 0 (worthless)', () => {
    const price = black76Price(74000, 76000, T_0, r, sigma, 'CE');
    expect(price).toBe(0);
  });

  it('ATM Call at expiry = 0 (no intrinsic for ATM)', () => {
    const price = black76Price(74000, 74000, T_0, r, sigma, 'CE');
    expect(price).toBe(0);
  });

  it('ITM Put at expiry = exact intrinsic value (K - F)', () => {
    // F=74000, K=76000 → intrinsic = 2000
    const price = black76Price(74000, 76000, T_0, r, sigma, 'PE');
    expect(price).toBe(2000);
  });

  it('OTM Put at expiry = 0 (worthless)', () => {
    const price = black76Price(74000, 72000, T_0, r, sigma, 'PE');
    expect(price).toBe(0);
  });

  it('ATM Put at expiry = 0', () => {
    const price = black76Price(74000, 74000, T_0, r, sigma, 'PE');
    expect(price).toBe(0);
  });

});

// ─────────────────────────────────────────────
// 3. PUT-CALL PARITY (MATHEMATICAL LAW)
// Must ALWAYS hold: C - P = (F - K) × e^(-rT)
// ─────────────────────────────────────────────
describe('Black-76 — Put-Call Parity', () => {

  const testParity = (F: number, K: number, T: number) => {
    const call    = black76Price(F, K, T, r, sigma, 'CE');
    const put     = black76Price(F, K, T, r, sigma, 'PE');
    const parity  = (F - K) * Math.exp(-r * T);
    return { diff: call - put, parity };
  };

  it('Put-Call Parity holds for ATM (F=K)', () => {
    const { diff, parity } = testParity(74000, 74000, T_30);
    expect(diff).toBeCloseTo(parity, 0); // within ₹1
  });

  it('Put-Call Parity holds for ITM Call (F > K)', () => {
    const { diff, parity } = testParity(74000, 72000, T_30);
    expect(diff).toBeCloseTo(parity, 0);
  });

  it('Put-Call Parity holds for OTM Call (F < K)', () => {
    const { diff, parity } = testParity(74000, 76000, T_30);
    expect(diff).toBeCloseTo(parity, 0);
  });

  it('Put-Call Parity holds for 7 DTE', () => {
    const { diff, parity } = testParity(74000, 74000, T_7);
    expect(diff).toBeCloseTo(parity, 0);
  });

  it('Put-Call Parity holds for 1 DTE', () => {
    const { diff, parity } = testParity(74000, 74000, T_1);
    expect(diff).toBeCloseTo(parity, 0);
  });

});

// ─────────────────────────────────────────────
// 4. TIME VALUE DECAY
// ─────────────────────────────────────────────
describe('Black-76 — Time Value (More DTE = Higher Premium)', () => {

  it('30 DTE premium > 7 DTE premium for ATM Call', () => {
    const p30 = black76Price(F, K_ATM, T_30, r, sigma, 'CE');
    const p7  = black76Price(F, K_ATM, T_7,  r, sigma, 'CE');
    expect(p30).toBeGreaterThan(p7);
  });

  it('7 DTE premium > 1 DTE premium for ATM Call', () => {
    const p7 = black76Price(F, K_ATM, T_7, r, sigma, 'CE');
    const p1 = black76Price(F, K_ATM, T_1, r, sigma, 'CE');
    expect(p7).toBeGreaterThan(p1);
  });

  it('Time value decays towards 0 as DTE approaches 0 (ATM)', () => {
    const price = black76Price(F, K_ATM, T_1, r, sigma, 'CE');
    // 1 DTE ATM option should have very small time value
    expect(price).toBeLessThan(300);
  });

  it('Time decay is faster near expiry (square-root-of-time rule)', () => {
    // A 30 DTE option should NOT be worth 4x a 7.5 DTE option (it's ~2x due to sqrt)
    const p30  = black76Price(F, K_ATM, T_30,       r, sigma, 'CE');
    const p7_5 = black76Price(F, K_ATM, 7.5 / 365,  r, sigma, 'CE');
    // Ratio should be close to sqrt(30/7.5) = 2
    const ratio = p30 / p7_5;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });

});

// ─────────────────────────────────────────────
// 5. VOLATILITY SENSITIVITY
// ─────────────────────────────────────────────
describe('Black-76 — Volatility Sensitivity', () => {

  it('Higher IV = higher Call premium', () => {
    const low  = black76Price(F, K_ATM, T_30, r, 0.10, 'CE');
    const high = black76Price(F, K_ATM, T_30, r, 0.30, 'CE');
    expect(high).toBeGreaterThan(low);
  });

  it('Higher IV = higher Put premium', () => {
    const low  = black76Price(F, K_ATM, T_30, r, 0.10, 'PE');
    const high = black76Price(F, K_ATM, T_30, r, 0.30, 'PE');
    expect(high).toBeGreaterThan(low);
  });

  it('IV=0 ATM option at expiry = 0 (no uncertainty)', () => {
    const price = black76Price(F, K_ATM, T_0, r, 0, 'CE');
    expect(price).toBe(0);
  });

  it('Very high IV makes deep OTM options expensive', () => {
    const lowIV  = black76Price(F, 80000, T_30, r, 0.10, 'CE');
    const highIV = black76Price(F, 80000, T_30, r, 0.80, 'CE');
    expect(highIV).toBeGreaterThan(lowIV * 3); // High IV makes a big difference on OTM
  });

});

// ─────────────────────────────────────────────
// 6. GREEKS — THETA SIGN REGRESSION GUARD
// theta = -[F·N'(d1)·σ·e^(-rT)] / (2√T) + r·V, where V is the option's own
// discounted price. The `+ r·V` term must be added, not subtracted — a flipped
// sign only shifts short-dated ATM theta by ~2% (invisible to loose direction
// checks) but flips the sign entirely for ITM options with real time value.
// ─────────────────────────────────────────────
describe('Black-76 — Greeks: Theta', () => {

  it('ATM Call theta (30 DTE, r=6.5%) matches the analytical Black-76 value', () => {
    const { theta } = black76Greeks(F, K_ATM, T_30, r, sigma, 'CE', 1);
    // Correct value ≈ -24.97/day. A sign-flipped r-term would give ≈ -25.51/day.
    expect(theta).toBeGreaterThan(-25.3);
    expect(theta).toBeLessThan(-24.6);
  });

  it('Deep ITM long-dated Call theta is POSITIVE — the r·V term outweighs time decay', () => {
    // F=74000, K=60000, 90 DTE, r=6.5%: correct theta ≈ +1.63/day. A sign-flipped
    // r-term would instead make this ≈ -3.28/day.
    const { theta } = black76Greeks(74000, 60000, 90 / 365, r, sigma, 'CE', 1);
    expect(theta).toBeGreaterThan(0);
  });

  it('Deep ITM long-dated Put theta is also POSITIVE, for the same reason', () => {
    const { theta } = black76Greeks(60000, 74000, 90 / 365, r, sigma, 'PE', 1);
    expect(theta).toBeGreaterThan(0);
  });

  it('SELL side of a deep ITM Call has the opposite (negative) theta', () => {
    const { theta } = black76Greeks(74000, 60000, 90 / 365, r, sigma, 'CE', -1);
    expect(theta).toBeLessThan(0);
  });

});
