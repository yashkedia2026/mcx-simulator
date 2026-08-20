import jStat from 'jstat';
import type { OptionLeg } from '@/types';

/**
 * Effective sigma (decimal IV) and T (years) for a strategy, derived by averaging
 * each leg's IV and days-to-expiry. Shared by the payoff metrics' probability-of-profit
 * calculation and the payoff chart's sigma bands so both use the same effective distribution.
 */
export function effectiveSigmaT(legs: OptionLeg[]): { sigma: number; T: number } {
  if (legs.length === 0) {
    return { sigma: 0.18, T: 30 / 365 };
  }
  const avgIV = legs.reduce((s, l) => s + l.iv, 0) / legs.length / 100;
  const avgDTE = legs.reduce((s, l) => s + l.daysToExpiry, 0) / legs.length;
  return { sigma: avgIV, T: Math.max(avgDTE, 1) / 365 };
}

function d2(K: number, F: number, sigma: number, T: number): number {
  return (Math.log(F / K) - 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
}

/** P(F_T > K) under the Black-76 lognormal terminal distribution. */
export function probAbove(K: number, F: number, sigma: number, T: number): number {
  if (sigma <= 0 || T <= 0) {
    return F > K ? 1 : 0;
  }
  return jStat.normal.cdf(d2(K, F, sigma, T), 0, 1);
}

/** P(F_T <= K) under the Black-76 lognormal terminal distribution. */
export function probBelow(K: number, F: number, sigma: number, T: number): number {
  if (sigma <= 0 || T <= 0) {
    return F > K ? 0 : 1;
  }
  return 1 - jStat.normal.cdf(d2(K, F, sigma, T), 0, 1);
}
