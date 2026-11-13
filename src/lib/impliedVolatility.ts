import { black76Price } from './black76';
import type { OptionType } from '@/types';

/**
 * Invert Black-76 by bracketing and bisecting total volatility (sigma * sqrt(T)).
 * Returns decimal IV, zero at discounted intrinsic, or null outside the finite
 * model bounds. Unlike Newton iteration, this also handles a flat initial vega.
 */
export function calculateIV(
  marketPremium: number,
  F: number,
  K: number,
  T: number,
  r: number,
  optionType: OptionType
): number | null {
  if (![marketPremium, F, K, T, r].every(Number.isFinite)
    || T <= 0 || F <= 0 || K <= 0 || marketPremium < 0) return null;

  const discount = Math.exp(-r * T);
  const lowerPrice = black76Price(F, K, T, r, 0, optionType);
  const upperPrice = discount * (optionType === 'CE' ? F : K);
  if (!Number.isFinite(upperPrice) || upperPrice <= 0) return null;
  const priceTolerance = Math.max(1e-10, upperPrice * 1e-12);
  if (marketPremium < lowerPrice - priceTolerance || marketPremium >= upperPrice) return null;
  // An option indistinguishable from intrinsic at floating-point precision
  // cannot identify a positive IV reliably.
  if (marketPremium <= lowerPrice + priceTolerance) return 0;

  const sqrtT = Math.sqrt(T);
  let low = 0;
  let high = 1;
  const priceAt = (totalVol: number) => black76Price(F, K, T, r, totalVol / sqrtT, optionType);
  while (priceAt(high) < marketPremium && high < 64) high *= 2;
  if (priceAt(high) < marketPremium) return null;

  for (let i = 0; i < 100; i++) {
    const totalVol = (low + high) / 2;
    const price = priceAt(totalVol);
    const diff = price - marketPremium;
    if (Math.abs(diff) <= priceTolerance) return totalVol / sqrtT;
    if (diff > 0) high = totalVol;
    else low = totalVol;
  }
  return null;
}
