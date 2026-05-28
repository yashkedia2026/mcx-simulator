import { black76Price } from './black76';
import type { OptionType } from '@/types';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Reverse-calculate implied volatility from a market premium using Newton-Raphson.
 * Returns IV as a decimal (e.g. 0.18 for 18%) or null if no solution is found.
 */
export function calculateIV(
  marketPremium: number,
  F: number,
  K: number,
  T: number,
  r: number,
  optionType: OptionType
): number | null {
  if (T <= 0 || marketPremium <= 0) return null;

  // Premium can't be below discounted intrinsic
  const intrinsic = optionType === 'CE' ? Math.max(F - K, 0) : Math.max(K - F, 0);
  if (marketPremium < intrinsic * Math.exp(-r * T) - 0.01) return null;

  let sigma = 0.20; // initial guess: 20%
  const MAX_ITER = 100;
  const TOL = 0.01; // ₹0.01 convergence

  for (let i = 0; i < MAX_ITER; i++) {
    const price = black76Price(F, K, T, r, sigma, optionType);
    const diff = price - marketPremium;

    if (Math.abs(diff) < TOL) return clamp(sigma, 0.001, 5.0);

    // Numerical vega: dPrice/dSigma
    const dS = 0.0001;
    const vega = (black76Price(F, K, T, r, sigma + dS, optionType) - price) / dS;
    if (Math.abs(vega) < 1e-10) break;

    sigma = clamp(sigma - diff / vega, 0.0001, 5.0);
  }

  // Accept if close enough after max iterations
  if (Math.abs(black76Price(F, K, T, r, sigma, optionType) - marketPremium) < 1.0) {
    return clamp(sigma, 0.001, 5.0);
  }
  return null;
}
