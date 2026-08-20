import { DEFAULT_INSTRUMENT, getStrikeGap, roundToStrike } from '@/data/instruments';
import { black76Price } from '@/lib/black76';
import type { OptionLeg, Instrument } from '@/types';

let legCounter = 0;
export function newId() {
  return `leg-${++legCounter}`;
}

export function makeDefaultLeg(): OptionLeg {
  const atm = roundToStrike(74000, getStrikeGap(DEFAULT_INSTRUMENT, 74000));
  return {
    id: newId(),
    instrument: DEFAULT_INSTRUMENT,
    positionType: 'BUY',
    optionType: 'CE',
    strikePrice: atm,
    premium: 500,
    iv: 18,
    daysToExpiry: 30,
    lots: 1,
  };
}

// "Add Leg" should extend the user's existing strategy, not reset to a
// hardcoded Gold default — clone the last leg so instrument/side carry over.
export function cloneLegForAdd(legs: OptionLeg[]): OptionLeg {
  return legs.length > 0 ? { ...legs[legs.length - 1], id: newId() } : makeDefaultLeg();
}

// Round a price to the nearest tick, avoiding floating-point artifacts
// (e.g. 12.299999999999999) by fixing to the tick's own decimal precision.
function roundToTick(value: number, tickSize: number): number {
  if (tickSize <= 0) return value;
  const decimals = (tickSize.toString().split('.')[1] ?? '').length;
  const rounded = Math.round(value / tickSize) * tickSize;
  return parseFloat(rounded.toFixed(decimals));
}

// Switching an instrument mid-leg leaves the strike/premium priced for the
// old underlying (e.g. a Gold strike of 74000 is meaningless for Crude Oil,
// which trades around 6500). Recompute a fresh ATM strike and a matching
// theoretical premium for the new instrument, using the same approach
// StrategyBuilder's applyStrategy() uses when building legs from scratch —
// but preserve this leg's existing IV/DTE/side/type instead of resetting them.
export function recomputeLegForInstrument(
  leg: OptionLeg,
  newInstrument: Instrument,
  futuresPrice: number,
  riskFreeRate: number
): OptionLeg {
  const strikeGap = getStrikeGap(newInstrument, futuresPrice);
  const strikePrice = roundToStrike(futuresPrice, strikeGap);
  const T = leg.daysToExpiry / 365;
  const r = riskFreeRate / 100;
  const sigma = leg.iv / 100;
  const rawPremium = black76Price(futuresPrice, strikePrice, T, r, sigma, leg.optionType);
  const premium = roundToTick(rawPremium, newInstrument.tickSize);
  return { ...leg, instrument: newInstrument, strikePrice, premium };
}
