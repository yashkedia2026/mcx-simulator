import { black76Price } from './black76';
import jStat from 'jstat';
import type { OptionLeg, StrategyInputs, PayoffPoint, StrategyMetrics } from '@/types';

function legPnL(leg: OptionLeg, price: number, atExpiry: boolean, riskFreeRate: number): number {
  const T = atExpiry ? 0 : leg.daysToExpiry / 365;
  const sigma = leg.iv / 100;
  const r = riskFreeRate / 100;

  const theoreticalPremium = black76Price(price, leg.strikePrice, T, r, sigma, leg.optionType);

  const pnlPerUnit =
    leg.positionType === 'BUY'
      ? theoreticalPremium - leg.premium
      : leg.premium - theoreticalPremium;

  return pnlPerUnit * leg.lots * leg.instrument.lotSize;
}

export function generatePayoffData(inputs: StrategyInputs): PayoffPoint[] {
  const { underlyingPrice, riskFreeRate, legs } = inputs;
  if (legs.length === 0) return [];

  const range = underlyingPrice * 0.2;
  const steps = 200;
  const minPrice = underlyingPrice - range;
  const maxPrice = underlyingPrice + range;
  const stepSize = (maxPrice - minPrice) / steps;

  const points: PayoffPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const price = minPrice + i * stepSize;
    const expiryPnL = legs.reduce((sum, leg) => sum + legPnL(leg, price, true, riskFreeRate), 0);
    const currentPnL = legs.reduce((sum, leg) => sum + legPnL(leg, price, false, riskFreeRate), 0);
    points.push({ price, expiryPnL, currentPnL });
  }

  return points;
}

/** Calculate expiry + current P&L for a single price point — for the P&L table. */
export function calculatePnLAtPrice(
  price: number,
  legs: OptionLeg[],
  riskFreeRate: number
): { expiryPnL: number; currentPnL: number } {
  return {
    expiryPnL:  legs.reduce((s, l) => s + legPnL(l, price, true,  riskFreeRate), 0),
    currentPnL: legs.reduce((s, l) => s + legPnL(l, price, false, riskFreeRate), 0),
  };
}

export interface MetricsContext {
  underlyingPrice: number;
  riskFreeRate: number;
}

/**
 * Expiry P&L is piecewise linear for nonnegative underlying prices. Its extrema
 * occur at zero, a strike, or the right tail; chart range/sampling cannot define
 * risk limits. Breakevens include isolated roots and finite endpoints of any
 * zero-P&L interval (an everywhere-zero portfolio has no distinguished root).
 */
export function calculateMetrics(
  points: PayoffPoint[],
  legs: OptionLeg[],
  context?: MetricsContext,
): StrategyMetrics {
  // Keep the existing call signature, but never infer risk from chart samples.
  void points;
  if (legs.length === 0) {
    return { maxProfit: 0, maxLoss: 0, breakevenPoints: [], netPremium: 0, probabilityOfProfit: 0 };
  }

  const valid = legs.every(leg =>
    [leg.strikePrice, leg.premium, leg.lots, leg.instrument.lotSize, leg.iv, leg.daysToExpiry].every(Number.isFinite)
    && leg.strikePrice >= 0 && leg.premium >= 0 && leg.lots > 0
    && leg.instrument.lotSize > 0 && leg.iv >= 0 && leg.daysToExpiry >= 0);
  if (!valid) {
    return { maxProfit: NaN, maxLoss: NaN, breakevenPoints: [], netPremium: NaN, probabilityOfProfit: NaN };
  }

  const netPremium = legs.reduce((sum, leg) => {
    const sign = leg.positionType === 'SELL' ? 1 : -1;
    return sum + sign * leg.premium * leg.lots * leg.instrument.lotSize;
  }, 0);

  const payoffAt = (price: number) => legs.reduce((sum, leg) => sum + legPnL(leg, price, true, 0), 0);
  const knots = [...new Set([0, ...legs.map(leg => leg.strikePrice)])].sort((a, b) => a - b);
  const values = knots.map(payoffAt);
  const totalQuantity = legs.reduce((sum, leg) => sum + leg.lots * leg.instrument.lotSize, 0);
  const rawTailSlope = legs.reduce((sum, leg) => sum + (leg.optionType === 'CE'
    ? (leg.positionType === 'BUY' ? 1 : -1) * leg.lots * leg.instrument.lotSize : 0), 0);
  const tailSlope = Math.abs(rawTailSlope) <= Number.EPSILON * totalQuantity * 8 ? 0 : rawTailSlope;
  const maxProfit = tailSlope > 0 ? 'Unlimited' : Math.max(...values);
  const maxLoss = tailSlope < 0 ? 'Unlimited' : Math.min(...values);

  const pnlScale = Math.max(1, Math.abs(netPremium), ...values.map(Math.abs));
  const tolerance = Number.EPSILON * pnlScale * 32;
  const isZero = (value: number) => Math.abs(value) <= tolerance;
  const roots: number[] = [];
  for (let i = 0; i < knots.length; i++) {
    const value = values[i];
    if (isZero(value)) {
      const zeroToLeft = i > 0 && isZero(values[i - 1]);
      const zeroToRight = i < knots.length - 1 ? isZero(values[i + 1]) : tailSlope === 0;
      if (!(zeroToLeft && zeroToRight)) roots.push(knots[i]);
    }
    if (i > 0 && !isZero(values[i - 1]) && !isZero(value) && values[i - 1] * value < 0) {
      roots.push(knots[i - 1] - values[i - 1] * (knots[i] - knots[i - 1]) / (value - values[i - 1]));
    }
  }
  const lastKnot = knots[knots.length - 1];
  const lastValue = values[values.length - 1];
  if (tailSlope !== 0 && !isZero(lastValue)) {
    const root = lastKnot - lastValue / tailSlope;
    if (root > lastKnot) roots.push(root);
  }
  const flatZero = tailSlope === 0 && values.every(isZero);
  const breakevenPoints = flatZero ? [] : [...new Set(roots)].sort((a, b) => a - b);

  const probabilityOfProfit = estimateProbabilityOfProfit(
    legs, context, knots, breakevenPoints, payoffAt, tolerance,
  );

  return { maxProfit, maxLoss, breakevenPoints, netPremium, probabilityOfProfit };
}

/**
 * Approximate risk-neutral probability under the Black-76 futures model:
 * F_T = F_0 exp(-sigma² T / 2 + sigma sqrt(T) Z). The futures drift is zero,
 * so the risk-free rate does not enter this probability. A single distribution
 * uses quantity-weighted mean variance across leg IVs (a smile approximation).
 * Mixed instruments/expiries, or missing market context, are not estimable here.
 */
function estimateProbabilityOfProfit(
  legs: OptionLeg[],
  context: MetricsContext | undefined,
  knots: number[],
  roots: number[],
  payoffAt: (price: number) => number,
  tolerance: number,
): number {
  if (!context || !Number.isFinite(context.underlyingPrice) || context.underlyingPrice <= 0
    || !Number.isFinite(context.riskFreeRate)) return NaN;
  const first = legs[0];
  if (legs.some(leg => leg.instrument.symbol !== first.instrument.symbol
    || leg.daysToExpiry !== first.daysToExpiry)) return NaN;
  const underlyingContracts = new Set(legs.flatMap(leg =>
    leg.marketContract ? [leg.marketContract.underlyingInstrumentId] : []));
  const contractExpiries = new Set(legs.flatMap(leg =>
    leg.marketContract ? [leg.marketContract.expiry] : []));
  if (underlyingContracts.size > 1 || contractExpiries.size > 1) return NaN;

  const totalQuantity = legs.reduce((sum, leg) => sum + leg.lots * leg.instrument.lotSize, 0);
  const variance = legs.reduce((sum, leg) => sum
    + (leg.iv / 100) ** 2 * leg.lots * leg.instrument.lotSize, 0) / totalQuantity;
  const totalVariance = variance * first.daysToExpiry / 365;
  if (totalVariance === 0) return payoffAt(context.underlyingPrice) > tolerance ? 100 : 0;
  const totalVol = Math.sqrt(totalVariance);
  const cdf = (price: number) => {
    if (price <= 0) return 0;
    if (price === Infinity) return 1;
    return jStat.normal.cdf((Math.log(price / context.underlyingPrice) + 0.5 * totalVariance) / totalVol, 0, 1);
  };

  const boundaries = [...new Set([...knots, ...roots])].sort((a, b) => a - b);
  boundaries.push(Infinity);
  let probability = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const lower = boundaries[i - 1];
    const upper = boundaries[i];
    const sample = upper === Infinity ? lower + Math.max(lower, 1) : lower + (upper - lower) / 2;
    if (payoffAt(sample) > tolerance) probability += cdf(upper) - cdf(lower);
  }
  return Math.max(0, Math.min(100, probability * 100));
}
