import { describe, it, expect } from 'vitest';
import { cloneLegForAdd, recomputeLegForInstrument } from '../legs';
import { MCX_INSTRUMENTS, DEFAULT_INSTRUMENT, getStrikeGap, roundToStrike } from '@/data/instruments';
import { black76Price } from '@/lib/black76';
import type { OptionLeg } from '@/types';

describe('cloneLegForAdd', () => {
  it('clones the last leg, copying every field except id', () => {
    const natGasMini = MCX_INSTRUMENTS.find((i) => i.symbol === 'NATGASMINI')!;
    const legs: OptionLeg[] = [
      {
        id: 'source-leg',
        instrument: natGasMini,
        positionType: 'SELL',
        optionType: 'PE',
        strikePrice: 250,
        premium: 12.5,
        iv: 22,
        daysToExpiry: 14,
        lots: 3,
      },
    ];

    const cloned = cloneLegForAdd(legs);

    expect(cloned).toMatchObject({
      instrument: natGasMini,
      positionType: 'SELL',
      optionType: 'PE',
      strikePrice: 250,
      premium: 12.5,
      iv: 22,
      daysToExpiry: 14,
      lots: 3,
    });
    expect(cloned.id).not.toBe(legs[0].id);
  });

  it('clones the last leg when multiple legs exist', () => {
    const legs: OptionLeg[] = [
      {
        id: 'first-leg', instrument: DEFAULT_INSTRUMENT, positionType: 'BUY', optionType: 'CE',
        strikePrice: 74000, premium: 500, iv: 18, daysToExpiry: 30, lots: 1,
      },
      {
        id: 'second-leg', instrument: DEFAULT_INSTRUMENT, positionType: 'SELL', optionType: 'PE',
        strikePrice: 73000, premium: 400, iv: 20, daysToExpiry: 25, lots: 2,
      },
    ];

    const cloned = cloneLegForAdd(legs);

    expect(cloned).toMatchObject({
      positionType: 'SELL',
      optionType: 'PE',
      strikePrice: 73000,
      premium: 400,
      iv: 20,
      daysToExpiry: 25,
      lots: 2,
    });
    expect(cloned.id).not.toBe('second-leg');
  });

  it('falls back to the Gold ATM default when there are no legs', () => {
    const cloned = cloneLegForAdd([]);

    expect(cloned.instrument).toBe(DEFAULT_INSTRUMENT);
    expect(cloned.positionType).toBe('BUY');
    expect(cloned.optionType).toBe('CE');
    expect(cloned.premium).toBe(500);
    expect(cloned.iv).toBe(18);
    expect(cloned.daysToExpiry).toBe(30);
    expect(cloned.lots).toBe(1);
  });
});

describe('recomputeLegForInstrument', () => {
  it('recomputes strike near the new instrument ATM and rounds premium to its tick size, preserving side/type/iv/dte/lots', () => {
    const crudeOil = MCX_INSTRUMENTS.find((i) => i.symbol === 'CRUDEOIL')!;
    const leg: OptionLeg = {
      id: 'leg-1',
      instrument: DEFAULT_INSTRUMENT, // Gold
      positionType: 'BUY',
      optionType: 'CE',
      strikePrice: 74000,
      premium: 500,
      iv: 18,
      daysToExpiry: 30,
      lots: 2,
    };
    const futuresPrice = 6523;
    const riskFreeRate = 6.5;

    const result = recomputeLegForInstrument(leg, crudeOil, futuresPrice, riskFreeRate);

    // Strike should land on the new instrument's ATM strike grid.
    const strikeGap = getStrikeGap(crudeOil, futuresPrice);
    const expectedStrike = roundToStrike(futuresPrice, strikeGap);
    expect(result.strikePrice).toBe(expectedStrike);
    expect(Math.abs(result.strikePrice - futuresPrice)).toBeLessThanOrEqual(strikeGap);

    // Premium should be the theoretical Black-76 price at the leg's existing
    // IV/DTE, rounded to the new instrument's tick size (1 for Crude Oil).
    const T = leg.daysToExpiry / 365;
    const r = riskFreeRate / 100;
    const sigma = leg.iv / 100;
    const expectedPremium = Math.round(
      black76Price(futuresPrice, expectedStrike, T, r, sigma, leg.optionType)
    );
    expect(result.premium).toBeCloseTo(expectedPremium, 5);
    expect(Number.isInteger(result.premium)).toBe(true);

    // Everything else about the leg is preserved.
    expect(result.instrument).toBe(crudeOil);
    expect(result.positionType).toBe('BUY');
    expect(result.optionType).toBe('CE');
    expect(result.iv).toBe(18);
    expect(result.daysToExpiry).toBe(30);
    expect(result.lots).toBe(2);
    expect(result.id).toBe('leg-1');
  });

  it('rounds premium to a fractional tick size for instruments like Natural Gas (0.10)', () => {
    const natGas = MCX_INSTRUMENTS.find((i) => i.symbol === 'NATURALGAS')!;
    const leg: OptionLeg = {
      id: 'leg-2',
      instrument: DEFAULT_INSTRUMENT,
      positionType: 'SELL',
      optionType: 'PE',
      strikePrice: 74000,
      premium: 500,
      iv: 25,
      daysToExpiry: 12,
      lots: 1,
    };
    const futuresPrice = 245.3;
    const riskFreeRate = 6.5;

    const result = recomputeLegForInstrument(leg, natGas, futuresPrice, riskFreeRate);

    // Premium must be a multiple of the 0.10 tick size (not rounded to a whole rupee).
    const scaled = Math.round(result.premium / 0.1);
    expect(scaled * 0.1).toBeCloseTo(result.premium, 6);

    expect(result.instrument).toBe(natGas);
    expect(result.positionType).toBe('SELL');
    expect(result.optionType).toBe('PE');
    expect(result.iv).toBe(25);
    expect(result.daysToExpiry).toBe(12);
    expect(result.lots).toBe(1);
  });
});
