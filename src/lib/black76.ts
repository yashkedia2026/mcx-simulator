import jStat from 'jstat';
import type { OptionType } from '@/types';

function N(x: number): number {
  return jStat.normal.cdf(x, 0, 1);
}

function n(x: number): number {
  return jStat.normal.pdf(x, 0, 1);
}

export function black76Price(
  F: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: OptionType
): number {
  if (![F, K, T, r, sigma].every(Number.isFinite) || F < 0 || K < 0 || sigma < 0) {
    return NaN;
  }
  const intrinsic = optionType === 'CE' ? Math.max(F - K, 0) : Math.max(K - F, 0);
  if (T <= 0) {
    return intrinsic;
  }

  const discount = Math.exp(-r * T);
  if (sigma === 0 || F === 0 || K === 0) return discount * intrinsic;
  const totalVol = sigma * Math.sqrt(T);
  const d1 = Math.log(F / K) / totalVol + 0.5 * totalVol;
  const d2 = d1 - totalVol;

  if (optionType === 'CE') {
    return Math.max(0, discount * (F * N(d1) - K * N(d2)));
  } else {
    return Math.max(0, discount * (K * N(-d2) - F * N(-d1)));
  }
}

export interface Black76Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export function black76Greeks(
  F: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: OptionType,
  direction: 1 | -1
): Black76Greeks {
  if (![F, K, T, r, sigma].every(Number.isFinite) || F < 0 || K < 0 || sigma < 0) {
    return { delta: NaN, gamma: NaN, theta: NaN, vega: NaN };
  }
  if (T <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const discount = Math.exp(-r * T);
  const price = black76Price(F, K, T, r, sigma, optionType);
  if (sigma === 0 || F === 0 || K === 0) {
    const callDelta = F > K ? 1 : F < K ? 0 : 0.5;
    return {
      // At the zero-volatility strike, use the symmetric delta convention;
      // gamma has no finite value at this kink. Vega is a right derivative.
      delta: direction * discount * (optionType === 'CE' ? callDelta : callDelta - 1),
      gamma: F === K ? NaN : 0,
      theta: direction * r * price / 365,
      vega: F === K ? direction * discount * F * n(0) * Math.sqrt(T) / 100 : 0,
    };
  }

  const totalVol = sigma * Math.sqrt(T);
  const d1 = Math.log(F / K) / totalVol + 0.5 * totalVol;
  const Nd1 = N(d1);
  const nd1 = n(d1);

  const delta =
    direction *
    discount *
    (optionType === 'CE' ? Nd1 : Nd1 - 1);

  const gamma = direction * (discount * nd1) / (F * sigma * Math.sqrt(T));

  const theta =
    direction *
    (-(F * nd1 * sigma * discount) / (2 * Math.sqrt(T)) + r * price) /
    365;

  const vega = direction * F * discount * nd1 * Math.sqrt(T) / 100;

  return { delta, gamma, theta, vega };
}
