import { black76Price } from './black76';
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

export function calculateMetrics(points: PayoffPoint[], legs: OptionLeg[]): StrategyMetrics {
  if (points.length === 0) {
    return { maxProfit: 0, maxLoss: 0, breakevenPoints: [], netPremium: 0, probabilityOfProfit: 0 };
  }

  const expiryValues = points.map((p) => p.expiryPnL);
  const rawMax = Math.max(...expiryValues);
  const rawMin = Math.min(...expiryValues);

  // Detect unlimited payoff by checking boundary slopes (5-step window).
  // A strategy with bought protection (spreads, condors) will have ~0 slope at boundaries;
  // naked or net-long legs will still be trending at the ±20% edge of the range.
  const n = expiryValues.length;
  const WINDOW = Math.min(5, Math.floor(n / 10));
  const leftSlope = expiryValues[WINDOW] - expiryValues[0];
  const rightSlope = expiryValues[n - 1] - expiryValues[n - 1 - WINDOW];
  const payoffRange = rawMax - rawMin || 1;
  const THRESHOLD = Math.max(payoffRange * 0.02, 100);

  const maxProfit: number | 'Unlimited' =
    rightSlope > THRESHOLD || leftSlope < -THRESHOLD ? 'Unlimited' : rawMax;
  const maxLoss: number | 'Unlimited' =
    leftSlope > THRESHOLD || rightSlope < -THRESHOLD ? 'Unlimited' : rawMin;

  const breakevenPoints: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].expiryPnL;
    const curr = points[i].expiryPnL;
    if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
      const fraction = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
      breakevenPoints.push(points[i - 1].price + fraction * (points[i].price - points[i - 1].price));
    }
  }

  const netPremium = legs.reduce((sum, leg) => {
    const sign = leg.positionType === 'SELL' ? 1 : -1;
    return sum + sign * leg.premium * leg.lots * leg.instrument.lotSize;
  }, 0);

  const profitPoints = expiryValues.filter((v) => v > 0).length;
  const probabilityOfProfit = (profitPoints / expiryValues.length) * 100;

  return { maxProfit, maxLoss, breakevenPoints, netPremium, probabilityOfProfit };
}
