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
  if (T <= 0) {
    return optionType === 'CE' ? Math.max(F - K, 0) : Math.max(K - F, 0);
  }

  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const discount = Math.exp(-r * T);

  if (optionType === 'CE') {
    return discount * (F * N(d1) - K * N(d2));
  } else {
    return discount * (K * N(-d2) - F * N(-d1));
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
  if (T <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const discount = Math.exp(-r * T);
  const Nd1 = N(d1);
  const nd1 = n(d1);

  const delta =
    direction *
    discount *
    (optionType === 'CE' ? Nd1 : Nd1 - 1);

  const gamma = direction * (discount * nd1) / (F * sigma * Math.sqrt(T));

  const theta =
    direction *
    (-(F * nd1 * sigma * discount) / (2 * Math.sqrt(T)) -
      r * discount * (optionType === 'CE'
        ? F * N(d1) - K * N(d2)
        : K * N(-d2) - F * N(-d1))) /
    365;

  const vega = direction * F * discount * nd1 * Math.sqrt(T) / 100;

  return { delta, gamma, theta, vega };
}
