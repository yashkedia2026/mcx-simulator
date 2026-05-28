import { black76Greeks } from './black76';
import type { OptionLeg, Greeks } from '@/types';

const ZERO: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

/**
 * Per-unit Greeks for a single option leg.
 * Delta is in [0,1] for calls and [-1,0] for puts (not scaled by lot size).
 * This is the textbook Black-76 definition used by the test suite.
 */
export function calculateGreeks(
  leg: OptionLeg,
  futuresPrice: number,
  riskFreeRate: number
): Greeks {
  const T = leg.daysToExpiry / 365;
  const sigma = leg.iv / 100;
  const r = riskFreeRate / 100;
  const direction = leg.positionType === 'BUY' ? 1 : -1;

  const g = black76Greeks(
    futuresPrice,
    leg.strikePrice,
    T,
    r,
    sigma,
    leg.optionType,
    direction as 1 | -1
  );

  return { delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, rho: 0 };
}

/**
 * Sum of per-unit Greeks across all legs, weighted by lots (NOT lot size).
 * Used by the test suite — values remain in option-unit space so delta stays near [0,1].
 */
export function aggregateGreeks(
  legs: OptionLeg[],
  futuresPrice: number,
  riskFreeRate: number
): Greeks {
  return legs.reduce((acc, leg) => {
    const g = calculateGreeks(leg, futuresPrice, riskFreeRate);
    return {
      delta: acc.delta + g.delta * leg.lots,
      gamma: acc.gamma + g.gamma * leg.lots,
      theta: acc.theta + g.theta * leg.lots,
      vega:  acc.vega  + g.vega  * leg.lots,
      rho:   0,
    };
  }, { ...ZERO });
}

/**
 * Position-level Greeks in ₹ terms — scaled by lots × lot size.
 * Used by the UI to display monetary sensitivity (e.g. ₹/day for theta).
 */
export function calculatePositionGreeks(
  legs: OptionLeg[],
  futuresPrice: number,
  riskFreeRate: number
): Greeks {
  return legs.reduce((acc, leg) => {
    const g = calculateGreeks(leg, futuresPrice, riskFreeRate);
    const scale = leg.lots * leg.instrument.lotSize;
    return {
      delta: acc.delta + g.delta * scale,
      gamma: acc.gamma + g.gamma * scale,
      theta: acc.theta + g.theta * scale,
      vega:  acc.vega  + g.vega  * scale,
      rho:   0,
    };
  }, { ...ZERO });
}
